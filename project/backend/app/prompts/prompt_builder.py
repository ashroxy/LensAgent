"""
Tri-stream prompt builder integrating Accessibility Tree, DOM Snapshot,
Coordinates, Available Client Vault Keys, and Multi-turn Session History.
Optimized for Qwen2.5-VL-32B-Instruct (Groq Cloud).
"""

from __future__ import annotations

import json
from typing import Any, Dict, List, Optional, Tuple

from app.schemas.browser_state import BrowserState, ElementState


class PromptBuilder:
    """Constructs token-efficient, highly structured prompts for Qwen2.5-VL."""

    def build(
        self,
        task: str,
        browser_state: BrowserState,
        available_keys: Optional[List[str]] = None,
        completed_actions: Optional[List[Dict[str, Any]]] = None,
        field_fill_history: Optional[Dict[str, Any]] = None,
        phase: str = "fill",
        summary: str = "",
        validation_feedback: Optional[List[Dict[str, Any]]] = None,
    ) -> str:
        keys = available_keys or []
        filled_history = field_fill_history or {}

        # The client's DOM checklist is authoritative for whether a field is actually
        # filled: it already handles radio groups (any checked member fills the group)
        # and checkboxes. Prefer its 'filled' list over viewport heuristics so that
        # elements scrolled above the viewport are not repeatedly re-surfaced as
        # pending (which caused an infinite scroll loop).
        checklist = browser_state.checklist or {}
        client_filled = set(checklist.get("filled", []) or [])

        # Categorize elements by viewport visibility
        visible_elements, offscreen_elements = self._split_by_viewport(browser_state)

        # Categorize interactive elements by completion state
        pending_visible, completed_visible = self._categorize_elements(
            visible_elements, filled_history, client_filled
        )
        pending_offscreen, _ = self._categorize_elements(
            offscreen_elements, filled_history, client_filled
        )

        all_completed = len(pending_visible) == 0 and len(pending_offscreen) == 0
        needs_scroll = len(pending_offscreen) > 0 and len(pending_visible) == 0

        parts: List[str] = []

        # System objective & output requirements
        parts.append(
            "You are LensAgent, an autonomous browser form-filling agent.\n"
            "Analyze the REDACTED webpage screenshot and the structured element tree below.\n"
            "Produce structured actions to automate and complete the form.\n"
            "Return ONLY a single valid JSON object. No markdown, no backticks, no commentary."
        )

        # Task & Context
        if task:
            parts.append(f"\nTASK: {task}")
        if phase:
            parts.append(f"PHASE: {phase}")
        if summary:
            parts.append(f"HISTORY: {summary}")

        # Validation feedback from previous step
        if validation_feedback:
            parts.append("\nVALIDATION RESULTS FROM PREVIOUS STEP:")
            for vf in validation_feedback:
                eid = vf.get("element_id", "?")
                ok = "OK" if vf.get("filled") else "FAILED"
                parts.append(f"  - Element '{eid}': {ok} (actual_value='{vf.get('actual_value', '')}')")

        # Client Vault Keys
        if keys:
            parts.append("\nAVAILABLE VAULT TOKENS (use these exact tokens for personal data):")
            for k in keys:
                parts.append(f"  {k}")

        # Completed fields (only client-confirmed fills count as already filled).
        confirmed_history = {
            eid: info for eid, info in filled_history.items()
            if info.get("confirmed")
        }
        if confirmed_history:
            parts.append("\nALREADY FILLED - VERIFIED AND COMPLETE. DO NOT MODIFY, RE-FILL, OR REVISIT THESE FIELDS:")
            for eid, info in list(confirmed_history.items())[-15:]:
                val = info.get("key") or info.get("value") or "done"
                parts.append(f"  - '{eid}' → {val}")

        # Visible interactive elements
        if pending_visible:
            parts.append(f"\nVISIBLE UNFILLED ELEMENTS (fill these NOW):")
            for line in pending_visible:
                parts.append(f"  {line}")

        if completed_visible:
            parts.append(f"\nVISIBLE FILLED ELEMENTS:")
            for line in completed_visible:
                parts.append(f"  {line}")

        # Off-screen elements
        if pending_offscreen:
            parts.append(f"\nOFFSCREEN ELEMENTS ({len(pending_offscreen)} remaining below viewport):")
            for line in pending_offscreen[:8]:
                parts.append(f"  {line}")
            if len(pending_offscreen) > 8:
                parts.append(f"  ... and {len(pending_offscreen) - 8} more")

        # Action specification rules
        parts.append(
            "\nACTION RULES:\n"
            "1. ONLY act on VISIBLE UNFILLED ELEMENTS in this turn.\n"
            "2. For text inputs: {\"type\": \"TYPE\", \"target\": \"<element_id>\", \"text\": \"<VAULT_TOKEN>\"}\n"
            "3. For checkboxes/radios: emit {\"type\": \"CLICK\", \"target\": \"<element_id>\", \"text\": \"<VAULT_TOKEN>\"}. "
            "The client DECODES the vault token and auto-checks the matching radio/checkbox in the group — do NOT guess a specific option id.\n"
            "4. For dropdowns/selects: {\"type\": \"SELECT\", \"target\": \"<element_id>\", \"optionText\": \"<VAULT_TOKEN>\"}. "
            "The client decodes the token and auto-selects the matching option.\n"
            "5. For submit buttons: {\"type\": \"CLICK\", \"target\": \"<element_id>\"}\n"
            "6. If no vault token matches a field: {\"type\": \"ASK_USER\", \"target\": \"<element_id>\", \"question\": \"What is your <field>?\"}. "
            "ASK_USER MUST always include a real \"target\" (an element_id from the list) — it is for asking the user for a field VALUE only. "
            "NEVER use ASK_USER to request the screenshot, element tree, DOM, page source, or any context you were already given; those are always available to you and require no action.\n"
            "7. If all visible filled but offscreen remain: {\"type\": \"SCROLL\", \"delta_y\": 400, \"direction\": \"down\"}\n"
            "8. DO NOT RE-FILL OR TOUCH any field listed under ALREADY FILLED - VERIFIED AND COMPLETE. They are finished; never emit an action for them. "
            "Only act on elements listed under VISIBLE UNFILLED ELEMENTS or OFFSCREEN ELEMENTS.\n"
            "9. NEVER invent or guess element_ids. Use ONLY the exact element_id values listed above in this prompt. If an element is not listed, it does not exist — do not act on it and do not reference it.\n"
            "10. FINISH ONLY when EVERY form field (all VISIBLE UNFILLED and OFFSCREEN ELEMENTS listed above) is genuinely filled/checked AND the submit button has been clicked. "
            "If the task lists required fields (e.g. company, years of experience, terms checkbox) that appear in the OFFSCREEN list, you MUST fill them before FINISH. "
            "Do NOT emit FINISH merely because earlier fields were filled. Prefer continuing to fill remaining fields over finishing.\n"
        )

        if needs_scroll:
            parts.append(
                "\nNOTE: All visible elements are complete. Offscreen elements remain.\n"
                "Add a SCROLL action as the LAST action: {\"type\": \"SCROLL\", \"delta_y\": 400, \"direction\": \"down\"}"
            )

        # Expected JSON format
        parts.append(
            '\nRESPONSE FORMAT (JSON object only):\n'
            '{\n'
            '  "thought": "Brief reasoning for actions chosen",\n'
            '  "status": "continue",\n'
            '  "actions": [\n'
            '    {"type": "TYPE", "target": "element_id", "text": "<VAULT_TOKEN>"},\n'
            '    {"type": "CLICK", "target": "radio_or_checkbox_id", "text": "<VAULT_TOKEN>"},\n'
            '    {"type": "SELECT", "target": "element_id", "optionText": "<VAULT_TOKEN>"},\n'
            '    {"type": "SCROLL", "delta_y": 400, "direction": "down"},\n'
            '    {"type": "FINISH", "text": "Form completed"}\n'
            '  ]\n'
            '}'
        )

        return "\n".join(parts)

    def _split_by_viewport(
        self, browser_state: BrowserState
    ) -> Tuple[List[ElementState], List[ElementState]]:
        """Splits elements into visible vs. off-screen based on scroll and viewport bounds."""
        viewport = browser_state.page.viewport

        visible: List[ElementState] = []
        offscreen: List[ElementState] = []

        for e in browser_state.elements:
            if not e.bbox or len(e.bbox) < 4:
                if e.visible:
                    visible.append(e)
                else:
                    offscreen.append(e)
                continue

            bx, by, bw, bh = e.bbox[0], e.bbox[1], e.bbox[2], e.bbox[3]
            rel_top = by
            rel_bottom = by + bh

            # An element fully above the viewport (bottom <= 0) has already been
            # scrolled past; it cannot be reached by scrolling DOWN. Do not surface
            # it as an offscreen/needs-scroll element or the agent will chase it in
            # an infinite scroll-down loop. (Verified-filled fields are excluded by
            # the checklist in _categorize_elements regardless.)
            if rel_bottom <= 0:
                continue

            if rel_top < viewport.height:
                visible.append(e)
            else:
                offscreen.append(e)

        return visible, offscreen

    def _categorize_elements(
        self,
        elements: List[ElementState],
        filled_history: Dict[str, Any],
        client_filled: Optional[set] = None,
    ) -> Tuple[List[str], List[str]]:
        """Separates elements into pending vs completed descriptions."""
        pending: List[str] = []
        completed: List[str] = []
        client_filled = client_filled or set()

        for e in elements:
            role = (e.role or "generic").lower()
            tag = (e.tag or "").lower()

            # Include all interactive elements - textbox, button, checkbox, radio, combobox, link, and also generic inputs
            is_interactive = role in ("textbox", "button", "checkbox", "radio", "combobox", "link") or \
                             tag in ("input", "select", "textarea", "button", "a")
            if not is_interactive:
                continue

            eid = e.element_id
            label = e.label or e.placeholder or e.text or eid
            val = e.value or ""
            # A field counts as "filled" when it was client-verified, OR it is in
            # filled_history with a confirmed entry (verified by client validation),
            # OR it currently holds a real value on the page.
            hist_confirmed = bool(filled_history.get(eid, {}).get("confirmed"))
            is_filled = (
                eid in client_filled
                or hist_confirmed
                or (val and val != "empty" and not val.startswith("<"))
            )

            # For input elements without explicit role, infer role from tag/type
            effective_role = role
            if role == "generic" and tag == "input":
                input_type = (e.type or "text").lower()
                if input_type in ("checkbox", "radio"):
                    effective_role = input_type
                elif input_type in ("submit", "button", "reset"):
                    effective_role = "button"
                else:
                    effective_role = "textbox"
            elif role == "generic" and tag == "select":
                effective_role = "combobox"
            elif role == "generic" and tag == "textarea":
                effective_role = "textbox"

            if effective_role == "textbox":
                if is_filled:
                    completed.append(f"id='{eid}', type=textbox, label='{label}', value='{val[:30]}'")
                else:
                    placeholder = e.placeholder or ""
                    parts_str = f"id='{eid}', type=textbox, label='{label}'"
                    if placeholder:
                        parts_str += f", placeholder='{placeholder}'"
                    parts_str += f", bbox={e.bbox}"
                    pending.append(parts_str)

            elif effective_role in ("checkbox", "radio"):
                state = "CHECKED" if e.checked else "UNCHECKED"
                # A radio/checkbox counts as done if the CLIENT verified it filled
                # (this is group-aware: any checked radio fills the whole group, and
                # an unchecked radio sibling of a chosen option is therefore NOT
                # a pending field). Otherwise it must actually be checked to be done.
                if eid in client_filled or e.checked:
                    completed.append(f"id='{eid}', type={effective_role}, label='{label}' ({state})")
                else:
                    pending.append(f"id='{eid}', type={effective_role}, label='{label}', bbox={e.bbox}")

            elif effective_role == "combobox":
                if is_filled or e.selected:
                    completed.append(f"id='{eid}', type=select, label='{label}' (SELECTED: '{val}')")
                else:
                    pending.append(f"id='{eid}', type=select, label='{label}', bbox={e.bbox}")

            elif effective_role == "button":
                pending.append(f"id='{eid}', type=button, label='{label}', bbox={e.bbox}")

        return pending, completed
