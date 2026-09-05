# Project: LensAgent Frontend Production Overhaul
# Scope: Global Architecture, Feature Inventory & Milestone Decomposition

## Architecture
LensAgent is an autonomous AI browser agent built as a Chrome Manifest V3 extension with:
1. **Frontend**: Native ES Modules (`popup/popup.html`, `popup/popup.js`, `popup/popup.css` compiled from `popup/input.css` via Tailwind CSS v3.4.19).
2. **Extension Core**:
   - `background/service-worker.js`: Orchestrates CDP automation (`chrome.debugger`), message dispatching, and agent loop execution.
   - `offscreen/offscreen.html` & `offscreen/offscreen.js`: WebGPU on-device vision perception (`owlvit-base-patch16` / WASM) and canvas-based PII redaction (`PrivacyEngine`).
   - `lib/`: `storage.js`, `vault.js`, `message-types.js`, `action-executor.js`, `agent-loop.js`.
3. **Backend**: FastAPI server (`project/backend/app/main.py`) providing `/health` and `/api/v1/infer` for VLM reasoning.

Data Flow & Contracts:
- Popup communicates with Service Worker strictly via `chrome.runtime.sendMessage` using `POPUP_*` actions defined in `lib/message-types.js`.
- Service Worker broadcasts state updates to Popup via `BG_*` actions.
- Persistent state lives in `chrome.storage.local` under keys `userSettings`, `sessionHistory`, and `lensagent_vault`.
- Ephemeral agent session state lives in `chrome.storage.session`.
- PII redaction occurs offscreen before any frame egresses to the backend inference endpoint.

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | Tooling & NPM Scripts | Add npm scripts (`build:css`, `watch:css`, `lint`, `test`) and package config | M1 | Explorer 3 |
| 2 | Dependency Installation | Resolve root dependencies cleanly (`tailwindcss`, `playwright`, `eslint`) | M1 | Explorer 3 |
| 3 | Codebase Hygiene | Remove dead/shadowed duplicate `lib/agent-loop-test.js` | M1 | Explorer 3 |
| 4 | Test Harness Setup | Headless Playwright runner and test harness setup (`--headless=new`) | M1 | Explorer 3 |
| 5 | Fluid Popout Viewport | Remove hardcoded 800x600 body constraint; responsive full-window tab mode | M2 | Explorer 1 |
| 6 | Responsive Shell & Grid | Adaptive sidebar, telemetry bar, and video feed for mobile/tablet/desktop | M2 | Explorer 1 |
| 7 | Accessible Focus Rings | Remove `outline: none !important` and add WCAG compliant focus indicators | M2 | Explorer 1 |
| 8 | Accessible Form Labels | Add explicit `for` attributes to all form labels matching input IDs | M2 | Explorer 1 |
| 9 | Nav Tabs Lifecycle | Standardize hover, active, focus, and disabled states across navigation | M2 | Explorer 1 |
| 10 | Enter Key Execution | Allow pressing Enter in `#goalInput` to trigger agent execution | M3 | Explorer 1 |
| 11 | Terminal Auto-Scroll | Fix auto-scroll by scrolling the parent `overflow-y-auto` container | M3 | Explorer 1 |
| 12 | Dual Stream States | Live and Privacy-masked canvas loading, empty, and streaming states | M3 | Explorer 1 |
| 13 | Agent Control States | Start, Stop, Pause button lifecycles (loading, disabled, hover, active) | M3 | Explorer 1 |
| 14 | Telemetry Error States | Visual error handling and zero-state formatting for FPS, tokens, latency | M3 | Explorer 1 |
| 15 | Backend Connection Fix | Query `userSettings` (not `agentSettings`) and query `/health` on `#btnTestConnection` | M4 | Explorer 1 & 2 |
| 16 | Offline Badge CSS | Add `.offline` class mapping to `setConnectionBadge` in popup.js | M4 | Explorer 1 |
| 17 | History Empty Button | Wire click handler on `#emptyGoToAgentBtn` to switch to Agent view | M4 | Explorer 1 |
| 18 | History Card Actions | Make history session cards inspectable, re-runnable, and individually deletable | M4 | Explorer 1 |
| 19 | History Controls UX | Add disabled state to `#clearHistoryBtn` when history is empty | M4 | Explorer 1 |
| 20 | Settings Form UX | Validation, persistence feedback, and reset confirmation in Settings tab | M4 | Explorer 1 |
| 21 | Indian PII Presets | Quick-add buttons for Aadhaar, PAN, Passport, Phone (+91), PIN Code, Voter ID | M5 | Explorer 1 |
| 22 | Touch-Friendly Vault | Make edit/delete/reveal actions accessible without requiring desktop hover | M5 | Explorer 1 |
| 23 | Vault Form Validation | Input sanitization, duplicate key prevention, and feedback alerts | M5 | Explorer 1 |
| 24 | Masked / Reveal Toggle | Secure toggle for viewing vault values with accessible state labels | M5 | Explorer 1 |
| 25 | Clear Vault UX | Add disabled state when vault is empty and confirmation prompt | M5 | Explorer 1 |
| 26 | HITL Modal Abort Button | Add cancel/abort button to `#hitlOverlay` to prevent modal focus trapping | M6 | Explorer 1 |
| 27 | Approval Modal Controls | Full interaction states on `#btnApproveAction` and `#btnRejectAction` | M6 | Explorer 1 |
| 28 | Modal Keyboard Escape | Listen for Escape key to safely close/cancel open modals | M6 | Explorer 1 |
| 29 | E2E Test Suite (T1-T4) | Complete opaque-box test suite passing 100% (Unit, Component, System, E2E) | M7 | Explorer 3 |
| 30 | Adversarial Hardening | Tier 5 white-box challenger test generation and edge case hardening | M7 | Explorer 3 |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Tooling & Packaging | `package.json`, Tailwind scripts, dependency install, dead file cleanup | none | PLANNED |
| M2 | Responsive Shell & A11y | `popup.html`, `input.css`, `popup.css`: fluid layout, responsive grid, focus rings | M1 | PLANNED |
| M3 | Agent View & Execution UX | `popup.html`, `popup.js`: Enter key goal submission, terminal auto-scroll, dual stream | M2 | PLANNED |
| M4 | Settings & History Views | `popup.html`, `popup.js`: Connection test fix, history empty button, card interactions | M2 | PLANNED |
| M5 | Identity Vault & Indian PII | `popup.html`, `popup.js`, `lib/vault.js`: Indian PII presets, touch actions, validation | M2 | PLANNED |
| M6 | Modals & HITL Controls | `popup.html`, `popup.js`: HITL abort button, approval states, Escape key handling | M3, M4 | PLANNED |
| M7 | E2E Test Pass & Hardening | Phase 1 (Tiers 1-4 pass 100%) + Phase 2 (Tier 5 adversarial hardening) | M1-M6, TEST_READY.md | PLANNED |

