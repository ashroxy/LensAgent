# LensAgent: Complete Backend & Extension Architecture Contracts

> **Investigation Target:** `e:\SIH-171`  
> **Prepared by:** Teamwork Explorer Survey 2  
> **Purpose:** Authoritative reference mapping all backend contracts, extension services, message passing protocols, storage schemas, AI/ML models, and external APIs so that frontend implementations strictly preserve existing contracts without breaking them or inventing unnecessary architecture.

---

## 1. Extension Manifest & Architecture Overview

### 1.1 Manifest Specifications (`manifest.json`)
* **Manifest Version:** 3 (Chrome MV3)
* **Extension Name:** `LensAgent - Privacy-Preserving Visual Browser Agent`
* **Version:** `1.0.0`
* **Offline Enabled:** `true`
* **Minimum Chrome Version:** `118` (Required for WebGPU and Offscreen Documents)

### 1.2 Permissions & Security Context
| Permission | Purpose & Scope |
| :--- | :--- |
| `debugger` | Attaches Chrome DevTools Protocol (CDP v1.3) to active web tabs. Used by `CaptureEngine` for 30 FPS JPEG screencasts and by `ActionExecutor` for synthetic user input (Gaussian mouse jitter, keyboard cadence, and `Runtime.evaluate`). |
| `offscreen` | Allows spawning `offscreen/offscreen.html` to host heavy DOM parsing, Canvas 2D hardware contexts, and WebGPU/WASM machine learning models outside the Service Worker context. |
| `activeTab` & `tabs` | Resolves target tab ID, checks URL restrictions (`chrome://`, `chrome-extension://`, `edge://`), listens for user tab switches and tab closures. |
| `storage` | Grants access to `chrome.storage.local` (persistent settings, vault, history) and `chrome.storage.session` (in-memory agent state, metrics, logs). |
| `alarms` | Periodically triggers `sw-keepalive` to prevent MV3 Service Worker premature termination. |
| `scripting` | Programmatic script execution capability (CDP `Runtime.evaluate` is primarily used). |

### 1.3 Content Security Policy (CSP) & Web Accessible Resources
* **CSP (`extension_pages`):** `script-src 'self' 'wasm-unsafe-eval'; object-src 'self';`  
  Allows local WASM SIMD execution for ONNX Runtime Web (`ort-wasm-simd.wasm`).
* **Web Accessible Resources:**
  * `models/*` (Accessible across `<all_urls>`)
  * `lib/ort/*` (Accessible across `<all_urls>` for WASM and worker scripts)
* **Host Permissions:**
  * `<all_urls>`
  * `https://huggingface.co/*` (Model weights downloading)
  * `https://cdn-lfs.huggingface.co/*` (Model checkpoint downloads)

---

## 2. Extension Component Architecture & Lifecycles

```
┌────────────────────────────────────────────────────────────────────────┐
│                          Popup UI (Dashboard)                         │
│   (Goal input, Live dual-streams, Real-time metrics, Vault, Settings)  │
└──────────────────┬─────────────────────────────────▲───────────────────┘
     POPUP_* msgs  │                                 │  BG_* broadcasts
                   ▼                                 │
┌────────────────────────────────────────────────────┴───────────────────┐
│              Background Service Worker (background/service-worker.js)  │
│  - Keepalive: alarms + port heartbeat (20s)                             │
│  - CDP Debugger Management (chrome.debugger v1.3)                      │
│  - Agent Loop Orchestration (AgentLoop)                                │
│  - Vault & Session Storage Management                                  │
└──────────┬─────────────────────────────┬───────────────────────────────┘
           │ CDP commands (Page, Input)   │ Port (PORT_OFFSCREEN_PERCEPTION)
           ▼                             ▼
┌───────────────────────────────┐ ┌───────────────────────────────────────┐
│     Target Web Page Tab       │ │    Offscreen Document (offscreen.html) │
│ - Page.startScreencast        │ │ - WebGPU / WASM Context               │
│ - DOM / A11y tree extraction  │ │ - Transformers.js (owlvit-base)       │
│ - Humanized Synthetic Inputs  │ │ - PrivacyEngine (Canvas PII Redaction)│
│ - Visual Overlays             │ │ - Set-of-Mark (SoM) Bounding Boxes    │
└───────────────────────────────┘ └───────────────────┬───────────────────┘
                                                      │ Redacted Payload
                                                      ▼
                                  ┌───────────────────────────────────────┐
                                  │   FastAPI Backend (http://127.0.0.1)  │
                                  │ - POST /api/v1/infer                  │
                                  │ - Groq / HF / OpenRouter / llama.cpp  │
                                  │ - Returns structured AgentAction[]    │
                                  └───────────────────────────────────────┘
```

