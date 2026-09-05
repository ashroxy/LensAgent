# LensAgent Frontend Comprehensive Audit Report
**Project**: SIH-171 LensAgent — Privacy-Preserving Visual Browser Agent  
**Auditor**: Explorer 1 (Survey Phase)  
**Date**: September 5, 2026  
**Scope**: Full codebase audit of frontend entry points, UI pages, routes, popup views, dashboards, tabs, modals, components, states, responsiveness, design tokens, and backend contracts.

---

## 1. Executive Summary

LensAgent is an autonomous, privacy-preserving visual browser automation agent implemented as a Manifest V3 Chrome Extension. The user interface is built as a single-page neumorphic dashboard (`popup/popup.html`, controlled by `popup/popup.js`) with static CSS compiled via Tailwind CSS v3.4.19 (`popup/popup.css` from `popup/input.css`).

While the core neumorphic aesthetic is distinctive and the dual-canvas visual architecture is ambitious, the current frontend codebase suffers from several critical defects:
1. **Broken Backend Connectivity Flow**: The connection test button queries `/api/health`, but the backend only provides `/health`, guaranteeing a 404 failure and false "OFFLINE" badges.
2. **Dead Buttons & Unwired Interactions**: Actionable buttons such as `#emptyGoToAgentBtn` ("Run an agent") in History have zero event listeners. Enter-key submission is absent on the primary goal input. History session cards cannot be inspected, re-run, or deleted individually.
3. **Broken Terminal Log Auto-Scroll**: The scroll position is updated on an unscrollable child element (`terminalBody`) rather than its scrolling container, breaking real-time log auto-scrolling.
4. **Hardcoded Fixed Viewport & Broken Responsiveness**: The popup body is locked to a hardcoded `800px x 600px` inline style and CSS rule. In pop-out mode (full browser tab), the UI is pinned into an awkward 800x600 box in the screen corner; in standard popup mode on scaled/small displays, it overflows. Responsive classes present in Tailwind are completely unused in `popup.html`.
5. **Identity Vault Gaps vs. Mission Goal**: Despite the project mission being on-device Indian PII redaction and vault detokenization, the Vault UI offers no quick presets for standard Indian PII fields (Aadhaar, PAN, Passport, Phone, PIN Code), and its edit/delete controls are invisible on touch/mobile screens due to `opacity-0` hover gating.
6. **Accessibility & State Handling Deficits**: Critical form inputs lack focus outlines (`border-none outline-none`), icon-only buttons lack `aria-label`s, labels lack `for` attributes, and buttons remain active when empty (e.g. Clear Vault, Clear History).

---

## 2. Complete Inventory of Frontend Views & Components

