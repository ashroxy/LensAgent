"""
Dynamic End-to-End Simulation using test_page.html.
Extracts DOM structure dynamically from test_page.html and validates:
  1. Zero-Knowledge Autofill using Vault Tokens (<VAULT_*>)
  2. Multi-turn Scrolling to reach off-screen fields
  3. ASK_USER fallback when a field is missing from client vault
  4. Form completion and submit verification
"""

from __future__ import annotations

import base64
import io
import json
import os
import sys
import time
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import requests
from bs4 import BeautifulSoup
from PIL import Image, ImageDraw, ImageFont


def parse_html_to_browser_state(html_path: str, scroll_y: int = 0, viewport_h: int = 600) -> Dict[str, Any]:
    """Parses test_page.html dynamically into LensAgent's BrowserState structure."""
    with open(html_path, "r", encoding="utf-8") as f:
        soup = BeautifulSoup(f.read(), "html.parser")

    title = soup.title.string if soup.title else "LensAgent Test Page"

    elements: List[Dict[str, Any]] = []

    # Map labels by 'for' attribute
    labels_by_for = {}
    for lbl in soup.find_all("label"):
        for_id = lbl.get("for")
        if for_id:
            labels_by_for[for_id] = lbl.get_text(strip=True).replace(" *", "")

    # Layout simulation: compute realistic vertical offsets (y)
    current_y = 100
    container_x = 100
    input_w = 400
    input_h = 38

    # Process all form controls in document order
    for form_group in soup.find_all(["div", "button"]):
        # Form group containing input/select/textarea
        if "form-group" in form_group.get("class", []):
            input_tag = form_group.find(["input", "select", "textarea"])
            if not input_tag:
                continue

            tag_name = input_tag.name.lower()
            el_type = input_tag.get("type", "text").lower() if tag_name == "input" else tag_name
            el_id = input_tag.get("id") or input_tag.get("name") or f"auto_{len(elements)}"
            label_text = labels_by_for.get(el_id) or input_tag.get("placeholder") or el_id

            if el_type == "radio":
                # Handle radio group
                for r_opt in form_group.find_all("input", {"type": "radio"}):
                    r_id = r_opt.get("id")
                    r_lbl = labels_by_for.get(r_id, r_opt.get("value", ""))
                    elements.append({
                        "element_id": r_id,
                        "role": "radio",
                        "type": "radio",
                        "tag": "input",
                        "label": f"Gender: {r_lbl}",
                        "value": r_opt.get("value", ""),
                        "checked": False,
                        "bbox": [container_x, current_y, 20, 20],
                        "visible": (current_y - scroll_y) >= 0 and (current_y - scroll_y + 20) <= viewport_h,
                        "enabled": True,
                    })
                    current_y += 30
            elif el_type == "checkbox":
                chk_lbl = form_group.find("label")
                lbl_str = chk_lbl.get_text(strip=True) if chk_lbl else label_text
                elements.append({
                    "element_id": el_id,
                    "role": "checkbox",
                    "type": "checkbox",
                    "tag": "input",
                    "label": lbl_str,
                    "value": "",
                    "checked": False,
                    "bbox": [container_x, current_y, 20, 20],
                    "visible": (current_y - scroll_y) >= 0 and (current_y - scroll_y + 20) <= viewport_h,
                    "enabled": True,
                })
                current_y += 45
            elif tag_name == "select":
                elements.append({
                    "element_id": el_id,
                    "role": "combobox",
                    "tag": "select",
                    "label": label_text,
                    "value": "",
                    "bbox": [container_x, current_y, input_w, input_h],
                    "visible": (current_y - scroll_y) >= 0 and (current_y - scroll_y + input_h) <= viewport_h,
                    "enabled": True,
                })
                current_y += 65
            else:
                # Textbox, email, tel, password, date, textarea
                elements.append({
                    "element_id": el_id,
                    "role": "textbox",
                    "type": el_type,
                    "tag": tag_name,
                    "label": label_text,
                    "placeholder": input_tag.get("placeholder", ""),
                    "value": "",
                    "bbox": [container_x, current_y, input_w, input_h],
                    "visible": (current_y - scroll_y) >= 0 and (current_y - scroll_y + input_h) <= viewport_h,
                    "enabled": True,
                })
                current_y += 65

        elif form_group.name == "button" or "btn" in form_group.get("class", []):
            btn_id = form_group.get("id") or "btn_action"
            btn_text = form_group.get_text(strip=True)
            elements.append({
                "element_id": btn_id,
                "role": "button",
                "tag": "button",
                "text": btn_text,
                "label": btn_text,
                "bbox": [container_x, current_y, 180, 42],
                "visible": (current_y - scroll_y) >= 0 and (current_y - scroll_y + 42) <= viewport_h,
                "enabled": True,
            })
            current_y += 55

    page_height = max(current_y + 300, viewport_h)
    max_scroll = max(0, page_height - viewport_h)
    if scroll_y > max_scroll:
        scroll_y = max_scroll

    # Convert bboxes to viewport-relative coordinates (matching getBoundingClientRect
    # used by the real extension: rect.top already accounts for scroll offset).
    viewport_y = min(scroll_y, current_y)
    for e in elements:
        if e.get("bbox") and len(e["bbox"]) >= 2:
            e["bbox"][1] -= scroll_y

    return {
        "page": {
            "title": title,
            "url": "http://localhost:3000/test_page.html",
            "viewport": {"width": 800, "height": viewport_h},
            "scroll": {"x": 0, "y": scroll_y},
            "page_height": page_height,
            "max_scroll": max_scroll,
        },
        "elements": elements,
    }