### 2.1 Background Service Worker (`background/service-worker.js`)
* **Execution Model:** Manifest V3 ES Module (`"type": "module"`).
* **Lifecycle & Keep-Alive:**
  * Uses dual keep-alive: `chrome.alarms` (`ALARM_KEEPALIVE = "sw-keepalive"`, period 1 min) + continuous `setInterval` port heartbeat (`HEARTBEAT_INTERVAL = 20000ms`).
  * If the offscreen document crashes or drops connection, `handleOffscreenCrash()` auto-pauses the active agent, cleans up zombie contexts via `chrome.offscreen.closeDocument()`, recreates a fresh document, and prompts the user to restart.
* **Target Tab Isolation & Pop-out Mode:**
  * Normal mode targets the active web tab in the current window.
  * Pop-out / full-tab mode accepts `targetTabId` so that opening the popup in a full tab does not attempt to automate itself.
  * Blocks restricted pages: `chrome://`, `chrome-extension://`, `edge://`, `about:blank`, `https://chromewebstore.google.com`.

### 2.2 Offscreen Document (`offscreen/offscreen.html` & `offscreen/offscreen.js`)
* **Creation Reason:** `["DOM_PARSER", "WORKERS"]`.
* **Hardware Acceleration:**
  * Initializes WebGPU adapter (`powerPreference: "high-performance"`, `maxBufferSize: 256MB`).
  * Automatically warms up GPU pipeline by executing a blank 640x640 tensor pass to pre-compile WGSL shaders and prevent first-frame latency spikes.
  * Gracefully falls back to WASM / Canvas 2D if WebGPU is unavailable.
* **Fail-Closed Redaction Principle:**
  * If DOM PII scanning, ML inference, or canvas redaction throws an error, the frame is **immediately dropped** and not sent to the remote backend.
  * The raw screenshot never leaves the browser.

---

## 3. Extension-Wide Message Passing Protocols

All message identifiers, enums, and constants are defined in `lib/message-types.js`.

### 3.1 Popup to Background (`POPUP_*`)
All requests are dispatched from `popup/popup.js` via `chrome.runtime.sendMessage(payload, callback)`.