| Component / View | File / Path | Selector / ID | Purpose & Architecture |
| :--- | :--- | :--- | :--- |
| **Main Extension Popup** | `popup/popup.html`<br/>`popup/popup.js` | `<body style="width: 800px; height: 600px;">` | Primary UI shell, loaded on extension action icon click. Also runs in full-tab popout mode. |
| **Side Navigation Bar** | `popup/popup.html` | `<nav class="w-[200px] ...">` | 200px fixed sidebar containing logo, version pill (`v1.0.0-stable`), and 4 nav buttons (`agent`, `settings`, `history`, `vault`). |
| **Top Application Bar** | `popup/popup.html` | `<header class="h-16 ...">` | Header with `#headerTitle`, Pop-out tab button (`#btnPopout`), Test Connection sensor (`#btnTestConnection`), Status Dot (`#statusDot`), Status Text (`#headerState`), and Connection Badge (`#connectionBadge`). |
| **Agent Tab** | `popup/popup.html` | `#tab-agent` | Primary control room. Contains goal input row, dual canvas stream displays, 7-metric telemetry row, and execution terminal log. |
| **Goal Input & Controls** | `popup/popup.html` | `#goalInput`, `#startBtn`, `#stopBtn`, `#errorMsg` | User objective input field with Start (`play_arrow`) and Halt (`stop`) controls, and inline error banner. |
| **Raw Viewport Stream** | `popup/popup.html` | `#liveStream`, `#liveStreamPlaceholder` | 1280x720 HTML5 Canvas rendering unredacted screencast frames with detection bounding boxes overlaid. Includes fullscreen button. |
| **Sanitized Stream** | `popup/popup.html` | `#annotatedStream`, `#annotatedStreamPlaceholder` | 1280x720 HTML5 Canvas rendering sanitized frames with Indian PII redacted and masked. Includes "Live" pulse pill and fullscreen button. |
| **Telemetry Metrics Bar** | `popup/popup.html` | `.neu-flat > .grid-cols-7` | 7 recessed metric counters: Steps (`#stepCount`/`#maxSteps`), Frames (`#frameCount`), Latency (`#latencyMs`) + Sparkline (`#sparklineCanvas`), Redactions (`#redactionCount`), FPS (`#fpsCount`), Dropped (`#skippedCount`), Quality/DPR (`#qualityDisplay`/`#dprDisplay`). |
| **Execution Log (Terminal)** | `popup/popup.html` | `#terminalBody`, `#exportLogBtn` | Chronological action log viewer with color-coded type pills (`[INFO]`, `[ACT]`, `[ERR]`, `[WARN]`, `[OK]`, `[SYS]`), timestamping, and text file export. |
| **Settings Tab** | `popup/popup.html` | `#tab-settings` | System configuration. Connection card (5 numeric/url fields) and Behaviors card (3 neumorphic toggle switches: Jitter, Delta, Live Audit) + Reset and Save buttons. |
| **History Tab** | `popup/popup.html` | `#tab-history` | Session archive. Header with Clear History button (`#clearHistoryBtn`), dynamic list (`#historyList`), and empty state card (`#historyEmpty`). |
| **Identity Vault Tab** | `popup/popup.html` | `#tab-vault` | Zero-knowledge identity manager. Header with count badge (`#vaultFilledCount`), dynamic card list (`#vaultList`), custom field form (`#vaultAddForm`), and Clear All button (`#clearVaultBtn`). |
| **HITL Modal Overlay** | `popup/popup.html` | `#hitlOverlay` | Human-In-The-Loop input prompt modal: question text (`#hitlQuestion`), answer input (`#hitlInput`), Save to Vault checkbox (`#hitlSaveToVault`), suggested key label (`#hitlVaultKey`), and Send button (`#hitlSendBtn`). |
| **Approval Modal Overlay**| `popup/popup.html` | `#approvalOverlay` | Sensitive action confirmation modal: warning icon, context text (`#approvalContext`), action detail code block (`#approvalDetail`), Reject (`#approvalDenyBtn`), Approve (`#approvalApproveBtn`). |
| **Fullscreen Video Modal**| `popup/popup.html` | `#videoModal` | Fullscreen modal overlay (100vw, 100vh, z-index 999999) with title (`#modalTitle`), close button (`#modalClose`), placeholder, and enlarged canvas (`#modalCanvas`). |
| **In-Page CDP Overlay** | `lib/agent-loop.js` | `#lens-agent-analyzing-overlay` | Injected into the active target tab via Chrome DevTools Protocol `Runtime.evaluate` to render green spinner and "Analyzing..." / red "Analysis Failed" overlay. |
| **Headless Perception Shell**| `offscreen/offscreen.html`<br/>`offscreen/offscreen.js` | `#inferenceCanvas` | MV3 Offscreen document holding WebGPU / ONNX Runtime context for local inference and canvas PII redaction. |
| **Test / Sandbox Harnesses**| `popup/popup_test.html`<br/>`project/8f10b6a.html`<br/>`project/testing/mock_popup.html`<br/>`project/backend/test_page.html` | Various | Test harnesses and design prototypes across development milestones. |

---

## 3. Detailed Gap Analysis & Defect Checklist

### 3.1 Dead Buttons & Missing Interactions