## Parallel Track: E2E Testing Track
- **Owner**: E2E Testing Orchestrator (`teamwork_preview_orchestrator`)
- **Scope**: Requirement-driven opaque-box test suite (Tier 1 Feature, Tier 2 Boundary, Tier 3 Combinatorial, Tier 4 Real-World) using headless Playwright (`--headless=new`).
- **Deliverable**: `TEST_INFRA.md` and `TEST_READY.md` with full coverage matrix across all 30 features.

## Interface Contracts
### Popup ↔ Background Service Worker (`lib/message-types.js`)
- `POPUP_START_AGENT`: `{ action: "POPUP_START_AGENT", goal: string, options: object }` -> `{ status: "STARTING" | "RUNNING" }`
- `POPUP_STOP_AGENT`: `{ action: "POPUP_STOP_AGENT", reason: string }` -> `{ status: "STOPPING" | "STOPPED" }`
- `POPUP_GET_STATUS`: `{ action: "POPUP_GET_STATUS" }` -> `{ state: string, stepCount: number, currentGoal: string, perfMetrics: object }`
- `POPUP_GET_SETTINGS`: `{ action: "POPUP_GET_SETTINGS" }` -> `{ settings: UserSettings }`
- `POPUP_UPDATE_SETTINGS`: `{ action: "POPUP_UPDATE_SETTINGS", settings: Partial<UserSettings> }` -> `{ success: boolean }`
- `POPUP_HITL_RESPONSE`: `{ action: "POPUP_HITL_RESPONSE", response: string, aborted?: boolean }` -> `{ success: boolean }`
- `POPUP_APPROVAL_RESPONSE`: `{ action: "POPUP_APPROVAL_RESPONSE", approved: boolean, reason?: string }` -> `{ success: boolean }`
- `POPUP_VAULT_GET` / `SET` / `DELETE` / `FLUSH`: Vault management message contracts.

### Popup ↔ Chrome Storage (`lib/storage.js`)
- `chrome.storage.local.get("userSettings")` -> `{ userSettings: { backendUrl, maxSteps, captureQuality, captureMaxWidth, captureMaxHeight, humanizeInputs, stabilizeDelayMs, serverTimeoutMs, enableDeltaFrames, enableAuditStream, interKeyDelayBase, interKeyJitter } }`
- `chrome.storage.local.get("sessionHistory")` -> `{ sessionHistory: Array<{ id, timestamp, date, goal, steps, result, durationMs, url }> }`
- `chrome.storage.local.get("lensagent_vault")` -> `{ lensagent_vault: Record<string, { key, value, created_at }> }`

### Popup ↔ Backend Health API (`project/backend/app/api/routes.py`)
- `GET ${backendUrl}/health` -> `{ status: "ok", vlm_status: "ok", gpu_accelerated: boolean, version: string }`

## Code Layout
- `popup/`:
  * `popup.html`: Structure and markup for extension popup and tab view.
  * `input.css`: Source Tailwind CSS with custom utility classes and design tokens.
  * `popup.css`: Compiled CSS bundle (generated by Tailwind CLI).
  * `popup.js`: DOM event handling, message dispatching, UI reactivity.
- `background/`:
  * `service-worker.js`: Background worker, CDP debugger bridge, life cycle coordinator.
- `offscreen/`:
  * `offscreen.html`, `offscreen.js`: WebGPU perception pipeline, canvas PII redaction.
- `lib/`:
  * `message-types.js`: Canonical message constants and payload interfaces.
  * `storage.js`: Local and session storage abstraction layer.
  * `vault.js`: Credential and PII vault management with tokenization.
- `tests/`:
  * `e2e/`: Automated Playwright test suites (Tiers 1-4).