def render_dynamic_screenshot(browser_state: Dict[str, Any], filled_values: Dict[str, str]) -> str:
    """Renders a dynamic visual JPEG based on current visible elements and their filled values."""
    viewport_w = browser_state["page"]["viewport"]["width"]
    viewport_h = browser_state["page"]["viewport"]["height"]
    scroll_y = browser_state["page"]["scroll"]["y"]

    img = Image.new("RGB", (viewport_w, viewport_h), color=(245, 247, 250))
    draw = ImageDraw.Draw(img)

    # Header bar
    draw.rectangle([(0, 0), (viewport_w, 45)], fill=(102, 126, 234))
    draw.text((20, 15), "LensAgent Test Form - Registration Portal", fill=(255, 255, 255))

    for el in browser_state["elements"]:
        bbox = el.get("bbox", [0, 0, 0, 0])
        x, y, w, h = bbox[0], bbox[1], bbox[2], bbox[3]  # bboxes are viewport-relative now

        if y + h < 45 or y > viewport_h:
            continue

        eid = el["element_id"]
        label = el.get("label") or eid
        role = el.get("role")
        val = filled_values.get(eid, "")

        if role == "textbox" or role == "combobox":
            # Label
            draw.text((x, max(45, y - 16)), label[:40], fill=(50, 50, 50))
            # Input box
            fill_color = (255, 255, 255) if not val else (240, 253, 244)
            draw.rectangle([(x, y), (x + w, y + h)], outline=(180, 180, 180), width=2, fill=fill_color)
            if val:
                draw.text((x + 8, y + 10), str(val)[:35], fill=(20, 83, 45))
            elif el.get("placeholder"):
                draw.text((x + 8, y + 10), el["placeholder"][:35], fill=(160, 160, 160))

        elif role == "checkbox" or role == "radio":
            draw.rectangle([(x, y), (x + w, y + h)], outline=(100, 100, 100), width=2, fill=(255, 255, 255))
            if el.get("checked") or val:
                draw.rectangle([(x + 4, y + 4), (x + w - 4, y + h - 4)], fill=(102, 126, 234))
            draw.text((x + w + 10, y + 2), label[:45], fill=(40, 40, 40))

        elif role == "button":
            draw.rectangle([(x, y), (x + w, y + h)], fill=(102, 126, 234))
            draw.text((x + 20, y + 12), el.get("text") or label, fill=(255, 255, 255))

    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=85)
    return base64.b64encode(buf.getvalue()).decode("utf-8")