| Defect ID | Component / Element | File & Location | Description & User Impact | Severity |
| :--- | :--- | :--- | :--- | :--- |
| **GAP-01** | `#emptyGoToAgentBtn` ("Run an agent") | `popup/popup.html:249`<br/>`popup/popup.js:580,625` | **Dead button**. Rendered in the History empty state card both statically in HTML and dynamically in JS. Has **no event listener**. Clicking it produces zero action. Should switch to `agent` tab. | **High** |
| **GAP-02** | `#goalInput` (Enter key) | `popup/popup.js:172-195` | **Missing Enter key submission**. Pressing `Enter` while typing in the goal input does nothing. The user is forced to switch to the mouse and click `startBtn`. | **Medium** |
| **GAP-03** | History Session Cards | `popup/popup.js:584-609` | **Non-interactive cards with false affordance**. Cards feature `hover:scale-[1.01]` giving the impression of clickability, but have no click handler. Users cannot expand past step details, cannot re-run the goal, and cannot delete an individual session card. | **Medium** |
| **GAP-04** | Terminal Clear Button | `popup/popup.html:151-158` | **Missing action**. The Execution Log header contains an "Export" button, but no "Clear" button. Users cannot flush log entries during long or repeated sessions without restarting the extension. | **Low** |
| **GAP-05** | Video Canvases | `popup/popup.html:86-109` | **Missing click-to-expand**. Users must precisely click the tiny 24x24px button in the top corner to expand the stream; clicking anywhere on the video card or canvas does nothing. | **Low** |
| **GAP-06** | Vault Inline Editing | `popup/popup.js:794-814` | **Missing Enter/Escape handlers**. When editing a vault item value, pressing `Enter` does not save, pressing `Escape` does not cancel, and there is no Cancel button. | **Medium** |

### 3.2 Broken Flows & Backend Contract Misalignment

| Defect ID | Subsystem | Code Location | Description & Technical Root Cause | Severity |
| :--- | :--- | :--- | :--- | :--- |
| **GAP-07** | Test Connection / Health Check | `popup/popup.js:213`<br/>vs `project/backend/app/api/routes.py:62` | **404 Endpoint Mismatch**. `popup.js` calls `(url) + "/api/health"`. However, the FastAPI router in `routes.py` registers `@router.get("/health")`. Because the router is included without prefix (`app.include_router(router)` in `main.py:129`), the endpoint is `/health`. The test connection button fails with 404, setting the badge to "OFFLINE" or "POOR". | **Critical** |
| **GAP-08** | Offline Badge CSS Class | `popup/popup.js:503`<br/>vs `popup/popup.css:7` | **Missing Class Mapping**. In `setConnectionBadge(quality)`, line 503 checks `if (["excellent","good","fair","poor"].includes(q)) connBadge.classList.add(q)`. When `quality === "OFFLINE"`, `"offline"` is omitted from the array. The class `.conn-badge.offline` is never added, leaving the badge without its grey pill styling. | **Medium** |
| **GAP-09** | Terminal Auto-Scroll Failure | `popup/popup.html:159-160`<br/>vs `popup/popup.js:472` | **Wrong Scroll Target**. In `addLog()`, `actionLogEl.scrollTop = actionLogEl.scrollHeight`. But `actionLogEl` is `terminalBody`, an inner `<div>` without scroll styling. The outer container has `overflow-y-auto`. Setting `scrollTop` on the child does not scroll the parent. As logs append, the terminal stops following the latest action. | **High** |
| **GAP-10** | HITL Modal Cancellation Trap | `popup/popup.html:293-308`<br/>`popup/popup.js:892-976` | **User Trapped in Modal**. When `#hitlOverlay` appears (`z-[100]`), there is no "Cancel Task" or "Abort" button. If the user doesn't know the answer or wishes to stop the agent, they cannot reach `#stopBtn` because pointer events are blocked by the modal overlay backdrop. | **High** |
| **GAP-11** | Stream Placeholder Freeze | `popup/popup.js:283,300,506-510` | **Frozen Canvases on Agent Reset**. When the agent finishes or is stopped, `resetToIdle()` does not restore `liveStreamPlaceholder` or `annotatedStreamPlaceholder` ("Awaiting Signal"), nor does it clear or dim the canvases. The last captured frame remains frozen indefinitely, confusing the user about whether the agent is active. | **Medium** |
| **GAP-12** | Ignored Stage Telemetry | `lib/agent-loop.js:168-188`<br/>`popup/popup.js:417-439` | **Unused Backend Metrics**. The backend loop calculates `stageAvg` (timing for perception, decision, execution) and `serverErrors`. These metrics are broadcast in `BG_AGENT_STATUS` but completely ignored by `popup.js`, leaving users with no insight into bottlenecks. | **Low** |

