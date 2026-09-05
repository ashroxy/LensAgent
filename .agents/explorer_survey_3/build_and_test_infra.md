# LensAgent Build, Tooling, Packaging & Testing Infrastructure Report

**Project**: SIH-171 (LensAgent - Privacy-Preserving Visual Browser Agent)  
**Survey Agent**: Explorer Survey 3  
**Date**: 2026-09-05  
**Working Directory**: `e:\SIH-171`  

---

## 1. Executive Summary

LensAgent is an autonomous browser automation agent built as a **Manifest V3 (MV3) Chrome Extension**, complemented by a local **Python FastAPI backend** (`project/backend`) that handles high-level task planning and inference (`/api/v1/infer`).

### Key Findings
1. **Build & Tooling Setup**:
   - The extension frontend is built with **native ES Modules** (`type: "module"`) supported directly by Chromium MV3 service workers and offscreen documents. There is **no active bundler (Webpack/Vite)** required for extension code.
   - Styling is managed through **Tailwind CSS v3.4.19**. The source stylesheet is `popup/input.css` and the compiled production CSS is `popup/popup.css`.
   - **Critical tooling gap**: `package.json` contains **zero npm scripts** for building, watching, linting, or running tests (only a placeholder `echo` script).
   - **Missing root `node_modules/`**: While `package.json` and `package-lock.json` are present at root, `node_modules/` exists only inside the gitignored legacy path `project/extension/node_modules/`. An `npm install` at root is required for standalone operation.
2. **Current Test Status**:
   - **Backend**: 11 unit and integration tests exist in `project/backend/tests/` using `pytest` and `httpx.AsyncClient`. **100% pass rate (11/11 in 0.08s)** when run with `PYTHONPATH=project/backend`.
   - **Frontend & Extension**: No standardized test runner is configured in `package.json`. A collection of ad-hoc test scripts exists in `project/testing/`, but they suffer from pathing mismatches, ESM vs CommonJS conflicts (`require` in ESM), and Windows path normalization bugs.
   - `lib/agent-loop-test.js` is **not a test**; it is an unparsed copy of `agent-loop.js` with corrupted header comments.
3. **Automated Headless Testing Feasibility**:
   - **Empirically Verified**: Chromium MV3 extensions **can be tested 100% headlessly without manual browser interaction or GUI popups** using Playwright with Chromium's `--headless=new` mode:
     ```javascript
     const context = await chromium.launchPersistentContext('', {
       headless: false,
       args: [
         '--headless=new',
         `--disable-extensions-except=${extPath}`,
         `--load-extension=${extPath}`
       ]
     });
     ```
   - In our empirical verification, this launched headlessly, loaded the service worker (`pnaemjcgbhnnfigfnlabnjbadhoedoic`), spawned the Offscreen WebGPU perception document, loaded ONNX Runtime Web WASM, and navigated the extension popup with **0 errors**.

---

## 2. Package & Dependency Inventory (`package.json`)

### 2.1 File Location and Structure
The root configuration file is located at `e:\SIH-171\package.json`:

```json
{
  "name": "sih-171",
  "version": "1.0.0",
  "description": "Build a privacy-preserving vision agent that runs in the browser...",
  "main": "tailwind.config.js",
  "directories": {
    "lib": "lib"
  },
  "scripts": {
    "test": "echo \"Error: no test specified\" && exit 1"
  },
  "repository": {
    "type": "git",
    "url": "git+https://github.com/ashroxy/LensAgent.git"
  },
  "type": "module",
  "dependencies": {
    "eslint": "^10.9.1",
    "playwright": "^1.62.1"
  },
  "devDependencies": {
    "acorn": "^8.18.0",
    "jsdom": "^29.1.1",
    "tailwindcss": "^3.4.19"
  }
}
```

### 2.2 Dependency Analysis & Observations

| Package | Version | Classification | Real Role & Assessment |
| :--- | :--- | :--- | :--- |
| `tailwindcss` | `^3.4.19` | devDependency | Essential: Compiles `popup/input.css` -> `popup/popup.css`. |
| `playwright` | `^1.62.1` | dependency | Development/Testing tool. Should be moved to `devDependencies`. Used for browser automation. |
| `eslint` | `^10.9.1` | dependency | Code linter. Should be moved to `devDependencies`. No config file (`.eslintrc` or `eslint.config.js`) currently configured. |
| `jsdom` | `^29.1.1` | devDependency | In-memory DOM simulator for fast unit tests without browser overhead. |
| `acorn` | `^8.18.0` | devDependency | JavaScript parser, used internally by tooling and AST verification tests. |

