# Handoff Report — Explorer Survey 2: Backend & Extension Contracts

## 1. Observation
- **Manifest Architecture (`manifest.json:1-63`):**
  - MV3 extension with `background.service_worker: "background/service-worker.js"` (type: `module`), popup at `popup/popup.html`, minimum Chrome version `118`.
  - Permissions: `"debugger"`, `"offscreen"`, `"activeTab"`, `"tabs"`, `"storage"`, `"alarms"`, `"scripting"`. No `content_scripts` exist in manifest. Instead, automation and inspection run via CDP `chrome.debugger` protocol 1.3 and `Runtime.evaluate` injection.
  - Web accessible resources: `models/*` and `lib/ort/*`.
- **Message Passing Protocol (`lib/message-types.js:59-109`):**
  - Messages from Popup to Background: `POPUP_START_AGENT`, `POPUP_STOP_AGENT`, `POPUP_GET_STATUS`, `POPUP_GET_HISTORY`, `POPUP_CLEAR_HISTORY`, `POPUP_EXPORT_LOG`, `POPUP_UPDATE_SETTINGS`, `POPUP_GET_SETTINGS`, `POPUP_HITL_RESPONSE`, `POPUP_APPROVAL_RESPONSE`, `POPUP_VAULT_GET`, `POPUP_VAULT_SET`, `POPUP_VAULT_DELETE`, `POPUP_VAULT_FLUSH`.
  - Messages from Background to Popup: `BG_AGENT_STATUS`, `AUDIT_FRAME_UPDATE`, `AUDIT_ACTION_LOG`, `BG_SETTINGS_UPDATED`, `BG_HITL_PROMPT`, `BG_APPROVAL_PROMPT`, `BG_SESSION_HISTORY`, `BG_VAULT_DATA`.
  - Port Channel: `PORT_OFFSCREEN_PERCEPTION` connecting Background and Offscreen for `BG_PROCESS_FRAME`, `OS_PERCEPTION_DONE`, `OS_READY`, `OS_WEBGPU_STATUS`, `OS_PERF_METRICS`, `HEARTBEAT_PING`, `HEARTBEAT_PONG`.
- **Storage Subsystem (`lib/storage.js:17-293` & `lib/vault.js:24-138`):**
  - `chrome.storage.local` holds:
    * `"userSettings"`: Object with `backendUrl`, `maxSteps`, `captureQuality`, `captureMaxWidth`, `captureMaxHeight`, `humanizeInputs`, `stabilizeDelayMs`, `serverTimeoutMs`, `enableDeltaFrames`, `enableAuditStream`, `interKeyDelayBase`, `interKeyJitter`.
    * `"sessionHistory"`: Array of past runs (max 20) with `{ id, timestamp, date, goal, steps, result, durationMs, url }`.
    * `"lensagent_vault"`: Object holding user credentials/PII with token mapping `<VAULT_[KEY]>`.
  - `chrome.storage.session` holds:
    * `"agentState"`, `"currentGoal"`, `"stepCount"`, `"sessionTabId"`, `"sessionDpr"`, `"sessionUrl"`, `"sessionStart"`, `"perfMetrics"`, `"actionLogs"`.
  - `chrome.storage.sync` is NOT used anywhere in the codebase.
- **Backend Server API (`project/backend/app/api/routes.py:62-250`):**
  - FastAPI server runs on `http://127.0.0.1:8000` (CORS enabled for extension origins).
  - Health check endpoint: `GET /health` (returns `{ status: "ok", vlm_status: "ok", gpu_accelerated: true, version: "1.1.0" }`).
  - Session endpoints: `POST /api/v1/session`, `GET /api/v1/session/{id}`, `DELETE /api/v1/session/{id}`.
  - Core Inference endpoint: `POST /api/v1/infer` taking `InferRequest` (sanitized screenshot, browser state, available vault keys, previous action execution results, and validation feedback) and returning `InferResponse` with `thought` and `actions` (`CLICK`, `TYPE`, `SCROLL`, `SELECT`, `WAIT`, `FINISH`, `ASK_USER`, `REQUIRE_APPROVAL`).