| Action Constant | Request Payload | Response Schema | Description & Handling |
| :--- | :--- | :--- | :--- |
| `POPUP_START_AGENT` | `{ type: "POPUP_START_AGENT", goal: string, settings?: Object, targetTabId?: number }` | `{ status: "STARTED", dpr: number, tabId: number, url: string }` or `{ status: "ERROR", error: string }` | Validates goal, attaches CDP debugger, starts screencast, initializes `AgentLoop`. Returns `true` (asynchronous). |
| `POPUP_STOP_AGENT` | `{ type: "POPUP_STOP_AGENT", targetTabId?: number }` | `{ status: "STOPPED" }` or `{ status: "ERROR", error: string }` | Halts agent loop, stops screencast, detaches debugger, resets state to `IDLE`. |
| `POPUP_GET_STATUS` | `{ type: "POPUP_GET_STATUS", targetTabId?: number }` | `{ status: "OK", state: AgentState, goal: string, stepCount: number, maxSteps: number, avgLatency: number, stageAvg: Object, metrics: Object, connection: ConnectionQuality, serverErrors: number, activeHitlRequest: Object\|null }` | Instant synchronous status check (`return false`). |
| `POPUP_GET_SETTINGS` | `{ type: "POPUP_GET_SETTINGS" }` | `Settings` object (see Section 4.1) | Returns persistent settings merged with defaults. |
| `POPUP_UPDATE_SETTINGS` | `{ type: "POPUP_UPDATE_SETTINGS", settings: Partial<Settings> }` | `{ status: "OK" }` | Updates persistent settings and broadcasts `BG_SETTINGS_UPDATED`. |
| `POPUP_GET_HISTORY` | `{ type: "POPUP_GET_HISTORY", targetTabId?: number }` | `Array<SessionHistoryEntry>` (see Section 4.1) | Returns past run history (capped at 20). |
| `POPUP_CLEAR_HISTORY` | `{ type: "POPUP_CLEAR_HISTORY", targetTabId?: number }` | `{ status: "OK" }` | Empties the `sessionHistory` array. |
| `POPUP_EXPORT_LOG` | `{ type: "POPUP_EXPORT_LOG", targetTabId?: number }` | `{ text: string }` | Returns formatted string log with goal, timestamps, and steps. |
| `POPUP_VAULT_GET` | `{ type: "POPUP_VAULT_GET" }` | `Record<string, string>` | Returns all identity vault key-value pairs. |
| `POPUP_VAULT_SET` | `{ type: "POPUP_VAULT_SET", key: string, value: string }` | `{ status: "OK" }` | Saves or updates a vault key. |
| `POPUP_VAULT_DELETE` | `{ type: "POPUP_VAULT_DELETE", key: string }` | `{ status: "OK" }` | Removes a key from the vault. |
| `POPUP_VAULT_FLUSH` | `{ type: "POPUP_VAULT_FLUSH" }` | `{ status: "OK" }` | Wipes the entire local vault. |
| `POPUP_HITL_RESPONSE` | `{ type: "POPUP_HITL_RESPONSE", correlationId: number, answer: string, response: string, saveToVault: boolean, vaultKey: string }` | `{ status: "OK" }` | Delivers user answer for an active `ASK_USER` step; optionally learns the value into vault. |
| `POPUP_APPROVAL_RESPONSE` | `{ type: "POPUP_APPROVAL_RESPONSE", correlationId: number, approved: boolean }` | `{ status: "OK" }` | Responds to sensitive action prompt (`REQUIRE_APPROVAL`). |
| `PROXY_RUN_VISION_DETECTION` | `{ type: "PROXY_RUN_VISION_DETECTION", dataUrl: string, classes: string[], threshold: number }` | `{ customMlBoxes: Array, error: string\|null }` | Forwards vision request to offscreen document. |

### 3.2 Background to Popup Broadcasts (`BG_*` & `AUDIT_*`)
Received in `popup/popup.js` via `chrome.runtime.onMessage.addListener((message) => ...)`.

| Message Type | Payload Structure | Description |
| :--- | :--- | :--- |
| `BG_AGENT_STATUS` | `{ state: AgentState, message?: string, goal?: string, stepCount?: number, maxSteps?: number, avgLatency?: number, metrics?: Object, connection?: ConnectionQuality, activeHitlRequest?: Object }` | Emitted whenever agent changes state (IDLE, RUNNING, PAUSED, WAITING_FOR_USER, etc.). |
| `AUDIT_FRAME_UPDATE` | `{ rawFrame: string, redactedFrame: string, boundingBoxes: BoundingBox[], redactedCount: number }` | Emitted every step. Contains unredacted frame (for local UI only), sanitized frame, and element bounding boxes. |
| `AUDIT_ACTION_LOG` | `{ message: string, timestamp: number }` | Emitted for terminal log updates. |
| `BG_SETTINGS_UPDATED` | `Settings` object | Broadcast when settings are saved. |
| `BG_HITL_PROMPT` | `{ question: string, suggestedVaultKey?: string, correlationId: number }` | Triggers Human-In-The-Loop dialog overlay. |
| `BG_APPROVAL_PROMPT` | `{ context: string, detail: string, correlationId: number }` | Triggers confirmation modal for sensitive actions. |

