"""
End-to-End Simulation of the LensAgent extension multi-turn perception-action loop.
Tests live communication between Extension Client <-> FastAPI Backend <-> llama-server (Qwen2.5-VL-7B on CUDA).
"""

from __future__ import annotations

import base64
import io
import json
import re
import sys
import time
from typing import Any, Dict, List

import requests
from PIL import Image, ImageDraw, ImageFont


def generate_form_image(view: str = "top") -> str:
    """Renders a synthetic screenshot representing the webpage view."""
    img = Image.new("RGB", (800, 500), color=(248, 249, 250))
    draw = ImageDraw.Draw(img)

    # Header
    draw.rectangle([(0, 0), (800, 60)], fill=(37, 99, 235))
    draw.text((20, 20), "Job Application Portal - Software Engineer", fill=(255, 255, 255))

    if view == "top":
        # Form fields in top view
        draw.text((50, 90), "Legal Full Name *", fill=(30, 41, 59))
        draw.rectangle([(50, 115), (450, 155)], outline=(203, 213, 225), width=2, fill=(255, 255, 255))

        draw.text((50, 180), "Email Address *", fill=(30, 41, 59))
        draw.rectangle([(50, 205), (450, 245)], outline=(203, 213, 225), width=2, fill=(255, 255, 255))

        draw.text((50, 270), "Primary Phone *", fill=(30, 41, 59))
        draw.rectangle([(50, 295), (450, 335)], outline=(203, 213, 225), width=2, fill=(255, 255, 255))

        draw.text((50, 370), "Scroll down for address and confirmation...", fill=(100, 116, 139))
    else:
        # Form fields in bottom (scrolled) view
        draw.text((50, 80), "Residential Address *", fill=(30, 41, 59))
        draw.rectangle([(50, 105), (450, 145)], outline=(203, 213, 225), width=2, fill=(255, 255, 255))

        # Checkbox
        draw.rectangle([(50, 180), (70, 200)], outline=(100, 116, 139), width=2, fill=(255, 255, 255))
        draw.text((80, 182), "I certify all entered information is accurate", fill=(30, 41, 59))

        # Submit button
        draw.rectangle([(50, 240), (220, 285)], fill=(16, 185, 129))
        draw.text((85, 255), "Submit Application", fill=(255, 255, 255))

    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=85)
    return base64.b64encode(buf.getvalue()).decode("utf-8")


class SimulatedClientVault:
    """Mimics LensAgent's client-side zero-knowledge VaultManager."""

    def __init__(self) -> None:
        self.vault_data = {
            "full_name": "Dr. Aris Thorne",
            "email": "aris.thorne@deepresearch.org",
            "phone": "+1 555 789 0123",
            "address": "452 Quantum Blvd, Cyber City",
        }

    def get_available_tokens(self) -> List[str]:
        return [f"<VAULT_{k.upper()}>" for k in self.vault_data.keys()]

    def detokenize(self, text: str) -> str:
        if not text:
            return text
        for k, v in self.vault_data.items():
            token = f"<VAULT_{k.upper()}>"
            if token in text:
                text = text.replace(token, v)
        return text


