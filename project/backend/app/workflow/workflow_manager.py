"""
Workflow manager controlling multi-turn form automation lifecycle, completion,
loop prevention, and automatic scrolling.
"""

from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional, Tuple

from app.config.settings import settings
from app.schemas.browser_state import BrowserState
from app.schemas.session import SessionData

logger = logging.getLogger("lensagent.workflow")

SUCCESS_KEYWORDS = {
    "submitted",
    "success",
    "thank you",
    "confirmation",
    "confirmed",
    "complete",
    "completed",
    "congratulations",
    "application submitted",
    "form submitted",
    "order received",
    "registration complete",
}


class WorkflowManager:
    """Manages the autonomous execution loop across multiple perception-action cycles."""

    def update_after_execution(
        self,
        session: SessionData,
        current_state_hash: str,
        execution_results: List[Dict[str, Any]],
    ) -> None:
        session.previous_browser_state_hash = session.last_browser_state_hash
        session.last_browser_state_hash = current_state_hash
        session.step_index += 1

        # Check execution failures
        failed_count = sum(1 for res in execution_results if not res.get("success", True))
        if failed_count > 0:
            session.retry_count += 1
            logger.warning(
                "Session %s: %d action(s) failed on client. Retry count: %d",
                session.session_id,
                failed_count,
                session.retry_count,
            )
        else:
            session.retry_count = 0

        session.touch_updated()

    def check_completion(
        self,
        session: SessionData,
        current_state: BrowserState,
        vlm_status: str,
        validation_feedback: Optional[List[Dict[str, Any]]] = None,
    ) -> Tuple[bool, str]:
        """Evaluates whether the form goal has been achieved."""
        # Check URL and title for success text
        page_text = (current_state.page.title + " " + current_state.page.url).lower()
        for kw in SUCCESS_KEYWORDS:
            if kw in page_text:
                return True, f"Success indicator detected in page: '{kw}'"

        # Check client-side DOM checklist if available
        if current_state.checklist:
            unfilled_vis = current_state.checklist.get("unfilled_visible", [])
            unfilled_off = current_state.checklist.get("unfilled_offscreen", [])
            total_unfilled = len(unfilled_vis) + len(unfilled_off)
            if total_unfilled > 0:
                logger.info(
                    "Session %s: DOM checklist indicates %d unfilled fields (visible: %s, offscreen: %s)",
                    session.session_id,
                    total_unfilled,
                    unfilled_vis,
                    unfilled_off,
                )
                return False, f"{total_unfilled} fields remain unfilled (visible: {unfilled_vis})"

        # Collect interactive form elements as fallback
        interactive_elements = [
            e for e in current_state.elements
            if (e.role or "").lower() in ("textbox", "checkbox", "combobox", "radio")
            or (e.tag or "").lower() in ("input", "select", "textarea")
        ]

        if not interactive_elements:
            if vlm_status in ("done", "finished", "completed"):
                return True, "Task completed"
            return False, ""

        # Verify whether all interactive elements on the page have been filled
        # Use validation_feedback to determine truly filled elements
        confirmed_fills = set()
        failed_fills = set()
        if validation_feedback:
            for vf in validation_feedback:
                eid = vf.get("element_id", "")
                if vf.get("filled"):
                    confirmed_fills.add(eid)
                else:
                    failed_fills.add(eid)

        unfilled = []
        for el in interactive_elements:
            eid = el.element_id
            if not eid:
                continue
            # Skip submit / button inputs
            if el.type in ("submit", "button", "reset"):
                continue
            # Skip if confirmed by validation
            if eid in confirmed_fills:
                continue
            # Check if in fill history and confirmed
            if eid in session.field_fill_history:
                if session.field_fill_history[eid].get("confirmed"):
                    continue
            # Skip if validation explicitly failed (means we need to retry, not complete)
            if eid in failed_fills:
                unfilled.append(eid)
                continue
            # Check if field is actually filled on the page
            el_role = (el.role or "").lower()
            el_type = (el.type or "").lower()
            # Radios/checkboxes are only filled when actually checked — their
            # `value` attribute is non-empty even when unchecked.
            if el_role in ("radio", "checkbox") or el_type in ("radio", "checkbox"):
                if el.checked:
                    continue
                unfilled.append(eid)
                continue
            val = el.value or ""
            if val and val.strip() and val != "empty" and not val.startswith("<"):
                continue
            unfilled.append(eid)

        if unfilled:
            logger.info("Session %s: %d fields remain unfilled (%s)", session.session_id, len(unfilled), unfilled[:5])
            return False, f"{len(unfilled)} fields remain unfilled"

        # If all fields are recorded as filled, check if submit button was clicked
        if any(str(a.get("type", "")).upper() == "CLICK" for a in session.completed_actions) or vlm_status in ("done", "finished", "completed"):
            return True, "All form fields filled and form submission completed"

        return False, ""

    def ensure_scroll_if_needed(
        self,
        actions: List[Dict[str, Any]],
        browser_state: BrowserState,
    ) -> List[Dict[str, Any]]:
        """Ensures that if off-screen elements exist and no actions target visible fields, a scroll is added."""
        has_scroll = any(str(a.get("type", "")).upper() == "SCROLL" for a in actions)
        if has_scroll:
            return actions

        viewport = browser_state.page.viewport

        # If client checklist exists, use it directly
        if browser_state.checklist:
            unfilled_vis = browser_state.checklist.get("unfilled_visible", [])
            unfilled_off = browser_state.checklist.get("unfilled_offscreen", [])
            if not unfilled_vis and unfilled_off:
                actions.append({
                    "action_id": f"a{len(actions) + 1}",
                    "type": "SCROLL",
                    "x": round(viewport.width / 2.0),
                    "y": round(viewport.height / 2.0),
                    "delta_y": 400,
                    "direction": "down",
                })
                logger.info("Auto-appended SCROLL action from DOM checklist for off-screen fields: %s", unfilled_off)
                return actions

        has_unfilled_offscreen = False
        for el in browser_state.elements:
            if (el.role or "").lower() not in ("textbox", "checkbox", "combobox", "button", "radio"):
                continue

            # Skip elements already filled on the page (textbox with a value, or a
            # checked radio/checkbox) — they do not need to be revealed by scrolling.
            if el.role in ("radio", "checkbox") or (el.type or "").lower() in ("radio", "checkbox"):
                if el.checked:
                    continue
            else:
                ev = el.value or ""
                if ev and ev.strip() and ev != "empty" and not ev.startswith("<"):
                    continue

            if el.bbox and len(el.bbox) >= 4:
                by, bh = el.bbox[1], el.bbox[3]
                # Only elements FULLY BELOW the viewport need a scroll-DOWN to reveal
                # them. Elements above the viewport (by < 0) were already scrolled past
                # and cannot be reached by scrolling down — including them caused an
                # infinite scroll loop on the gender radios.
                if by + bh > viewport.height:
                    has_unfilled_offscreen = True
                    break

        # If there are no actions or only actions that don't reveal offscreen elements, append scroll
        if has_unfilled_offscreen and (not actions or all(str(a.get("type", "")).upper() == "TYPE" for a in actions)):
            actions.append({
                "action_id": f"a{len(actions) + 1}",
                "type": "SCROLL",
                "x": round(viewport.width / 2.0),
                "y": round(viewport.height / 2.0),
                "delta_y": 400,
                "direction": "down",
            })
            logger.info("Auto-appended SCROLL action to reveal off-screen fields")

        return actions

    def detect_loop(self, session: SessionData) -> bool:
        """Detects if agent is stuck in the same state across retries."""
        if (
            session.last_browser_state_hash
            and session.last_browser_state_hash == session.previous_browser_state_hash
            and session.retry_count >= settings.MAX_RETRIES
        ):
            logger.error("Session %s: Loop detected (identical state after %d retries)", session.session_id, session.retry_count)
            return True
        return False