### 3.3 UI/UX States & Accessibility Gaps

| Defect ID | Component | Gap Type | Observations & Recommended Fix | Severity |
| :--- | :--- | :--- | :--- | :--- |
| **GAP-13** | Vault Add & Edit Inputs | **Focus State Missing** | `#vaultAddKey` and `#vaultAddValue` have `.neu-flat`, `border-none outline-none`, and `input.border-none:focus-visible { outline: none !important; }`. When focused via keyboard Tab, there is **zero focus outline**. | **High** |
| **GAP-14** | Icon-Only Buttons | **Accessibility (A11y)** | `#btnPopout`, `#btnTestConnection`, `.expand-btn`, `#modalClose`, `toggleEyeBtn`, `editBtn`, `saveBtn`, `delBtn` lack `aria-label` attributes. Screen readers announce them as unlabeled buttons. | **Medium** |
| **GAP-15** | Form Labels | **Accessibility (A11y)** | None of the `<label>` elements in Agent Tab (`#goalInput`) or Settings Tab (`#setting-serverUrl`, `#setting-maxSteps`, etc.) use `for="..."` attributes linked to input IDs. | **Medium** |
| **GAP-16** | Clear Buttons | **Disabled State Missing** | `#clearVaultBtn` remains enabled when vault is empty, triggering an unnecessary confirmation prompt. `#clearHistoryBtn` remains enabled when history is empty. `#exportLogBtn` remains enabled when log is empty. | **Medium** |
| **GAP-17** | Start Button | **Loading State Missing** | Clicking `#startBtn` disables the button, but provides no visual spinner or "Starting..." text while CDP and WebGPU are initializing. | **Medium** |
| **GAP-18** | Goal Error Message | **Error Dismissal Missing** | `#errorMsg` under the goal input displays error text smoothly, but never auto-dismisses and does not clear when the user begins typing in `#goalInput`. | **Medium** |
| **GAP-19** | Settings Validation | **Input Validation Missing** | Inputs in the Settings tab lack `min`, `max`, `step`, and format validation in HTML. Invalid URLs or blank submissions pass through without frontend feedback. | **Medium** |
| **GAP-20** | Fullscreen Video Modal | **Dismissal Ergonomics** | `#videoModal` can only be closed by hitting `Escape` or clicking `#modalClose`. Clicking the empty backdrop outside the canvas does not dismiss the modal. | **Low** |

### 3.4 Responsive Design & Viewport Adaptability Gaps

| Defect ID | Viewport / Mode | Issue Description | Root Cause in Code |
| :--- | :--- | :--- | :--- |
| **GAP-21** | Pop-out Mode (Browser Tab) | Application does not adapt to screen width/height; renders in an 800x600 box in top-left of window. | `popup/popup.html:11` has hardcoded inline style `style="width: 800px; height: 600px;"` and `input.css:99` has fixed `body { width: 800px; height: 600px; }`. |
| **GAP-22** | Small Display / Scaled Screen | Popup can overflow screen boundaries on 1366x768 displays or with 125%/150% Windows DPI scaling. | Fixed 800x600 dimensions without fluid `max-w-full` or viewport constraints. |
| **GAP-23** | Navigation Bar (< 768px) | Sidebar remains 200px wide, taking 40-50% of screen width on narrow displays. | `popup/popup.html:13` hardcodes `w-[200px] h-full flex flex-col`. Does not utilize compiled responsive classes (`md:w-[200px]`, `md:flex-col`, `flex-row`). |
| **GAP-24** | Telemetry Grid (< 1024px) | 7 metric tiles are squeezed into ~45-60px each, causing text clipping and overflow. | Hardcoded `grid-cols-7` in `popup/popup.html:114` instead of responsive breakpoints (`grid-cols-2 sm:grid-cols-4 lg:grid-cols-7`). |
| **GAP-25** | Dual Video Feeds (< 768px) | Video feeds are forced side-by-side in `grid-cols-2`, becoming tiny and illegible. | Hardcoded `grid-cols-2` in `popup/popup.html:91` instead of `grid-cols-1 lg:grid-cols-2`. |
| **GAP-26** | Touch / Mobile Vault Actions | Edit and delete buttons on vault items are permanently invisible (`opacity-0`). | Vault item buttons use `opacity-0 group-hover:opacity-100`. On touch devices without hover, buttons cannot be seen or tapped. |