### 3.3 Background ↔ Offscreen Document (`PORT_OFFSCREEN_PERCEPTION`)
Connected via `chrome.runtime.connect({ name: "PORT_OFFSCREEN_PERCEPTION" })`.

| Direction | Message Type | Payload Schema |
| :--- | :--- | :--- |
| SW → Offscreen | `BG_PROCESS_FRAME` | `{ type: "BG_PROCESS_FRAME", correlationId: string, rawBase64: string, buffer?: ArrayBuffer, piiBoxes: Array, dpr: number, viewportWidth?: number }` |
| Offscreen → SW | `OS_PERCEPTION_DONE` | `{ type: "OS_PERCEPTION_DONE", correlationId: string, result: PerceptionResult, error?: string }` |
| Offscreen → SW | `OS_READY` | `{ type: "OS_READY", gpuStatus: WebGPUStatus }` |
| Offscreen → SW | `OS_WEBGPU_STATUS` | `{ type: "OS_WEBGPU_STATUS", status: WebGPUStatus }` |
| Offscreen → SW | `OS_PERF_METRICS` | `{ type: "OS_PERF_METRICS", metrics: { avgDecodeMs, avgInferenceMs, avgRedactionMs, avgExportMs, avgTotalMs, totalFrames } }` |
| SW ↔ Offscreen | `HEARTBEAT_PING` / `HEARTBEAT_PONG` | `{ type: "HEARTBEAT_PING" }` / `{ type: "HEARTBEAT_PONG" }` |

---

## 4. Storage Schemas & Default Values

Managed via `lib/storage.js` and `lib/vault.js`.

### 4.1 Persistent Storage (`chrome.storage.local`)

#### Key: `"userSettings"`
Loaded and saved with partial merge and fallback to `DEFAULT_SETTINGS`:
```javascript
{
  backendUrl:         "http://127.0.0.1:8000", // Automatically migrated from localhost:8000
  maxSteps:           30,                      // Integer, clamped between 5 and 100
  captureQuality:     75,                      // Integer, clamped between 30 and 100
  captureMaxWidth:    1280,                    // Pixels
  captureMaxHeight:   720,                     // Pixels
  humanizeInputs:     true,                    // Gaussian jitter & typing cadence
  stabilizeDelayMs:   250,                     // Post-action wait, clamped 50 to 2000ms
  serverTimeoutMs:    10000,                   // Clamped 2000 to 30000ms
  enableDeltaFrames:  true,                    // Skip redundant frames
  enableAuditStream:  true,                    // Stream video feeds to popup
  interKeyDelayBase:  30,                      // Typing cadence base delay
  interKeyJitter:     40                       // Typing cadence random variance
}
```

#### Key: `"sessionHistory"`
Array of completed or terminated sessions, capped at `MAX_HISTORY_ENTRIES = 20`:
```typescript
interface SessionHistoryEntry {
  id: string;          // e.g. "run_1725518400000"
  timestamp: number;   // Epoch ms
  date: string;        // Human formatted local date string
  goal: string;        // User objective
  steps: number;       // Number of steps executed
  result: "FINISHED" | "STOPPED" | "ERROR";
  durationMs: number;  // Total execution time in ms
  url: string;         // Starting or ending tab URL
}
```

#### Key: `"lensagent_vault"`
User Identity Vault used for local Zero-Knowledge autofill:
```typescript
type VaultData = Record<string, string>;
```
* **Predefined Keys:** `full_name`, `first_name`, `last_name`, `email`, `phone`, `address`, `city`, `state`, `pincode`, `dob`, `gender`.
* **Dynamic Custom Keys:** Any key entered by user (e.g. `passport_num`, `aadhaar_num`).
* **Detokenization Engine:** When the VLM returns tokens matching `<VAULT_([A-Z0-9_]+)>`, `VaultManager.detokenize()` matches case-insensitively against the local vault cache before injecting text via CDP.

### 4.2 Ephemeral Session Storage (`chrome.storage.session`)

