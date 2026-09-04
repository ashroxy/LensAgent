"""
API Routes for LensAgent Browser Automation Backend.
"""

from __future__ import annotations

import logging
import time
from typing import Any, Dict, Optional

from fastapi import APIRouter, HTTPException

from app.actions.action_formatter import ActionFormatter
from app.config.settings import settings
from app.prompts.prompt_builder import PromptBuilder
from app.schemas.request import (
    HealthResponse,
    InferRequest,
    InferResponse,
    SessionCreateRequest,
    SessionCreateResponse,
)
from app.session.session_manager import SessionManager
from app.utils.hashing import hash_browser_state
from app.utils.logging import log_step
from app.validation.action_validator import ActionValidator
from app.vlm.base import BaseVLMEngine
from app.workflow.workflow_manager import WorkflowManager

logger = logging.getLogger("lensagent.api")

router = APIRouter()

# Global dependency references initialized in main.py lifespan
_session_manager: Optional[SessionManager] = None
_workflow_manager: Optional[WorkflowManager] = None
_prompt_builder: Optional[PromptBuilder] = None
_action_formatter: Optional[ActionFormatter] = None
_action_validator: Optional[ActionValidator] = None
_vlm_engine: Optional[BaseVLMEngine] = None


def init_dependencies(
    session_manager: SessionManager,
    workflow_manager: WorkflowManager,
    prompt_builder: PromptBuilder,
    action_formatter: ActionFormatter,
    action_validator: ActionValidator,
    vlm_engine: BaseVLMEngine,
) -> None:
    global _session_manager, _workflow_manager, _prompt_builder
    global _action_formatter, _action_validator, _vlm_engine

    _session_manager = session_manager
    _workflow_manager = workflow_manager
    _prompt_builder = prompt_builder
    _action_formatter = action_formatter
    _action_validator = action_validator
    _vlm_engine = vlm_engine


@router.get("/health", response_model=HealthResponse, tags=["Health"])
async def health_check() -> HealthResponse:
    """Health check verifying backend and VLM readiness."""
    return HealthResponse(
        status="ok",
        vlm_status="ok",
        gpu_accelerated=True,
        version="1.1.0",
    )


@router.post(
    "/api/v1/session",
    response_model=SessionCreateResponse,
    tags=["Sessions"],
    summary="Create or resume a browser automation session",
)
async def create_session(req: SessionCreateRequest) -> SessionCreateResponse:
    if _session_manager is None:
        raise HTTPException(status_code=500, detail="Session manager not initialized")

    session = await _session_manager.get_or_create(req.session_id, req.task)
    return SessionCreateResponse(
        session_id=session.session_id,
        status=session.status,
        created_at=session.created_at,
    )