### 3.5 Visual Consistency, Typography & Design Tokens

| Defect ID | Category | Observation | Inconsistency / Violation |
| :--- | :--- | :--- | :--- |
| **GAP-27** | Typography Scale | Widespread arbitrary font sizes (`text-[9px]`, `text-[10px]`, `text-[11px]`, `text-[12px]`, `text-[13px]`, `text-[14px]`). | Sub-10px fonts (`text-[9px]` in metric labels) violate minimum readability standards. Lack of standardized typography classes. |
| **GAP-28** | Color Palette | `text-warning` is used in `#approvalOverlay`, but `warning` is not defined in `tailwind.config.js`. | Missing in Tailwind tokens; patched manually as an ad-hoc class in `popup.css`. |
| **GAP-29** | In-Page CDP Overlay | In `lib/agent-loop.js:798-888`, `#lens-agent-analyzing-overlay` uses garish `#00ff00` neon green and `#ff4444` red. | Complete visual disconnect with the Material/Neumorphic design system of the extension. |
| **GAP-30** | Dark Mode Support | `tailwind.config.js` sets `darkMode: "class"`, but `<html class="light">` is hardcoded. | No dark theme stylesheets, no theme toggle, and no `prefers-color-scheme` support. Neumorphic shadows only support light mode. |
| **GAP-31** | Contrast Ratios | Timestamp text `<span class="text-outline/50 ...">` on white container in Execution Log has ~2.6:1 contrast. | Fails WCAG AA minimum contrast requirement (4.5:1). |

---

## 4. Indian Identity Vault Analysis (SIH-171 Specific)

The core requirement of SIH-171 is **on-device WebGPU perception and Indian PII redaction with zero raw data egress**. The extension includes an Identity Vault (`lib/vault.js`) where users store private credentials locally, which the agent detokenizes before native CDP input injection (`detokenize('Hello <VAULT_FULL_NAME>')`).

### Current Gaps in Vault Implementation:
1. **No Quick-Add Presets for Indian PII**:
   - The backend and VLM recognize `<VAULT_AADHAAR>`, `<VAULT_PAN>`, `<VAULT_PASSPORT>`, `<VAULT_PHONE>`, `<VAULT_EMAIL>`, `<VAULT_ADDRESS>`, `<VAULT_PINCODE>`, `<VAULT_DOB>`, `<VAULT_GENDER>`.
   - The current UI only provides generic blank inputs: `Key (e.g. passport_num)` and `Value`.
   - Users are given no suggestion chips, preset lists, or pre-fill templates.
2. **Key Normalization Fragility**:
   - In `popup.js:853`, `const k = keyInput.value.trim().toLowerCase().replace(/\s+/g, '_')`.
   - If a user enters "Aadhaar Card" or "Aadhar Number", it creates `aadhaar_card` or `aadhar_number`. But the VLM prompts and test suites expect standard keys (`aadhaar`, `pan`, `email`, `phone`, `full_name`, `pincode`).
   - Standardized dropdown/presets are needed to ensure token compatibility.

---

## 5. Recommended Implementation Roadmap & Tasks

### Milestone 1: Core Connectivity & Backend Contract Alignment
- [ ] **M1.1**: Update `btnTestConnection` in `popup/popup.js` to query `${backendUrl}/health` (aligned with FastAPI `routes.py`).
- [ ] **M1.2**: Update `project/backend/app/api/routes.py` to also expose an alias `@router.get("/api/health")` for backwards-compatibility.
- [ ] **M1.3**: Fix `setConnectionBadge` in `popup/popup.js` to include `"offline"` in the class check.
- [ ] **M1.4**: Fix Terminal Execution Log auto-scrolling by setting `scrollTop` on `actionLogEl.parentElement` (the element with `overflow-y-auto`).
- [ ] **M1.5**: Add a "Clear Log" button in the Execution Log header to reset the terminal buffer.