### 2.3 Issues & Discrepancies in `package.json`
1. **Misplaced `"main"` Field**: `"main": "tailwind.config.js"` is incorrect. A Chrome extension is not a library, but if an entry point is designated, it should either be omitted or point to `background/service-worker.js`.
2. **Dependencies Misclassified**: `playwright` and `eslint` are listed under `"dependencies"`. For a client-side browser extension where runtime assets run in Chrome, nothing is executed in Node.js by the end-user. These belong in `"devDependencies"`.
3. **Missing Test Runner Dependency**: `playwright` is present, but `@playwright/test` (the test runner) is missing, as is `vitest` or `jest`. Tests in `project/testing/` were written as standalone node scripts rather than runnable test suites.
4. **Missing npm Scripts**:
   - No `build:css` or `watch:css` script.
   - No `test` script (fails with `exit 1`).
   - No `lint` script.
   - No `package` or `bundle` script.
5. **Missing Root `node_modules/`**:
   - `node_modules/` is gitignored and does not exist at root `e:\SIH-171`.
   - A copy of `node_modules` exists at `e:\SIH-171\project\extension\node_modules`.
   - Running `npm install` at root was verified via dry-run (`npm install --dry-run`), which installs 177 packages cleanly in 1s without conflicts.

---

## 3. Build Tools, Bundling & Asset Packaging

### 3.1 Vite / Webpack / ESBuild Status
- **Vite**: Not present. No `vite.config.js`.
- **Webpack**: Not present. No `webpack.config.js`.
- **ESBuild**: Used historically to produce `dist/offscreen.bundle.js` (an evaluation artifact combining `@xenova/transformers` with ONNX Runtime Web). No active `esbuild` configuration script is tracked in the repository.
- **Architectural Shift**: In commit `5806eeb`, the project moved away from `@xenova/transformers` bundling to raw ONNX Runtime Web (`lib/ort/ort.min.js` + `models/yolo_pii_nano.onnx`). As a result, the extension code uses **native browser ES Modules** directly:
  - `manifest.json` specifies `"background": { "service_worker": "background/service-worker.js", "type": "module" }`.
  - `offscreen/offscreen.html` specifies `<script type="module" src="offscreen.js"></script>`.
  - Standard Chrome browser module resolution handles all imports natively without requiring a bundler.

### 3.2 Tailwind CSS Pipeline
- **Configuration**: `tailwind.config.js` at root.
  - Scans: `content: ["./popup/**/*.{html,js}"]`.
  - Defines custom Material Design / Neumorphic theme tokens (primary `#305f9f`, surface `#f7f9fd`, custom spacing, typography, and shadow utilities).
- **Source CSS**: `popup/input.css` (contains Google Fonts import, `@tailwind base; components; utilities;`, and custom `.neu-btn`, `.neu-flat`, `.neo-card`, `.nav-btn` classes).
- **Compiled Output**: `popup/popup.css` (18.8 KB minified).
- **Build Verification**:
  ```bash
  npx tailwindcss -i ./popup/input.css -o ./popup/popup.css --config ./tailwind.config.js --minify
  ```
  - Verification test result: Built cleanly in **386ms**.
- **Dev Watch Mode**:
  ```bash
  npx tailwindcss -i ./popup/input.css -o ./popup/popup.css --config ./tailwind.config.js --watch
  ```

### 3.3 PostCSS
- No `postcss.config.js` exists.
- Tailwind CLI v3 includes built-in PostCSS and Autoprefixer. Standalone PostCSS is not required unless additional PostCSS plugins are introduced.

### 3.4 Runtime Assets & Packaging Layout

The Chrome extension distribution package requires the following file manifest:

```
LensAgent/
├── manifest.json                  # Extension Manifest V3 definition
├── assets/
│   └── icons/                     # Extension icons (16, 48, 128 px)
│       ├── icon16.png
│       ├── icon48.png
│       └── icon128.png
├── background/
│   └── service-worker.js          # MV3 Service Worker (Agent orchestrator & CDP bridge)
├── offscreen/
│   ├── offscreen.html             # Offscreen sandbox container
│   ├── offscreen.js               # Perception & canvas redaction coordinator
│   ├── accessibility_walker.js    # DOM tree accessibility walker
│   ├── accessibility_sanitizer.js # A11y node sanitizer
│   ├── vault_manager.js           # Session vault tokenization manager
│   └── privacy_engine.js          # Offscreen privacy engine variant
├── popup/
│   ├── popup.html                 # Extension popup UI (800x600 px)
│   ├── popup.css                  # Compiled Tailwind production styles
│   ├── popup.js                   # Popup application logic & event handlers
│   ├── input.css                  # Source Tailwind styles
│   └── popup_test.html            # Standalone popup test page
├── lib/
│   ├── action-executor.js         # CDP input injection (jitter, typing, click)
│   ├── agent-loop.js              # Perception-Decision-Action state machine
│   ├── capture.js                 # Screencast frame capture via CDP
│   ├── message-types.js           # Shared message constants and schemas
│   ├── storage.js                 # chrome.storage abstraction wrapper
│   ├── vault.js                   # Local identity vault storage
│   └── ort/                       # ONNX Runtime Web WASM binaries & runtime
│       ├── ort.min.js
│       ├── ort-wasm.wasm
│       └── ort-wasm-simd.wasm
├── models/
│   └── yolo_pii_nano.onnx         # 12.1MB ONNX model for visual PII detection
├── privacy_engine.js              # Standalone privacy engine (imported by offscreen.js)
├── vision_model.js                # Local vision model wrapper
└── dist/
    └── offscreen.bundle.js        # Fallback vision detection bundle
```

### 3.5 Extension Distribution Packaging
To create a production `.zip` distribution artifact:
```powershell
Compress-Archive -Path manifest.json, assets, background, offscreen, popup, lib, models, privacy_engine.js, vision_model.js, dist -DestinationPath dist/lensagent-extension.zip -Force
```
Excludes development metadata (`.git/`, `.agents/`, `node_modules/`, `project/`).

---

## 4. Current Test Status & Existing Test Files

### 4.1 Backend Test Suite (`project/backend/tests/`)
- **Framework**: `pytest` with `pytest-asyncio` and `httpx.AsyncClient`.
- **Test files**:
  1. `test_api.py`: Validates `/health`, `/api/v1/session` lifecycle, and `/api/v1/infer` payload processing.
  2. `test_prompt_and_actions.py`: Validates prompt formatting, token extraction, and action coordinates.
  3. `test_session_and_storage.py`: Tests session state tracking and storage limits.
  4. `test_workflow.py`: Tests end-to-end infer loop with simulated state transitions.
- **Verification Execution**:
  ```powershell
  $env:PYTHONPATH='e:\SIH-171\project\backend'; python -m pytest project/backend/tests
  ```
  **Result: 11 passed in 0.08s (100% PASS)**.

### 4.2 Existing Frontend & Testing Scripts (`project/testing/`)

| Script Name | Intended Purpose | Current Execution Status | Technical Diagnosis |
| :--- | :--- | :--- | :--- |
| `validation-test.js` | Source code verification of bug fixes | **FAIL** (1/4 passed) | Looks for `../offscreen/` and `../lib/` assuming old relative pathing; expects deprecated function signatures. |
| `simple-extreme-test.js` | Accuracy test for PII regex & Vault tokenization | **NO-OP** on Windows | Line 306 compares `import.meta.url === file://${process.argv[1]}`, which fails due to Windows forward-slash vs backslash differences. |
| `extreme-accuracy-test.js` | 5-dimension accuracy benchmark using Playwright | **FAIL** (Path / import) | Requires running from specific directory with Playwright in `NODE_PATH`. |
| `ui-audit.js` | Deep DOM geometry and layout audit for popup | **FAIL** (Runtime) | Uses `require('playwright')` inside an ESM project (`"type": "module"`), triggering `ReferenceError: require is not defined`. |
| `ui-test.js` | Playwright test for popup tabs & mock chrome | **FAIL** (Runtime) | Same ESM `require()` conflict as `ui-audit.js`. |
| `run-pw.cjs` | Minimal Playwright runner for Chrome extension | **PASS** (when `NODE_PATH` set) | Successfully launches Playwright, but uses `headless: false`. |
| `mock-server.cjs` | Standalone Node.js HTTP server mocking backend on port 8000 | **PASS** | Functional standalone mock server. |
| `lib/agent-loop-test.js` | Alleged unit test in `lib/` | **CORRUPTED** | Not a test. A raw copy of `agent-loop.js` starting with `-/**` diff artifact. |

---

## 5. Recommended Automated E2E & Unit Test Architecture

### 5.1 The Headless Chrome MV3 Testing Paradigm
Chrome MV3 extensions have traditionally been difficult to test automatedly because old Chromium `--headless` mode disabled extensions. However, Chromium's **New Headless mode (`--headless=new`)** provides full extension support.

We have verified that the following configuration launches the real extension without a visible browser window:

```javascript
import { chromium } from 'playwright';
import path from 'path';

export async function launchHeadlessExtension(extPath = 'e:/SIH-171') {
  const context = await chromium.launchPersistentContext('', {
    headless: false, // Prevents Playwright from forcing legacy --headless
    args: [
      '--headless=new', // Uses modern Chromium headless supporting extensions
      `--disable-extensions-except=${path.resolve(extPath)}`,
      `--load-extension=${path.resolve(extPath)}`,
      '--no-sandbox',
    ]
  });

  // Wait for MV3 Service Worker initialization
  let [serviceWorker] = context.serviceWorkers();
  if (!serviceWorker) {
    serviceWorker = await context.waitForEvent('serviceworker', { timeout: 8000 });
  }

  const extensionId = serviceWorker.url().split('/')[2];
  return { context, serviceWorker, extensionId };
}
```

### 5.2 Opaque-Box 4-Tier Test Architecture

```
┌────────────────────────────────────────────────────────────────────────┐
│  Tier 4: Autonomous E2E System Workflow (Playwright + Mock Backend)    │
│  - Full Perception-Decision-Action loop with target webpage            │
│  - Zero-egress privacy verification & CDP input verification           │
├────────────────────────────────────────────────────────────────────────┤
│  Tier 3: Service Worker & Offscreen Subsystem Integration              │
│  - Real extension load (--headless=new)                                │
│  - Offscreen WebGPU init, port handshake, ONNX WASM load               │
├────────────────────────────────────────────────────────────────────────┤
│  Tier 2: Component & DOM Interaction Tests (Playwright / JSDOM)        │
│  - Popup UI rendering, tab navigation, Vault CRUD, theme toggle        │
│  - Full interaction states: Hover, Focus, Active, Disabled, Loading    │
├────────────────────────────────────────────────────────────────────────┤
│  Tier 1: Fast Algorithmic & Regex Unit Tests (Node / Vitest)           │
│  - Indian PII patterns (Aadhaar, PAN, Cards, UPI, Phones)              │
│  - Tokenization & de-tokenization, A11y tree sanitization              │
└────────────────────────────────────────────────────────────────────────┘
```

#### Tier 1: Fast Algorithmic & Regex Unit Tests (In-Memory)
- **Runner**: Node test runner (`node --test`) or `vitest` with JSDOM.
- **Scope**:
  - `privacy_engine.js`: Test Indian PII regexes (Aadhaar with spaces/dashes, PAN card regex, 16-digit credit cards, Indian phone numbers `+91`, emails, UPI IDs). Test false positive rejection (e.g., ISBNs, tracking numbers, product SKUs).
  - `vault_manager.js` / `vault.js`: Test token substitution (`<VAULT_EMAIL>` -> `[SYS_EMAIL_01]` -> secret), categories extraction, key flush.
  - `accessibility_sanitizer.js`: Test DOM element labeling and bounding box clamp logic.
- **Speed**: < 2 seconds. Zero browser dependency.

#### Tier 2: Component & DOM Interaction Tests (Popup UI)
- **Runner**: Playwright loading `popup/popup.html` with injected `chromeMockScript` or JSDOM.
- **Scope**:
  - Navigation between all 4 tabs (`Agent`, `Settings`, `History`, `Vault`).
  - Interaction lifecycle verification:
    - Inputs: Focus state (blue ring outline), input entry, clear button.
    - Buttons: Normal -> Hover -> Active (inset shadow) -> Disabled state.
    - Modals: Clear history confirmation modal, Vault wipe confirmation modal.
  - Real-time data reactivity:
    - Connection status badge classes (`excellent`, `good`, `fair`, `poor`, `offline`).
    - Telemetry sparkline canvas rendering.
    - Execution logs list auto-scrolling.
- **Speed**: ~3 seconds.

#### Tier 3: Service Worker & Offscreen Subsystem Integration
- **Runner**: Playwright with `launchHeadlessExtension()`.
- **Scope**:
  - Verification of `manifest.json` permissions (`debugger`, `offscreen`, `activeTab`, `storage`, `alarms`).
  - Service Worker lifecycle: Message port registration, keep-alive alarms (`ALARM_KEEPALIVE`), offscreen document creation (`ensureOffscreenDocument()`).
  - Offscreen sandbox: WebGPU adapter request, fallback to Canvas 2D, ONNX Runtime Web WASM loading (`lib/ort/ort-wasm-simd.wasm`), model loading (`models/yolo_pii_nano.onnx`).
  - Crash recovery: Simulated offscreen crash handling and reconnection.
- **Speed**: ~5-8 seconds.

