"""
Session manager orchestrating session lifecycle, action history, and field tracking.
"""

from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

from app.schemas.session import SessionData
from app.storage.base import BaseSessionStore

logger = logging.getLogger("lensagent.session")


class SessionManager:
    """High-level manager for multi-turn browser automation sessions."""

    def __init__(self, store: BaseSessionStore) -> None:
        self._store = store

    async def get_or_create(self, session_id: str, task: str = "") -> SessionData:
        session = await self._store.get(session_id)
        if session is not None:
            if task and not session.task:
                session.task = task
                await self._store.update(session)
            return session

        session = SessionData(session_id=session_id, task=task)
        await self._store.create(session)
        logger.info("Initialized new session %s (Task: '%s')", session_id, task)
        return session

    async def get(self, session_id: str) -> Optional[SessionData]:
        return await self._store.get(session_id)

    async def save(self, session: SessionData) -> None:
        await self._store.update(session)

    async def delete(self, session_id: str) -> bool:
        return await self._store.delete(session_id)

    async def record_execution_results(
        self,
        session: SessionData,
        execution_results: List[Dict[str, Any]],
    ) -> None:
        """Records client-executed actions into the session's completed actions list."""
        if not execution_results:
            return

        for res in execution_results:
            action_type = res.get("action", "")
            success = res.get("success", True)
            if success:
                session.completed_actions.append(res)

        # Truncate completed actions history if too large (keep last 50)
        if len(session.completed_actions) > 50:
            session.completed_actions = session.completed_actions[-50:]

        session.touch_updated()
        await self._store.update(session)

    async def process_validation_feedback(
        self,
        session: SessionData,
        validation_feedback: List[Dict[str, Any]],
    ) -> None:
        """Process client-side validation feedback to confirm or correct field fill history.

        Each feedback item contains:
        - element_id: which element was targeted
        - filled: whether the field was actually filled
        - actual_value: what value was read back from the element
        - expected_value: what we tried to set
        """
        for vf in validation_feedback:
            eid = vf.get("element_id", "")
            filled = vf.get("filled", False)
            actual_value = vf.get("actual_value", "")
            expected_value = vf.get("expected_value", "")
            action_id = vf.get("action_id")

            # Log-safe string forms (actual/expected may be numbers or None).
            actual_s = "" if actual_value is None else str(actual_value)[:30]
            expected_s = "" if expected_value is None else str(expected_value)[:30]

            if not eid:
                continue

            if filled:
                # Field was successfully filled - mark as confirmed
                if eid in session.field_fill_history:
                    session.field_fill_history[eid]["confirmed"] = True
                    session.field_fill_history[eid]["actual_value"] = actual_value
                else:
                    # Create entry even if not previously tracked
                    session.field_fill_history[eid] = {
                        "type": "CONFIRMED",
                        "key": expected_value,
                        "value": actual_value,
                        "step": session.step_index,
                        "confirmed": True,
                        "actual_value": actual_value,
                    }
                logger.debug("Validation OK: '%s' filled with '%s'", eid, actual_s)
            else:
                # Field was NOT filled - remove from fill history so it gets retried
                if eid in session.field_fill_history:
                    del session.field_fill_history[eid]
                    logger.warning(
                        "Validation FAIL: '%s' not filled (expected='%s', actual='%s'). Removed from history for retry.",
                        eid, expected_s, actual_s,
                    )
                else:
                    logger.warning(
                        "Validation FAIL: '%s' not filled and not in history.", eid,
                    )

        session.touch_updated()
        await self._store.update(session)

    async def update_field_history(
        self,
        session: SessionData,
        actions: List[Dict[str, Any]],
    ) -> None:
        """Tracks which elements have been filled with which vault keys/values."""
        for act in actions:
            target = act.get("target")
            act_type = str(act.get("type", "")).upper()
            if target and act_type in ("TYPE", "FILL", "CHECK", "SELECT", "CLICK"):
                val = act.get("text") or act.get("optionText") or act.get("value") or act.get("key") or "completed"
                session.field_fill_history[target] = {
                    "type": act_type,
                    "key": act.get("key") or act.get("text") or act.get("optionText"),
                    "value": val,
                    "step": session.step_index,
                    "confirmed": False,  # Will be set to True by validation_feedback
                }
        session.touch_updated()
        await self._store.update(session)