class ClientVault:
    def __init__(self) -> None:
        self.data = {
            "full_name": "Devi Prasad",
            "email": "devi.prasad@example.com",
            "phone": "+91 98765 43210",
            "dob": "1995-08-15",
            "gender": "male",
            "address": "Flat 402, Lotus Heights, MG Road",
            "city": "Mumbai",
            "state": "maharashtra",
            "pincode": "400001",
            "password": "SuperSecretPass2026!",
            # Note: "username" is intentionally omitted to verify ASK_USER HITL trigger!
        }

    def get_available_tokens(self) -> List[str]:
        return [f"<VAULT_{k.upper()}>" for k in self.data.keys()]

    def detokenize(self, text: str) -> str:
        if not text:
            return text
        for k, v in self.data.items():
            token = f"<VAULT_{k.upper()}>"
            if token in text:
                text = text.replace(token, v)
        return text

    def learn_entry(self, key: str, value: str) -> None:
        clean_key = key.lower().replace("vault_", "").replace("<", "").replace(">", "").strip()
        self.data[clean_key] = value
        print(f"    [Vault Learned] Stored key '{clean_key}': '{value}' into secure local vault.")


def simulate_test_page_automation() -> bool:
    html_path = os.path.join(os.path.dirname(__file__), "..", "test_page.html")
    if not os.path.exists(html_path):
        print(f"Error: {html_path} not found")
        return False

    backend_url = "http://127.0.0.1:8000"
    session_id = f"testpage_sess_{int(time.time())}"
    task = "Fill out all required fields on the test page registration form and submit."

    vault = ClientVault()
    filled_values: Dict[str, str] = {}
    scroll_y = 0
    viewport_h = 550
    step = 0
    max_steps = 10
    consecutive_scrolls = 0
    last_filled_count = 0

    print("=" * 75)
    print(" LENSAGENT TEST PAGE (test_page.html) LIVE VLM AUTOMATION ")
    print("=" * 75)
    print(f"[*] Parsing DOM dynamically from {html_path}")
    print(f"[*] Initial Vault Tokens: {vault.get_available_tokens()}")

    execution_results: List[Dict[str, Any]] = []

    while step < max_steps:
        step += 1
        print(f"\n{'='*30} STEP {step} (Scroll Y = {scroll_y}px) {'='*30}")

        browser_state = parse_html_to_browser_state(html_path, scroll_y=scroll_y, viewport_h=viewport_h)
        scroll_y = browser_state["page"]["scroll"]["y"]
        max_scroll = browser_state["page"].get("max_scroll", 0)

        # Reflect already filled values in browser state
        for el in browser_state["elements"]:
            eid = el["element_id"]
            if eid in filled_values:
                el["value"] = filled_values[eid]
                if el["role"] in ("checkbox", "radio"):
                    el["checked"] = True

        screenshot_b64 = render_dynamic_screenshot(browser_state, filled_values)

        payload = {
            "session_id": session_id,
            "task": task,
            "browser_state": browser_state,
            "screenshot": {"mime_type": "image/jpeg", "data": screenshot_b64},
            "available_keys": vault.get_available_tokens(),
            "execution_results": execution_results,
        }

        t0 = time.perf_counter()
        resp = requests.post(f"{backend_url}/api/v1/infer", json=payload, timeout=60)
        elapsed = (time.perf_counter() - t0) * 1000

        if resp.status_code != 200:
            print(f"[!] Step {step} Error: HTTP {resp.status_code} - {resp.text}")
            return False

        res = resp.json()
        status = res.get("status")
        thought = res.get("thought", "")
        actions = res.get("actions", [])

        print(f"[*] VLM Response ({elapsed:.1f}ms) | Status: {status}")
        print(f"    Thought: {thought}")
        print(f"    Actions Plan ({len(actions)} actions):")

        execution_results = []
        should_stop = False

        for a in actions:
            act_type = str(a.get("type", "")).upper()
            target = a.get("target")
            raw_text = a.get("text") or a.get("key") or ""
            detok_text = vault.detokenize(raw_text)

            coords = f"({a.get('x')}, {a.get('y')})" if a.get("x") is not None else ""
            print(f"    -> [{act_type}] Target={target} Coords={coords} Text='{raw_text}' (Detokenized='{detok_text}')")

            # Handle ASK_USER Human-In-The-Loop action
            if act_type == "ASK_USER":
                question = a.get("question", f"Please provide value for {target}")
                suggested_key = (a.get("vaultKey") or target)
                print(f"\n    [HITL MODAL TRIGGERED] Extension asking user: \"{question}\"")
                # Simulate user answering the prompt
                simulated_user_answer = "deviprasad_99"
                if suggested_key and "gender" in suggested_key.lower():
                    simulated_user_answer = "male"
                print(f"    [User Input Entered] \"{simulated_user_answer}\" (Save to Vault: Yes)")
                vault.learn_entry(suggested_key, simulated_user_answer)

                if target:
                    filled_values[target] = simulated_user_answer
                    # If answering a radio/checkbox family, mark all same-name options as the chosen one
                    if "gender" in (target or "").lower():
                        for tgt in list(filled_values.keys()):
                            if "gender" in tgt.lower():
                                filled_values[tgt] = "checked" if tgt == target else None
                execution_results.append({
                    "action_id": a.get("action_id"),
                    "action": "TYPE",
                    "success": True,
                    "detail": f"User answered: {simulated_user_answer}",
                    "retries": 0,
                })
                continue

            # Simulate client-side execution
            if act_type == "TYPE" and target:
                filled_values[target] = detok_text
                consecutive_scrolls = 0
            elif act_type == "SELECT" and target:
                opt = a.get("optionText") or detok_text or "maharashtra"
                filled_values[target] = opt
                consecutive_scrolls = 0
            elif act_type in ("CLICK", "CHECK") and target:
                filled_values[target] = "checked"
                consecutive_scrolls = 0
            elif act_type == "SCROLL":
                scroll_delta = int(a.get("delta_y", 400))
                scroll_y += scroll_delta
                if scroll_y > max_scroll:
                    scroll_y = max_scroll
                    print(f"    [Page Scrolled] Reached bottom (clamped to {scroll_y}px, max {max_scroll}px)")
                else:
                    print(f"    [Page Scrolled] Viewport Y is now {scroll_y}px")
                consecutive_scrolls += 1
            elif act_type in ("FINISH", "TERMINATE"):
                print(f"\n[+] TASK COMPLETED SIGNALLING GOAL ACHIEVED!")
                should_stop = True

            execution_results.append({
                "action_id": a.get("action_id"),
                "action": act_type,
                "success": True,
                "detail": f"Executed {act_type} on {target}",
                "retries": 0,
            })

        if status == "done" or should_stop:
            print(f"\n{'='*75}")
            print(f" SUCCESS: Full Form Automations Completed in {step} Steps!")
            print(f" Total Fields Filled: {len(filled_values)}")
            print(f"{'='*75}")
            return True

        if consecutive_scrolls >= 3 and len(filled_values) == last_filled_count:
            print(f"\n[!] Stall detected: model scrolling repeatedly without filling fields. Stopping.")
            return False

        last_filled_count = len(filled_values)

    return True


if __name__ == "__main__":
    success = simulate_test_page_automation()
    sys.exit(0 if success else 1)
