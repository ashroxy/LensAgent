"""
Action validator ensuring safety, element reachability, and fuzzy target resolution.
"""

from __future__ import annotations

import logging
import re
from typing import Any, Dict, List, Optional, Tuple

from app.config.settings import settings
from app.schemas.browser_state import BrowserState, ElementState

logger = logging.getLogger("lensagent.validation")

FORBIDDEN_PATTERNS = [
    r"javascript\s*:",
    r"<script",
    r"eval\s*\(",
    r"exec\s*\(",
    r"import\s+os",
    r"subprocess",
    r"__import__",
]


def _fuzzy_match_element(target: str, elements: List[ElementState]) -> Optional[str]:
    """Matches a target name against element IDs, labels, or placeholders."""
    if not target:
        return None

    cleaned = target.lower().replace("_", "").replace("-", "").replace(" ", "")
    best_match: Optional[str] = None
    best_score = 0

    for el in elements:
        eid = el.element_id.lower().replace("_", "").replace("-", "").replace(" ", "")
        label = (el.label or "").lower().replace("_", "").replace("-", "").replace(" ", "")
        text = (el.text or "").lower().replace("_", "").replace("-", "").replace(" ", "")

        # Exact match on element_id
        if cleaned == eid:
            return el.element_id

        # Exact match on label
        if label and cleaned == label:
            if best_score < 3:
                best_match = el.element_id
                best_score = 3

        # Substring containment
        if eid and cleaned in eid:
            if best_score < 2:
                best_match = el.element_id
                best_score = 2
        if label and cleaned in label:
            if best_score < 2:
                best_match = el.element_id
                best_score = 2
        if text and cleaned in text:
            if best_score < 1:
                best_match = el.element_id
                best_score = 1

    return best_match


class ActionValidator:
    """Validates action plans before transmitting to the client."""

    def validate(
        self,
        actions: List[Dict[str, Any]],
        browser_state: BrowserState,
        available_keys: Optional[List[str]] = None,
    ) -> Tuple[List[Dict[str, Any]], List[str]]:
        valid_actions: List[Dict[str, Any]] = []
        errors: List[str] = []

        element_ids = {e.element_id for e in browser_state.elements}

        for act in actions:
            act_id = act.get("action_id", "a?")
            act_type = str(act.get("type", "")).upper()
            target = act.get("target")

            # Validate action type
            supported = settings.SUPPORTED_ACTION_TYPES
            if act_type not in supported and act_type.lower() not in supported:
                # Try common aliases
                alias_map = {
                    "FILL": "TYPE",
                    "INPUT": "TYPE",
                    "SUBMIT": "CLICK",
                    "PRESS": "PRESS_KEY",
                    "TAP": "CLICK",
                    "CHOICE": "SELECT",
                }
                alias = alias_map.get(act_type)
                if alias:
                    act["type"] = alias
                    act_type = alias
                else:
                    errors.append(f"[{act_id}] Unsupported action type '{act_type}'")
                    continue

            # For actions that require a target, validate the target exists
            if act_type in ("TYPE", "CLICK", "DOUBLE_CLICK", "SELECT", "HOVER", "ASK_USER"):
                if target and target not in element_ids:
                    matched = _fuzzy_match_element(target, browser_state.elements)
                    if matched:
                        logger.debug("Fuzzy-matched target '%s' → '%s'", target, matched)
                        act["target"] = matched
                        target = matched
                    else:
                        logger.warning(
                            "[%s] Target '%s' not found in %d elements. Passing through.",
                            act_id, target, len(element_ids),
                        )

            # Security sanitization on text/values
            act_str = str(act).lower()
            if any(re.search(pat, act_str) for pat in FORBIDDEN_PATTERNS):
                errors.append(f"[{act_id}] Potential script injection pattern detected")
                continue

            valid_actions.append(act)

        return valid_actions, errors