| Key | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `agentState` | `string` | `"IDLE"` | Current `AgentState` enum value. |
| `currentGoal` | `string` | `""` | Active prompt / task objective. |
| `stepCount` | `number` | `0` | Current execution step counter. |
| `sessionTabId` | `number \| null` | `null` | Target browser tab ID being automated. |
| `sessionDpr` | `number` | `1` | Device Pixel Ratio of target page. |
| `sessionUrl` | `string` | `""` | Current URL of automated tab. |
| `sessionStart` | `number` | `0` | Session start timestamp. |
| `perfMetrics` | `Object` | (empty metrics) | `{ totalFrames, skippedFrames, processedFrames, totalCycles, avgLatencyMs, minLatencyMs, maxLatencyMs, serverErrors, perceptionErrors, actionsExecuted, actionsFailed }` |
| `actionLogs` | `Array<Object>` | `[]` | Current session logs: `[{ message, type, timestamp, time }]` (capped at 500 in storage). |

---

## 5. Backend Server API Contracts (FastAPI)

* **Server Root:** `project/backend/app/main.py`
* **Default Host & Port:** `127.0.0.1:8000`
* **CORS:** Enabled for all Chrome Extension origins (`*`).

### 5.1 Endpoints

#### `GET /health`
* **Purpose:** Health check verifying server and VLM readiness.
* **Response:**
  ```json
  {
    "status": "ok",
    "vlm_status": "ok",
    "gpu_accelerated": true,
    "version": "1.1.0"
  }
  ```
  *(Critical Notice: `popup.js` currently pings `/api/health`, which produces a 404. The valid route is `/health`.)*

#### `POST /api/v1/session`
* **Request:** `{ "session_id": string, "task": string }`
* **Response:** `{ "session_id": string, "status": "RUNNING", "created_at": string }`

#### `GET /api/v1/session/{session_id}`
* **Response:** Session telemetry, history, completed actions, and field fill counts.

#### `DELETE /api/v1/session/{session_id}`
* **Response:** `{ "status": "deleted", "session_id": string }`

#### `POST /api/v1/infer` (Main Tri-Stream Inference Endpoint)
* **Request Payload (`InferRequest`):**
  ```json
  {
    "session_id": "sess_1725518400",
    "task": "Register for new account",
    "browser_state": {
      "page": {
        "title": "Sign Up",
        "url": "https://example.com/signup",
        "viewport": { "width": 1280.0, "height": 720.0 },
        "scroll": { "x": 0.0, "y": 0.0 }
      },
      "elements": [
        {
          "element_id": "full_name_input",
          "role": "textbox",
          "tag": "input",
          "type": "text",
          "text": "",
          "label": "Full Name",
          "placeholder": "Enter your name",
          "value": "",
          "bbox": [120, 200, 350, 42],
          "visible": true,
          "enabled": true
        }
      ],
      "checklist": {}
    },
    "screenshot": {
      "mime_type": "image/jpeg",
      "data": "<base64_encoded_redacted_frame>"
    },
    "available_keys": [
      "<VAULT_FULL_NAME>",
      "<VAULT_EMAIL>",
      "<VAULT_PHONE>"
    ],
    "execution_results": [
      {
        "action_id": "a1",
        "success": true,
        "action": "CLICK",
        "detail": "ID: #submit_btn",
        "retries": 0
      }
    ],
    "validation_feedback": [
      {
        "element_id": "full_name_input",
        "action_id": "a1",
        "filled": true,
        "actual_value": "[REDACTED]",
        "expected_value": "[REDACTED]",
        "error": null
      }
    ]
  }
  ```
* **Response Payload (`InferResponse`):**
  ```json
  {
    "session_id": "sess_1725518400",
    "status": "continue",
    "thought": "Typing name using vault token into #full_name_input",
    "actions": [
      {
        "action_id": "act_1",
        "type": "TYPE",
        "target": "full_name_input",
        "x": 295.0,
        "y": 221.0,
        "text": "<VAULT_FULL_NAME>",
        "press_enter": false
      }
    ],
    "checkpoint": true,
    "reason": "Filling registration fields",
    "timings": {
      "session_ms": 1.2,
      "prompt_ms": 3.4,
      "vlm_ms": 420.0,
      "actions_ms": 2.1,
      "total_ms": 426.7
    }
  }
  ```