def run_simulation() -> bool:
    print("=" * 70)
    print(" LENSAGENT MULTI-TURN AUTONOMOUS FORM AUTOMATION SIMULATION ")
    print("=" * 70)

    backend_url = "http://127.0.0.1:8000"
    session_id = f"sim_sess_{int(time.time())}"
    task = "Fill out and submit the job application form with my contact details."

    vault = SimulatedClientVault()
    available_tokens = vault.get_available_tokens()
    print(f"[*] Client Vault Initialized with tokens: {available_tokens}")

    # Verify backend health
    try:
        health_resp = requests.get(f"{backend_url}/health", timeout=5)
        print(f"[*] Backend Health Check: {health_resp.json()}")
    except Exception as e:
        print(f"[!] Cannot reach backend at {backend_url}: {e}")
        print("    Ensure backend is running (python -m uvicorn app.main:app --port 8000)")
        return False

    # -------------------------------------------------------------
    # TURN 1: Top of Form View
    # -------------------------------------------------------------
    print("\n" + "-" * 50)
    print(">>> TURN 1: Scanning top of form (Viewport 0-500px)...")
    print("-" * 50)

    browser_state_turn1 = {
        "page": {
            "title": "Job Application Portal",
            "url": "http://localhost:3000/apply",
            "viewport": {"width": 800, "height": 500},
            "scroll": {"x": 0, "y": 0},
        },
        "elements": [
            {
                "element_id": "input_legal_name",
                "role": "textbox",
                "type": "text",
                "label": "Legal Full Name",
                "placeholder": "Enter full name",
                "value": "",
                "bbox": [50, 115, 400, 40],
                "visible": True,
                "enabled": True,
            },
            {
                "element_id": "input_email_addr",
                "role": "textbox",
                "type": "email",
                "label": "Email Address",
                "placeholder": "Enter email",
                "value": "",
                "bbox": [50, 205, 400, 40],
                "visible": True,
                "enabled": True,
            },
            {
                "element_id": "input_phone_no",
                "role": "textbox",
                "type": "tel",
                "label": "Primary Phone",
                "placeholder": "Enter phone",
                "value": "",
                "bbox": [50, 295, 400, 40],
                "visible": True,
                "enabled": True,
            },
            # Offscreen fields
            {
                "element_id": "input_res_address",
                "role": "textbox",
                "type": "text",
                "label": "Residential Address",
                "value": "",
                "bbox": [50, 580, 400, 40],  # Below viewport (y > 500)
                "visible": False,
                "enabled": True,
            },
            {
                "element_id": "chk_agreement",
                "role": "checkbox",
                "label": "I certify all entered information is accurate",
                "value": "",
                "checked": False,
                "bbox": [50, 680, 20, 20],  # Below viewport
                "visible": False,
                "enabled": True,
            },
            {
                "element_id": "btn_submit_app",
                "role": "button",
                "text": "Submit Application",
                "bbox": [50, 740, 170, 45],  # Below viewport
                "visible": False,
                "enabled": True,
            },
        ],
    }

    payload_turn1 = {
        "session_id": session_id,
        "task": task,
        "browser_state": browser_state_turn1,
        "screenshot": {
            "mime_type": "image/jpeg",
            "data": generate_form_image("top"),
        },
        "available_keys": available_tokens,
        "execution_results": [],
    }

    t0 = time.perf_counter()
    resp1 = requests.post(f"{backend_url}/api/v1/infer", json=payload_turn1, timeout=60)
    latency1 = (time.perf_counter() - t0) * 1000

    if resp1.status_code != 200:
        print(f"[!] Turn 1 failed: HTTP {resp1.status_code} - {resp1.text}")
        return False

    res1 = resp1.json()
    print(f"[*] Response received in {latency1:.1f}ms:")
    print(f"    Status:  {res1.get('status')}")
    print(f"    Thought: {res1.get('thought')}")
    print(f"    Actions ({len(res1.get('actions', []))} total):")

    execution_results_1 = []
    scrolled = False

    for a in res1.get("actions", []):
        act_type = a.get("type")
        target = a.get("target")
        coords = f"({a.get('x')}, {a.get('y')})" if a.get("x") is not None else ""
        raw_text = a.get("text") or a.get("key") or ""
        real_text = vault.detokenize(raw_text)

        print(f"    - [{act_type}] Target={target} Coords={coords} Token='{raw_text}' -> Detokenized='{real_text}'")

        if act_type == "SCROLL":
            scrolled = True

        execution_results_1.append({
            "action_id": a.get("action_id"),
            "action": act_type,
            "success": True,
            "detail": f"Executed {act_type} on {target}",
            "retries": 0,
        })

    # -------------------------------------------------------------
    # TURN 2: Scrolled Form View
    # -------------------------------------------------------------
    print("\n" + "-" * 50)
    print(">>> TURN 2: Form scrolled down (Viewport 500-1000px)...")
    print("-" * 50)

    browser_state_turn2 = {
        "page": {
            "title": "Job Application Portal",
            "url": "http://localhost:3000/apply",
            "viewport": {"width": 800, "height": 500},
            "scroll": {"x": 0, "y": 500},
        },
        "elements": [
            # Top fields now filled and scrolled up
            {
                "element_id": "input_legal_name",
                "role": "textbox",
                "value": "Dr. Aris Thorne",
                "bbox": [50, -385, 400, 40],
                "visible": False,
                "enabled": True,
            },
            {
                "element_id": "input_email_addr",
                "role": "textbox",
                "value": "aris.thorne@deepresearch.org",
                "bbox": [50, -295, 400, 40],
                "visible": False,
                "enabled": True,
            },
            {
                "element_id": "input_phone_no",
                "role": "textbox",
                "value": "+1 555 789 0123",
                "bbox": [50, -205, 400, 40],
                "visible": False,
                "enabled": True,
            },
            # Bottom fields now visible in viewport
            {
                "element_id": "input_res_address",
                "role": "textbox",
                "type": "text",
                "label": "Residential Address",
                "placeholder": "Enter home address",
                "value": "",
                "bbox": [50, 80, 400, 40],
                "visible": True,
                "enabled": True,
            },
            {
                "element_id": "chk_agreement",
                "role": "checkbox",
                "label": "I certify all entered information is accurate",
                "value": "",
                "checked": False,
                "bbox": [50, 180, 20, 20],
                "visible": True,
                "enabled": True,
            },
            {
                "element_id": "btn_submit_app",
                "role": "button",
                "text": "Submit Application",
                "bbox": [50, 240, 170, 45],
                "visible": True,
                "enabled": True,
            },
        ],
    }

    payload_turn2 = {
        "session_id": session_id,
        "task": task,
        "browser_state": browser_state_turn2,
        "screenshot": {
            "mime_type": "image/jpeg",
            "data": generate_form_image("bottom"),
        },
        "available_keys": available_tokens,
        "execution_results": execution_results_1,
    }

    t1 = time.perf_counter()
    resp2 = requests.post(f"{backend_url}/api/v1/infer", json=payload_turn2, timeout=60)
    latency2 = (time.perf_counter() - t1) * 1000

    if resp2.status_code != 200:
        print(f"[!] Turn 2 failed: HTTP {resp2.status_code} - {resp2.text}")
        return False

    res2 = resp2.json()
    print(f"[*] Response received in {latency2:.1f}ms:")
    print(f"    Status:  {res2.get('status')}")
    print(f"    Thought: {res2.get('thought')}")
    print(f"    Actions ({len(res2.get('actions', []))} total):")

    for a in res2.get("actions", []):
        act_type = a.get("type")
        target = a.get("target")
        coords = f"({a.get('x')}, {a.get('y')})" if a.get("x") is not None else ""
        raw_text = a.get("text") or a.get("key") or ""
        real_text = vault.detokenize(raw_text)
        print(f"    - [{act_type}] Target={target} Coords={coords} Token='{raw_text}' -> Detokenized='{real_text}'")

    print("\n" + "=" * 70)
    print(" SIMULATION COMPLETED SUCCESSFULLY! ")
    print("=" * 70)
    return True


if __name__ == "__main__":
    success = run_simulation()
    sys.exit(0 if success else 1)