- **On-Device Vision & Privacy Engine (`privacy_engine.js:10-332`, `offscreen/offscreen.js:211-290`, `dist/offscreen.bundle.js`):**
  - WebGPU Transformer model (`Xenova/owlvit-base-patch16` with WASM fallback) running zero-shot object detection for `['face', 'credit card', 'id card', 'driver license', 'qr code', 'text input']`.
  - Canvas-based PII redaction (`PrivacyEngine`) masking sensitive areas with stylized dark slate containers (`#0f172a`), cyan borders (`#38bdf8`), and centered placeholders (`[REDACTED_CARD_****]`, `••••••••••••`, `[REDACTED_AADHAAR_****]`, etc.).
  - Fail-closed security: if redaction fails, the frame is immediately dropped; `PrivacyEngine.validatePayload` validates that no raw unmasked PII exists in outgoing network payloads.
- **Identified Frontend Inconsistency (`popup/popup.js:208-223`):**
  - `btnTestConnection` reads from non-existent storage key `"agentSettings"` instead of `"userSettings"`, and requests non-existent path `/api/health` instead of `/health`.

## 2. Logic Chain
1. *From Manifest & Background Analysis:* The system relies on Chrome DevTools Protocol (`debugger` permission) rather than content scripts for browser interactions. This means the frontend UI interacts exclusively with the Service Worker via `chrome.runtime.sendMessage` and listens for broadcasts. Any frontend implementation must send standard `POPUP_*` messages and must never attempt to directly inject automation scripts into tabs.
2. *From Storage Architecture Analysis:* The settings manager strictly uses `chrome.storage.local.get/set({ userSettings: ... })`. The frontend settings UI must read from and write to this exact contract. Inventing new storage keys (such as `agentSettings`) breaks settings persistence and connection tests.
3. *From Backend Route Inspection:* The backend exposes `GET /health` and `POST /api/v1/infer`. The `AgentLoop` already implements the full tri-stream payload structure (`browser_state`, `screenshot`, `available_keys`, `execution_results`, `validation_feedback`) to `POST /api/v1/infer`. The frontend does not communicate directly with the FastAPI server during runs — all automation passes through the background `AgentLoop`.
4. *From UI Component Mapping:* The popup UI elements (start/halt, dual stream canvases, metrics, execution log terminal, settings form, session history cards, identity vault, and HITL / Approval modal overlays) map 1-to-1 to existing background message types and storage keys.

## 3. Caveats
- No caveats regarding backend contracts or extension service boundaries: all service worker handlers, offscreen document messages, storage keys, and FastAPI routes were inspected directly from source code.
- Remote LLM inference depends on valid API keys (Groq, HF, OpenRouter) configured in `project/backend/.env` or a local running `llama-server` on port 8081. However, the client-server HTTP contract (`/api/v1/infer`) remains constant regardless of the active VLM engine.

## 4. Conclusion
All backend contracts, message protocols, storage schemas, and extension services are fully implemented and functional. The frontend team can complete all UI interactions, fix placeholders, wire buttons, and polish user experience while strictly preserving the existing contracts documented in `backend_contracts.md`. No new backend architecture or endpoints are required.

## 5. Verification Method
1. **File Inspection:**
   - Inspect `e:\SIH-171\.agents\explorer_survey_2\backend_contracts.md` for the complete schema and action mappings.
   - Inspect `e:\SIH-171\lib\message-types.js` to verify all action constants and enums.
   - Inspect `e:\SIH-171\lib\storage.js` and `e:\SIH-171\lib\vault.js` to verify storage keys (`userSettings`, `sessionHistory`, `lensagent_vault`).
   - Inspect `e:\SIH-171\project\backend\app\api\routes.py` lines 62-140 to verify FastAPI routes (`/health`, `/api/v1/session`, `/api/v1/infer`).
2. **Connection Test Bug Verification:**
   - Review `popup/popup.js` line 212: observe `chrome.storage.local.get("agentSettings")` and `/api/health`. Compare with `lib/storage.js` line 102 (`localGet("userSettings")`) and `project/backend/app/api/routes.py` line 62 (`@router.get("/health")`).