### Milestone 2: Viewport Adaptability & Responsive Design
- [ ] **M2.1**: Refactor `popup/popup.html` `<body>` to remove hardcoded `style="width: 800px; height: 600px;"`.
- [ ] **M2.2**: Implement dynamic mode detection:
  - If in standard popup: constrain container to `w-[800px] h-[600px] max-w-screen max-h-screen`.
  - If in popout mode (`window.innerWidth > 800`): expand container to `w-full h-screen` fluid layout.
- [ ] **M2.3**: Make navigation responsive:
  - Mobile / narrow popup (< 768px): Horizontal bottom navigation bar (`order-last w-full h-14 flex-row justify-around border-t`).
  - Tablet / desktop (>= 768px): Vertical sidebar (`md:order-first md:w-[200px] md:h-full md:flex-col md:border-r`).
- [ ] **M2.4**: Implement responsive grid systems:
  - Telemetry bar: `grid-cols-2 sm:grid-cols-4 lg:grid-cols-7`.
  - Video streams: `grid-cols-1 lg:grid-cols-2`.
  - Settings connection card: `grid-cols-1 sm:grid-cols-2`.

### Milestone 3: Missing Interactions & Dead Button Remediation
- [ ] **M3.1**: Wire `#emptyGoToAgentBtn` ("Run an agent") in History tab to trigger click on `nav-btn[data-tab="agent"]`.
- [ ] **M3.2**: Add `keydown` handler on `#goalInput` to trigger Start Agent on `Enter` key.
- [ ] **M3.3**: Add loading spinner and "Starting..." label on `#startBtn` while agent startup is pending.
- [ ] **M3.4**: Add auto-dismissal (3s) and `input` event listener on `#goalInput` to dismiss `#errorMsg` as soon as user types.
- [ ] **M3.5**: Enhance History cards with individual "Re-run" and "Delete" action buttons.
- [ ] **M3.6**: Add "Cancel Task" button to `#hitlOverlay` so user can abort execution without submitting input.
- [ ] **M3.7**: Add keyboard shortcuts to `#approvalOverlay` (`Enter`/`Y` for Approve, `Escape`/`N` for Reject).
- [ ] **M3.8**: Allow clicking the backdrop of `#videoModal` to close fullscreen view.

### Milestone 4: Identity Vault & Indian PII Overhaul
- [ ] **M4.1**: Add "Quick Add Standard Fields" chip list in Vault UI: `Full Name`, `Email`, `Phone`, `Aadhaar`, `PAN`, `Passport`, `Address`, `PIN Code`, `DOB`, `Gender`.
- [ ] **M4.2**: Add inline edit keyboard shortcuts: `Enter` to save, `Escape` to cancel.
- [ ] **M4.3**: Ensure Edit/Delete action buttons in vault cards are permanently visible or tap-friendly on touch viewports (replace `group-hover:opacity-100` with subtle visible styling).
- [ ] **M4.4**: Disable `#clearVaultBtn` when vault is empty.
- [ ] **M4.5**: Disable `#clearHistoryBtn` when history is empty.

### Milestone 5: Accessibility, Visual Hierarchy & Build System
- [ ] **M5.1**: Add focus ring (`outline: 2px solid #305f9f`) on `#vaultAddKey`, `#vaultAddValue`, and inline edit inputs.
- [ ] **M5.2**: Add explicit `for="..."` attributes on all `<label>` elements matching input IDs.
- [ ] **M5.3**: Add descriptive `aria-label`s to all icon-only buttons (`#btnPopout`, `#btnTestConnection`, `.expand-btn`, `#modalClose`, etc.).
- [ ] **M5.4**: Bump sub-10px font sizes up to standard readable scale (`text-[10px]` / `text-[11px]`).
- [ ] **M5.5**: Add build scripts in `package.json`: `"build:css": "tailwindcss -i popup/input.css -o popup/popup.css --minify"`, `"watch:css": "tailwindcss -i popup/input.css -o popup/popup.css --watch"`.