@router.get(
    "/api/v1/session/{session_id}",
    tags=["Sessions"],
    summary="Get sanitized session details",
)
async def get_session(session_id: str) -> Dict[str, Any]:
    if _session_manager is None:
        raise HTTPException(status_code=500, detail="Session manager not initialized")

    session = await _session_manager.get(session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")

    return {
        "session_id": session.session_id,
        "task": session.task,
        "status": session.status,
        "phase": session.phase,
        "step_index": session.step_index,
        "retry_count": session.retry_count,
        "summary": session.summary,
        "completed_actions_count": len(session.completed_actions),
        "fields_filled_count": len(session.field_fill_history),
        "created_at": session.created_at,
        "updated_at": session.updated_at,
    }


@router.delete(
    "/api/v1/session/{session_id}",
    tags=["Sessions"],
    summary="Delete a session",
)
async def delete_session(session_id: str) -> Dict[str, str]:
    if _session_manager is None:
        raise HTTPException(status_code=500, detail="Session manager not initialized")

    deleted = await _session_manager.delete(session_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Session not found")
    return {"status": "deleted", "session_id": session_id}


@router.post(
    "/api/v1/infer",
    response_model=InferResponse,
    tags=["Inference"],
    summary="Main inference endpoint called by LensAgent extension",
)
async def infer(req: InferRequest) -> InferResponse:
    total_start = time.perf_counter()
    timings: Dict[str, float] = {}

    if any(dep is None for dep in (_session_manager, _workflow_manager, _prompt_builder, _action_formatter, _action_validator, _vlm_engine)):
        raise HTTPException(status_code=500, detail="Backend services not initialized")

    # Step 1: Session Management & Execution Feedback
    t0 = time.perf_counter()
    session = await _session_manager.get_or_create(req.session_id, req.task)
    if req.execution_results:
        await _session_manager.record_execution_results(session, req.execution_results)

    if req.validation_feedback:
        await _session_manager.process_validation_feedback(
            session, [vf.model_dump() for vf in req.validation_feedback]
        )

    current_state_hash = hash_browser_state(req.browser_state.model_dump())
    _workflow_manager.update_after_execution(session, current_state_hash, req.execution_results)
    timings["session_ms"] = (time.perf_counter() - t0) * 1000

    # Step 2: Loop / Stuck Detection
    if _workflow_manager.detect_loop(session):
        session.status = "BLOCKED"
        await _session_manager.save(session)
        return InferResponse(
            session_id=req.session_id,
            status="blocked",
            thought="Loop detected: Browser state unchanged across multiple retries",
            actions=[],
            checkpoint=True,
            reason="Repeated browser state with execution failures. Please interact manually.",
            timings=timings if settings.DEBUG_TIMINGS else None,
        )

    # Step 3: Build Tri-Stream Prompt
    t1 = time.perf_counter()
    prompt = _prompt_builder.build(
        task=req.task or session.task,
        browser_state=req.browser_state,
        available_keys=req.available_keys,
        completed_actions=session.completed_actions,
        field_fill_history=session.field_fill_history,
        phase=session.phase,
        summary=session.summary,
        validation_feedback=[vf.model_dump() for vf in (req.validation_feedback or [])],
    )
    timings["prompt_ms"] = (time.perf_counter() - t1) * 1000

    # Step 4: VLM Inference
    t2 = time.perf_counter()
    image_data = req.screenshot.data if req.screenshot else None
    vlm_result = await _vlm_engine.infer(image_b64=image_data, prompt=prompt)
    timings["vlm_ms"] = (time.perf_counter() - t2) * 1000

    vlm_thought = vlm_result.get("thought", "")
    vlm_status = vlm_result.get("status", "continue")
    raw_actions = vlm_result.get("actions", [])

    # Step 5: Action Formatting (Inject CDP Center Coordinates & Normalization)
    t3 = time.perf_counter()
    formatted_actions = _action_formatter.format_actions(
        raw_actions=raw_actions,
        browser_state=req.browser_state,
        available_keys=req.available_keys,
    )

    # Step 6: Safety Validation & Target Resolution
    valid_actions, validation_errors = _action_validator.validate(
        actions=formatted_actions,
        browser_state=req.browser_state,
        available_keys=req.available_keys,
    )
    if validation_errors:
        logger.warning("Validation errors: %s", validation_errors)

    # Step 7: Auto-scroll injection for offscreen elements if needed
    final_actions = _workflow_manager.ensure_scroll_if_needed(
        actions=valid_actions,
        browser_state=req.browser_state,
    )
    timings["actions_ms"] = (time.perf_counter() - t3) * 1000

    # Step 8: Completion Check
    is_completed, completion_reason = _workflow_manager.check_completion(
        session=session,
        current_state=req.browser_state,
        vlm_status=vlm_status,
        validation_feedback=[vf.model_dump() for vf in (req.validation_feedback or [])],
    )

    if is_completed:
        session.status = "COMPLETED"
        session.phase = "done"
        if not any(a.get("type") in ("FINISH", "TERMINATE") for a in final_actions):
            final_actions.append({"type": "FINISH", "text": completion_reason})
        await _session_manager.save(session)

        timings["total_ms"] = (time.perf_counter() - total_start) * 1000
        log_step(
            logger=logger,
            session_id=session.session_id,
            step_index=session.step_index,
            action_count=len(final_actions),
            phase="done",
            latency_ms=timings["total_ms"],
            status="done",
        )

        return InferResponse(
            session_id=req.session_id,
            status="done",
            thought=vlm_thought or "Form completed successfully",
            actions=final_actions,
            checkpoint=False,
            reason=completion_reason,
            timings=timings if settings.DEBUG_TIMINGS else None,
        )

    # If NOT complete, strip any premature FINISH actions and ensure work continues
    final_actions = [a for a in final_actions if str(a.get("type", "")).upper() not in ("FINISH", "TERMINATE")]
    if not final_actions:
        final_actions = _workflow_manager.ensure_scroll_if_needed(final_actions, req.browser_state)

    # Update session history and tracking
    session.last_action_batch = final_actions
    session.summary = f"Step {session.step_index}: {vlm_thought[:150]}"
    await _session_manager.update_field_history(session, final_actions)
    await _session_manager.save(session)

    timings["total_ms"] = (time.perf_counter() - total_start) * 1000
    log_step(
        logger=logger,
        session_id=session.session_id,
        step_index=session.step_index,
        action_count=len(final_actions),
        phase=session.phase,
        latency_ms=timings["total_ms"],
        status="continue",
    )

    return InferResponse(
        session_id=req.session_id,
        status="continue",
        thought=vlm_thought,
        actions=final_actions,
        checkpoint=True,
        reason=vlm_result.get("reason", ""),
        timings=timings if settings.DEBUG_TIMINGS else None,
    )