---

## 6. Supported Browser Actions (`ActionType`)

Dispatched by `lib/action-executor.js` via Chrome DevTools Protocol:

| Action Type | Key Parameters | Execution Implementation |
| :--- | :--- | :--- |
| `CLICK` / `CHECK` | `target` (ID/selector) OR `(x, y)` | If `target` specified, executes `clickElement(target)` or `smartFill()`. If coordinates, dispatches `Input.dispatchMouseEvent` (`mousePressed`, `mouseReleased`) with Gaussian jitter and Retina DPR scaling. |
| `DOUBLE_CLICK` | `target` OR `(x, y)` | Two consecutive clicks with 50ms interval. |
| `TYPE` / `VAULT_FILL` | `target`, `text`, `press_enter` OR `(x, y)` | Detokenizes vault tokens (`<VAULT_*>`). For `target`, dispatches native prototype value setter and events (`input`, `change`, `submit`). For coordinates, clicks field then dispatches `Input.dispatchKeyEvent` with inter-key human cadence. |
| `SELECT` | `target`, `optionText` OR `(x, y)` | Finds `<option>` matching text or value, updates `<select>`, and fires `change` event. |
| `SCROLL` | `target` OR `delta_y`, `delta_x`, `x`, `y` | Elements scrolled into view via `scrollIntoView({ behavior: 'instant', block: 'center' })`. Viewport scrolled via `Input.dispatchMouseEvent` with `mouseWheel`. |
| `PRESS_KEY` | `key` (e.g. `"Enter"`, `"Tab"`, `"Escape"`) | Dispatches CDP keydown/keyup with virtual keycodes. |
| `HOVER` | `target` OR `(x, y)` | Synthetic mouseMoved event. |
| `DRAG` | `fromX`, `fromY`, `toX`, `toY` | Mouse down, smooth interpolated mouse move, mouse up. |
| `WAIT` | `duration_ms` (default 1000) | Delays agent loop. |
| `NAVIGATE` | `url` | Calls `Page.navigate`. |
| `BACK` | None | Calls `Page.navigateToHistoryEntry` or `history.back()`. |
| `ASK_USER` | `question`, `suggestedVaultKey` | Pauses agent in `WAITING_FOR_USER`, sends `BG_HITL_PROMPT`, awaits `POPUP_HITL_RESPONSE`. |
| `REQUIRE_APPROVAL` | `context`, `detail` | Pauses agent in `WAITING_FOR_APPROVAL`, sends `BG_APPROVAL_PROMPT`, awaits `POPUP_APPROVAL_RESPONSE`. |
| `TERMINATE` / `FINISH` | `text` (completion message) | Transitions state to `FINISHED`, stops agent, adds success history record. |

---

## 7. AI/ML Models & Privacy Pipeline

### 7.1 Local On-Device Vision ML
* **Runtime:** Transformers.js + ONNX Runtime Web (`lib/ort/ort.min.js`, `ort-wasm-simd.wasm`, `ort-wasm.wasm`).
* **Model:** `Xenova/owlvit-base-patch16` (Zero-shot object detection) and `models/yolo_pii_nano.onnx`.
* **Classes Detected:** `['face', 'human face', 'profile photo', 'credit card', 'id card', 'driver license', 'qr code', 'text input']`.
* **Confidence Threshold:** `0.15`.
* **Bounding Boxes Output:**
  ```javascript
  {
    id: "ML_DETECTED_FACE_AVATAR_1",
    category: "FACE_AVATAR" | "CREDIT_CARD" | "ID_DOCUMENT" | "QR_CODE" | "VISUAL_PII",
    boundingBox: { x, y, width, height },
    redactionLabel: "[REDACTED_AVATAR_#1]"
  }
  ```