#### Tier 4: Autonomous E2E System Workflow (Opaque-Box)
- **Runner**: Playwright running against a local test HTTP server and mock backend (`mock-server.cjs`).
- **Workflow**:
  1. Start `mock-server.cjs` on `http://127.0.0.1:8000`.
  2. Launch headless Chromium with extension loaded.
  3. Open target test sandbox (`project/testing/testcase.html` with registration form).
  4. Open popup page `chrome-extension://${extId}/popup/popup.html`, set goal to "Fill form", click Start.
  5. Extension attaches CDP debugger to test page, streams screencast frames to Offscreen.
  6. Offscreen privacy engine redacts user inputs on canvas; sends payload to backend `/api/v1/infer`.
  7. **Assertion**: Verify payload to backend contains ZERO raw PII (only tokens `<VAULT_FULL_NAME>`, `<VAULT_EMAIL>`).
  8. Mock backend responds with `TYPE` and `CLICK` actions.
  9. Extension `action-executor.js` executes CDP typing cadence and mouse clicks on test page.
  10. **Assertion**: Target form fields on webpage contain real vault values; agent transitions to `FINISHED` state.
- **Speed**: ~12-15 seconds. Completely autonomous and headless.

---

## 6. Build Issues, Dependency Issues & Remediation Plan

### 6.1 Identified Issues

1. **Root `node_modules/` Missing**:
   - **Cause**: Repository restructuring elevated extension files to root, but `npm install` was never executed at root.
   - **Impact**: Running `npx tailwindcss` or `node` scripts from root fails to find binaries unless `NODE_PATH` points into `project/extension/node_modules`.
   - **Remediation**: Run `npm install` in `e:\SIH-171`.

2. **No npm Scripts in `package.json`**:
   - **Cause**: Project was treated as an unpacked extension folder without a scripted developer workflow.
   - **Impact**: No single-command build, test, or watch capabilities.
   - **Remediation**: Add npm scripts to `package.json`:
     ```json
     "scripts": {
       "build:css": "tailwindcss -i ./popup/input.css -o ./popup/popup.css --minify",
       "watch:css": "tailwindcss -i ./popup/input.css -o ./popup/popup.css --watch",
       "test:backend": "python -m pytest project/backend/tests",
       "test:unit": "node --test testing/unit/*.test.js",
       "test:e2e": "node testing/e2e/run-e2e.cjs",
       "test": "npm run test:backend && npm run test:unit && npm run test:e2e",
       "package": "node scripts/package-extension.cjs"
     }
     ```

3. **CommonJS vs ESM Incompatibilities in Test Scripts**:
   - **Cause**: Root `package.json` specifies `"type": "module"`, but several scripts (`ui-audit.js`, `ui-test.js`) use `require('playwright')`.
   - **Impact**: Running these scripts throws `ReferenceError: require is not defined in ES module scope`.
   - **Remediation**: Convert `require(...)` to `import ... from ...` or rename test files to `.cjs`.

4. **Shadowed & Duplicate Files**:
   - `offscreen/offscreen.js` line 26 imports `../privacy_engine.js` (at root), leaving `offscreen/privacy_engine.js` unused and diverging.
   - `lib/agent-loop-test.js` is an invalid file with corrupted patch syntax (`-/**`).
   - Root `offscreen.html` references `dist/offscreen.bundle.js` while the active `offscreen/offscreen.html` references `lib/ort/ort.min.js`.
   - **Remediation**: Document for the implementation team to standardize import paths and remove dead/corrupted artifacts.

---

## 7. Verification Checklist & Commands

| Verification Step | Command | Expected Result |
| :--- | :--- | :--- |
| **Tailwind CSS Compilation** | `node e:\SIH-171\project\extension\node_modules\tailwindcss\lib\cli.js -i ./popup/input.css -o ./popup/popup.css --config ./tailwind.config.js --minify` | Rebuilds `popup/popup.css` cleanly in < 500ms. |
| **Backend Pytest** | `$env:PYTHONPATH='e:\SIH-171\project\backend'; python -m pytest project/backend/tests` | 11 passed in < 0.15s. |
| **Headless Extension Load** | `$env:NODE_PATH='e:\SIH-171\project\extension\node_modules'; node -e "const {chromium}=require('playwright');(async()=>{const c=await chromium.launchPersistentContext('',{headless:false,args:['--headless=new','--disable-extensions-except=e:/SIH-171','--load-extension=e:/SIH-171']});const sw=c.serviceWorkers()[0]||await c.waitForEvent('serviceworker');console.log('SW:',sw.url());await c.close();})()"` | Prints loaded `chrome-extension://.../background/service-worker.js`. |
| **Headless Popup Render** | Open `chrome-extension://${extId}/popup/popup.html` in headless context | Renders popup title, tabs, and components with 0 errors. |
