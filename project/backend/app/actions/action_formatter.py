"""
Action Formatter that normalizes VLM action plans and injects CDP pixel coordinates.
Handles various Qwen VL output quirks and ensures correct action types.
"""

from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

from app.schemas.browser_state import BrowserState, ElementState

logger = logging.getLogger("lensagent.actions")


class ActionFormatter:
    """Formats and enriches VLM actions for LensAgent's ActionExecutor."""

    def format_actions(
        self,
        raw_actions: List[Dict[str, Any]],
        browser_state: BrowserState,
        available_keys: Optional[List[str]] = None,
    ) -> List[Dict[str, Any]]:
        element_map: Dict[str, ElementState] = {
            e.element_id: e for e in browser_state.elements
        }
        viewport = browser_state.page.viewport

        # Build a set of vault token strings for matching
        vault_tokens: Dict[str, str] = {}
        for k in (available_keys or []):
            # k is like "<VAULT_FULL_NAME>" - extract the inner key
            inner = k.strip("<>").lower()
            vault_tokens[inner] = k
            # Also store without VAULT_ prefix for fuzzy match
            if inner.startswith("vault_"):
                vault_tokens[inner[6:]] = k

        formatted: List[Dict[str, Any]] = []

        for i, raw in enumerate(raw_actions, start=1):
            act = dict(raw)
            raw_type = str(act.get("type") or act.get("action") or "").strip().upper()
            target_id = act.get("target") or act.get("element_id") or ""
            element = element_map.get(target_id)

            # Compute element center coordinates from bbox if available
            center_x: Optional[float] = None
            center_y: Optional[float] = None
            if element and element.bbox and len(element.bbox) >= 4:
                bx, by, bw, bh = element.bbox[0], element.bbox[1], element.bbox[2], element.bbox[3]
                center_x = round(bx + (bw / 2.0))
                center_y = round(by + (bh / 2.0))

            action_id = act.get("action_id") or f"a{i}"
            item: Dict[str, Any] = {"action_id": action_id}

            if raw_type in ("TYPE", "FILL", "VAULT_FILL"):
                val = act.get("text") or act.get("value") or act.get("key") or ""
                val = self._resolve_vault_token(val, vault_tokens)

                # If element is actually a select dropdown, convert to SELECT
                effective_tag = (element.tag or "").lower() if element else ""
                effective_role = (element.role or "").lower() if element else ""
                is_select = effective_tag == "select" or effective_role == "combobox"

                if is_select:
                    item["type"] = "SELECT"
                    item["target"] = target_id
                    item["x"] = act.get("x") if act.get("x") is not None else center_x
                    item["y"] = act.get("y") if act.get("y") is not None else center_y
                    item["optionText"] = val
                    item["text"] = val
                else:
                    item["type"] = "TYPE"
                    item["target"] = target_id
                    item["x"] = act.get("x") if act.get("x") is not None else center_x
                    item["y"] = act.get("y") if act.get("y") is not None else center_y
                    item["text"] = val
                    item["press_enter"] = bool(act.get("press_enter") or act.get("pressEnter", False))

            elif raw_type in ("CLICK", "CHECK", "UNCHECK", "DOUBLE_CLICK", "HOVER"):
                if raw_type == "DOUBLE_CLICK":
                    item["type"] = "DOUBLE_CLICK"
                elif raw_type == "HOVER":
                    item["type"] = "HOVER"
                else:
                    item["type"] = "CLICK"
                item["target"] = target_id
                item["x"] = act.get("x") if act.get("x") is not None else center_x
                item["y"] = act.get("y") if act.get("y") is not None else center_y
                # Carry a vault-token value through so the client can decode and
                # auto-adapt radio/checkbox/select selection (e.g. CLICK text=<VAULT_GENDER>).
                clk_val = act.get("text") or act.get("value") or act.get("optionText") or act.get("key") or ""
                if clk_val:
                    clk_val = self._resolve_vault_token(clk_val, vault_tokens)
                    item["text"] = clk_val

            elif raw_type in ("SCROLL", "SCROLL_DOWN", "SCROLL_UP"):
                item["type"] = "SCROLL"
                item["x"] = act.get("x") if act.get("x") is not None else round(viewport.width / 2.0)
                item["y"] = act.get("y") if act.get("y") is not None else round(viewport.height / 2.0)
                delta = act.get("delta_y") or act.get("amount") or 400
                direction = str(act.get("direction", "down")).lower()
                if direction == "up" or raw_type == "SCROLL_UP":
                    item["delta_y"] = -abs(delta)
                else:
                    item["delta_y"] = abs(delta)
                item["delta_x"] = act.get("delta_x", 0)

            elif raw_type == "SELECT":
                opt = act.get("optionText") or act.get("value") or act.get("text") or act.get("key") or ""
                opt = self._resolve_vault_token(opt, vault_tokens)

                effective_tag = (element.tag or "").lower() if element else ""
                effective_role = (element.role or "").lower() if element else ""
                is_input = effective_tag in ("input", "textarea") and effective_role not in ("combobox", "listbox")

                if is_input:
                    item["type"] = "TYPE"
                    item["target"] = target_id
                    item["x"] = act.get("x") if act.get("x") is not None else center_x
                    item["y"] = act.get("y") if act.get("y") is not None else center_y
                    item["text"] = opt
                    item["press_enter"] = False
                else:
                    item["type"] = "SELECT"
                    item["target"] = target_id
                    item["x"] = act.get("x") if act.get("x") is not None else center_x
                    item["y"] = act.get("y") if act.get("y") is not None else center_y
                    item["optionText"] = opt
                    item["text"] = opt

            elif raw_type == "PRESS_KEY":
                item["type"] = "PRESS_KEY"
                item["key"] = act.get("key") or "Enter"

            elif raw_type == "WAIT":
                item["type"] = "WAIT"
                item["duration_ms"] = act.get("duration_ms") or 1000

            elif raw_type in ("FINISH", "TERMINATE", "DONE"):
                item["type"] = "FINISH"
                item["text"] = act.get("text") or "Form completion signaled"

            elif raw_type == "ASK_USER":
                item["type"] = "ASK_USER"
                item["question"] = act.get("question") or "Please provide the requested information"
                item["vaultKey"] = act.get("vaultKey") or act.get("key")
                item["target"] = target_id
                item["x"] = act.get("x") if act.get("x") is not None else center_x
                item["y"] = act.get("y") if act.get("y") is not None else center_y

            elif raw_type == "NAVIGATE":
                item["type"] = "NAVIGATE"
                item["url"] = act.get("url") or ""

            else:
                # Pass through with coordinates if resolvable
                item["type"] = raw_type or "CLICK"
                item["target"] = target_id
                item["x"] = center_x
                item["y"] = center_y
                if "text" in act:
                    item["text"] = act["text"]

            formatted.append(item)

        return formatted

    def _resolve_vault_token(self, val: str, vault_tokens: Dict[str, str]) -> str:
        """Resolve a value to a proper vault token if it matches a known key."""
        if not val:
            return val

        # Already a proper vault token
        if val.startswith("<VAULT_") and val.endswith(">"):
            return val

        # Try to match against known vault tokens
        val_lower = val.lower().strip()

        # Direct match (e.g. "full_name" → "<VAULT_FULL_NAME>")
        if val_lower in vault_tokens:
            return vault_tokens[val_lower]

        # Match without VAULT_ prefix (e.g. "VAULT_FULL_NAME" → "<VAULT_FULL_NAME>")
        if val_lower.startswith("vault_") and val_lower[6:] in vault_tokens:
            return vault_tokens[val_lower[6:]]

        # Match with VAULT_ prefix added (e.g. "FULL_NAME" → "<VAULT_FULL_NAME>")
        check_key = f"vault_{val_lower}"
        if check_key in vault_tokens:
            return vault_tokens[check_key]

        return val