### 7.2 Zero-Leakage Privacy Engine (`privacy_engine.js`)
* **Redaction Stylization:** Renders dark container badge (`#0f172a`) with cyan border (`#38bdf8`) and centered label:
  * `••••••••••••` for passwords, pins, credentials
  * `[REDACTED_CARD_****]` for credit cards (validated with Luhn algorithm)
  * `[REDACTED_AADHAAR_****]` for 12-digit Aadhaar numbers
  * `[REDACTED_PAN_****]` for 10-character Indian PAN cards
  * `[REDACTED_EMAIL@DOMAIN]` for email addresses
  * `[REDACTED_PHONE_+91]` for Indian 10-digit mobile numbers
  * `[REDACTED_AVATAR]` for human faces/profile pictures
* **Zero-Leakage Outgoing Validation (`validatePayload`):**
  Scans all leaf strings and numbers in the outgoing JSON payload. If any raw Aadhaar, PAN, Card, Phone, or Email is found unmasked, throws `SECURITY ALERT: Blocked outgoing payload` and **fails closed** (drops frame).

---

## 8. Frontend UI Binding Specifications

Every frontend element in `popup/popup.html` maps to the following exact contracts:

### 8.1 Dashboard Tab (`tab-agent`)
1. **Goal Input:** `#goalInput` (text input).
2. **Start Button:** `#startBtn` → Dispatches `POPUP_START_AGENT` with `{ goal, targetTabId }`.
3. **Stop Button:** `#stopBtn` → Dispatches `POPUP_STOP_AGENT` with `{ targetTabId }`.
4. **State Indicator:** `#statusDot` and `#headerState` → Bound to `AgentState` (`IDLE`, `RUNNING`, `PAUSED`, `ERROR`, `FINISHED`, `WAITING_FOR_USER`, `WAITING_FOR_APPROVAL`).
5. **Connection Badge:** `#connectionBadge` → Displays `EXCELLENT`, `GOOD`, `FAIR`, `POOR`, `OFFLINE`.
6. **Video Feeds:**
   - Raw Canvas: `#liveStream` → Drawn from `AUDIT_FRAME_UPDATE.rawFrame` + `#liveStreamPlaceholder` visibility toggle.
   - Sanitized Canvas: `#annotatedStream` → Drawn from `AUDIT_FRAME_UPDATE.redactedFrame` + `#annotatedStreamPlaceholder`.
   - Expand Buttons: `.expand-btn[data-target="raw"]` and `.expand-btn[data-target="redacted"]` → Opens `#videoModal`.
7. **Metrics Row:**
   - Steps: `#stepCount` / `#maxSteps`
   - Frames: `#frameCount`
   - Latency: `#latencyMs` + `#sparklineCanvas` (Canvas 2D line graph with 500ms benchmark)
   - Redactions: `#redactionCount`
   - FPS: `#fpsCount`
   - Dropped: `#skippedCount`
   - Quality / DPR: `#qualityDisplay`, `#dprDisplay`
8. **Execution Terminal:**
   - Container: `#terminalBody` → Listens for `AUDIT_ACTION_LOG`. Color-codes `[INFO]`, `[ACT]`, `[ERR]`, `[WARN]`, `[OK]`, `[SYS]`.
   - Export Button: `#exportLogBtn` → Calls `POPUP_EXPORT_LOG`, triggers text file download.

### 8.2 Settings Tab (`tab-settings`)
* Inputs:
  * Server URL: `#setting-serverUrl` ↔ `backendUrl`
  * Max Steps: `#setting-maxSteps` ↔ `maxSteps`
  * Timeout: `#setting-timeout` ↔ `serverTimeoutMs`
  * Capture Quality: `#settCaptureQuality` ↔ `captureQuality`
  * Stabilize Delay: `#settStabilizeDelay` ↔ `stabilizeDelayMs`
  * Request Jitter: `#setting-jitter` ↔ `humanizeInputs`
  * Delta Synchronization: `#setting-delta` ↔ `enableDeltaFrames`
  * Live Audit Logging: `#setting-liveAudit` ↔ `enableAuditStream`
