import json, base64, io, time
import urllib.request, urllib.error
from PIL import Image, ImageDraw

BASE = "http://127.0.0.1:8000/api/v1/infer"

def make_screenshot():
    img = Image.new("RGB", (400, 220), "white")
    d = ImageDraw.Draw(img)
    d.text((20, 20), "Registration Form", fill="black")
    d.rectangle([20, 50, 350, 80], outline="black")
    d.text((25, 58), "Full Name: ____", fill="black")
    d.rectangle([20, 100, 350, 130], outline="black")
    d.text((25, 108), "Email: ____", fill="black")
    d.rectangle([20, 150, 180, 180], outline="black")
    d.text((25, 158), "Submit", fill="black")
    buf = io.BytesIO(); img.save(buf, format="JPEG", quality=80)
    return base64.b64encode(buf.getvalue()).decode()

def elem(eid, tag, typ, label, placeholder, bbox, value=""):
    return {"element_id": eid, "tag": tag, "type": typ, "label": label,
            "placeholder": placeholder, "bbox": bbox, "value": value,
            "role": "generic", "visible": True, "enabled": True}

# Form element definitions keyed by id
FORM = {
    "1": {"tag": "input", "type": "text", "label": "Full Name", "placeholder": "Enter full name", "bbox": [20, 50, 200, 30]},
    "2": {"tag": "input", "type": "email", "label": "Email", "placeholder": "Enter email", "bbox": [20, 100, 200, 30]},
    "3": {"tag": "button", "type": "submit", "label": "Submit", "bbox": [20, 150, 100, 30]},
}

def build_elements(values):
    els = []
    for eid, v in values.items():
        f = FORM[eid]
        els.append(elem(eid, f["tag"], f["type"], f["label"], f.get("placeholder", ""), f["bbox"], value=v))
    return els

def call(sid, task, values, execr, valf, success_page=False):
    checklist = {"unfilled_visible": [], "unfilled_offscreen": []} if success_page else {}
    payload = {
        "session_id": sid, "task": task,
        "browser_state": {"page": {"title": "Thank you - Registration Complete" if success_page else "Registration",
                                   "url": "https://example.com/success" if success_page else "https://example.com/reg",
                                   "viewport": {"width": 400, "height": 220}},
                          "elements": build_elements(values), "checklist": checklist},
        "screenshot": {"mime_type": "image/jpeg", "data": make_screenshot()},
        "available_keys": ["VAULT_FULL_NAME", "VAULT_EMAIL"],
        "execution_results": execr, "validation_feedback": valf,
    }
    data = json.dumps(payload).encode()
    req = urllib.request.Request(BASE, data=data, headers={"Content-Type": "application/json"})
    t0 = time.perf_counter()
    for _ in range(3):
        try:
            with urllib.request.urlopen(req, timeout=150) as resp:
                body = json.loads(resp.read().decode())
            return body, time.perf_counter() - t0
        except urllib.error.HTTPError as e:
            if e.code == 500:
                print("  !!! 500 error:", e.read().decode()[:200])
                raise
            raise
    return None, None

print("=" * 72)
print("FULL SELF-DRIVING LOOP TEST -> drives to FINISH using returned actions")
print("=" * 72)
session = f"full_loop_{int(time.time())}"
task = "Fill the registration form using the vault data and submit, then finish."
values = {"1": "", "2": "", "3": ""}
exec_status = {}   # element_id -> filled value
vault = {"1": "VAULT_FULL_NAME", "2": "VAULT_EMAIL"}
field_values = {"1": "John Doe", "2": "jdoe@example.com"}
exec_results = []
val_feedback = []
timings = []
success_page = False
step = 0
MAX_STEPS = 8
finished = False

while step < MAX_STEPS:
    step += 1
    sv = {eid: (exec_status.get(eid, "") if eid in exec_status else v) for eid, v in exec_status.items()}
    # Build current values: filled values appear; empty otherwise
    cur = {}
    for eid in FORM:
        cur[eid] = exec_status.get(eid, "")
    body, wall = call(session, task, cur, exec_results, val_feedback, success_page=success_page)
    vlm_ms = body["timings"].get("vlm_ms", 0) if body.get("timings") else 0
    timings.append(vlm_ms)
    print(f"\n[Step {step}] status={body['status']} vlm_ms={vlm_ms:.0f} reason='{body['reason']}'")
    print(f"  thought: {body['thought'][:120]}")
    acts = body.get("actions", [])
    if not acts:
        print("  -> NO ACTIONS")
        if body["status"] in ("done", "blocked"):
            break
        time.sleep(2)
        continue

    for a in acts:
        at = str(a.get("type", "")).upper()
        tgt = a.get("target")
        print(f"    {at} target={tgt} text={a.get('text')}")

        if at in ("TYPE", "FILL"):
            exp = vault.get(tgt, a.get("text"))
            filled_val = field_values.get(tgt, a.get("text", ""))
            if tgt:
                exec_status[tgt] = filled_val
                exec_results.append({"action": "TYPE", "success": True, "detail": "typed", "action_id": a.get("action_id")})
                val_feedback.append({"element_id": tgt, "action_id": a.get("action_id"), "filled": True,
                                     "actual_value": filled_val, "expected_value": a.get("text")})
            else:
                exec_results.append({"action": "TYPE", "success": True, "detail": "typed", "action_id": a.get("action_id")})
        elif at in ("CLICK",):
            exec_results.append({"action": "CLICK", "success": True, "detail": "clicked", "action_id": a.get("action_id")})
            success_page = True  # assume submit navigated to success page
        elif at in ("FINISH", "TERMINATE"):
            print("    *** FINISH RECEIVED ***")
            finished = True
            break
        elif at in ("SCROLL", "WAIT", "NAVIGATE", "PRESS_KEY", "HOVER"):
            exec_results.append({"action": at, "success": True, "detail": "executed", "action_id": a.get("action_id")})
    if finished:
        break
    time.sleep(0.5)

if not finished:
    print("\nLoop ended without explicit FINISH command.")

print(f"\nTotal vlm_ms per step: {[round(t) for t in timings]}")
print(f"Avg vlm_ms: {sum(timings)/len(timings):.0f}ms")
print("E2E COMPLETE")