* Actions:
  * Save Button: `#saveSettingsBtn` → Sends `POPUP_UPDATE_SETTINGS`.
  * Reset Button: `#resetSettingsBtn` → Sends `POPUP_UPDATE_SETTINGS` with `DEFAULT_SETTINGS`.
  * Status Toast: `#settingsMsg` → "Settings saved" indicator.
  * Test Connection: `#btnTestConnection` → Must query `backendUrl + "/health"` (Fix required: currently queries `/api/health` and `"agentSettings"`).

### 8.3 History Tab (`tab-history`)
* List Container: `#historyList` → Populated from `POPUP_GET_HISTORY`.
* Empty State: `#historyEmpty` with action button `#emptyGoToAgentBtn` (switches to agent tab).
* Clear History: `#clearHistoryBtn` → Sends `POPUP_CLEAR_HISTORY`.
* Cards: Displays goal title, status tag (`text-primary` or `text-error`), steps count, formatted duration, and timestamp.

### 8.4 Identity Vault Tab (`tab-vault`)
* Count Badge: `#vaultFilledCount`
* Vault Card List: `#vaultList` → Populated from `POPUP_VAULT_GET`.
* Add Item Form: `#vaultAddForm` (`#vaultAddKey`, `#vaultAddValue`) → Sends `POPUP_VAULT_SET`.
* Item Actions:
  * Mask/Unmask Toggle: Eye icon toggles between `password` and `text` input.
  * Inline Edit & Save: Enables input editing and dispatches `POPUP_VAULT_SET`.
  * Delete: Dispatches `POPUP_VAULT_DELETE`.
* Clear All: `#clearVaultBtn` → Dispatches `POPUP_VAULT_FLUSH`.
* Status Toast: `#vaultMsg`.

### 8.5 Interactive Overlays
* **Human-In-The-Loop Dialog (`#hitlOverlay`):**
  * Displayed on `BG_HITL_PROMPT`.
  * `#hitlQuestion`: Question text.
  * `#hitlInput`: Answer field (with smart auto-placeholder for DOB, Phone, Email, etc.).
  * `#hitlSaveToVault` & `#hitlVaultKey`: Checkbox and key indicator to save answer into vault.
  * `#hitlSendBtn`: Sends `POPUP_HITL_RESPONSE`.
* **Action Approval Dialog (`#approvalOverlay`):**
  * Displayed on `BG_APPROVAL_PROMPT`.
  * `#approvalContext`: Sensitive action category (payment, delete, submit).
  * `#approvalDetail`: Action JSON payload.
  * `#approvalApproveBtn` / `#approvalDenyBtn`: Sends `POPUP_APPROVAL_RESPONSE` `{ approved: true/false }`.
* **Fullscreen Video Modal (`#videoModal`):**
  * `#modalTitle`: Active stream title.
  * `#modalCanvas`: Mirrored canvas rendering at native resolution via `requestAnimationFrame`.
  * `#modalClose`: Closes modal (also bound to Escape key).

---

## 9. Identified Frontend Defects & Remediation Requirements

During investigation of existing contracts vs frontend implementations, the following discrepancies were identified:

1. **Test Connection Bug in `popup.js` (Line 212):**
   * *Issue:* `btnTestConnection` reads `data?.agentSettings?.backendUrl` from storage key `"agentSettings"`, but storage manager saves to `"userSettings"`. Furthermore, it appends `/api/health`, whereas the FastAPI route is registered at `/health`.
   * *Remediation:* Read from `"userSettings"` (or call `POPUP_GET_SETTINGS`), and test against `${backendUrl}/health`.
2. **Missing Event Listener for Empty History Action:**
   * *Issue:* `#emptyGoToAgentBtn` in `#historyEmpty` is injected dynamically when history is empty, but has no click event handler wired to switch tabs to the agent dashboard.
   * *Remediation:* Wire `#emptyGoToAgentBtn` to switch tab to `agent`.
3. **Settings Field ID Consistency:**
   * *Issue:* IDs in `popup.html` are split between kebab-case and camelCase (`settCaptureQuality`, `settStabilizeDelay`, `setting-timeout`, `setting-serverUrl`).
   * *Remediation:* Ensure all form getters and setters strictly map to the exact IDs present in `popup.html` without renaming.
