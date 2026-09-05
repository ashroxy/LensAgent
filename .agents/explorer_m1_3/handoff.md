# Milestone 1 Code Hygiene & Dead Code Handoff Report

**Explorer**: Explorer 3 (Milestone 1 — Code Hygiene & Dead Code)  
**Date**: 2026-09-05  
**Working Directory**: `e:\SIH-171\.agents\explorer_m1_3`  
**Target Milestone**: Milestone 1 (Tooling, Packaging & Code Hygiene)  
**Status**: Ready for Worker Implementation  

---

## 1. Observation

### 1.1 `lib/agent-loop-test.js`
- **Location**: `e:\SIH-171\lib\agent-loop-test.js` (535 lines, 18,822 bytes).
- **File Header (Lines 1-5)**:
  ```javascript
  1: -/**
  2:  * agent-loop.js - Perception - Decision - Action Orchestrator
  3:  * =============================================================
  ```
  Line 1 contains a verbatim patch rejection artifact (`-/**`).
- **Missing Imports (Lines 18-24)**:
  ```javascript
  18: 
  19: 
  20: 
  21: 
  22: const _a11ySanitizer = new AccessibilitySanitizer();
  23: 
  24: class AgentLoop {
  ```
  Lines 18-21 are empty whitespace where imports used to reside. Line 22 references `AccessibilitySanitizer` which is never imported or defined in the file.
- **Syntax Check Verification**:
  ```powershell
  node --check e:\SIH-171\lib\agent-loop-test.js
  ```
  **Result (verbatim)**:
  ```
  E:\SIH-171\lib\agent-loop-test.js:22
  const _a11ySanitizer = new AccessibilitySanitizer();
  ^^^^^
  SyntaxError: Unexpected token 'const'
      at checkSyntax (node:internal/main/check_syntax:72:5)
  Node.js v24.11.1
  ```
- **Codebase Reference Audit**:
  Full grep for `agent-loop-test` across all files in `e:\SIH-171`:
  Zero imports. Zero test scripts reference it. Zero configuration entries reference it. Only survey documentation mentions its existence.
- **Comparison with `lib/agent-loop.js`**:
  `lib/agent-loop.js` (937 lines, 40,835 bytes) is the active module, starts with valid JSDoc, contains proper ES imports (`import * as storage`, `import { AccessibilitySanitizer }`, `import { PrivacyEngine }`), and is imported directly by `background/service-worker.js:19`.

---

### 1.2 Divergence: Root `privacy_engine.js` vs `offscreen/privacy_engine.js`

#### Active Importers in Extension Subsystems:
1. `lib/agent-loop.js:26`:
   ```javascript
   import { PrivacyEngine } from "../privacy_engine.js";
   ```
2. `offscreen/offscreen.js:26`:
   ```javascript
   import { PrivacyEngine } from '../privacy_engine.js';
   ```
3. `offscreen/privacy_engine.js`:
   **Zero files** import `offscreen/privacy_engine.js`. It is completely shadowed and orphaned.

#### Detailed Side-by-Side Comparison:

| Feature / Property | Root `privacy_engine.js` (Active) | `offscreen/privacy_engine.js` (Orphaned) |
| :--- | :--- | :--- |
| **Path & Size** | `e:\SIH-171\privacy_engine.js` (335 lines, 12,734 bytes) | `e:\SIH-171\offscreen\privacy_engine.js` (328 lines, 16,587 bytes) |
| **Active Usage** | Imported by `lib/agent-loop.js` and `offscreen/offscreen.js` | Imported by **none** |
| **Git History** | Updated in `8b84ba1`, `f474e8c`, `b4385a2`, and `b5d1658` | Last updated in commit `82a4ce6`; abandoned after repo restructure |
| **External Dependencies** | **None** (Self-contained, browser + node compatible) | `import { SessionVaultManager } from './vault_manager.js';`<br/>`import { AccessibilitySanitizer } from './accessibility_sanitizer.js';` |
| **PII Patterns** | `static PII_PATTERNS`: `AADHAAR`, `PAN`, `CREDIT_CARD`, `PHONE`, `EMAIL` | `this.patterns`: `aadhaar`, `pan`, `creditCard`, `indianPhone`, `email`, `upiId`, `passport`, `drivingLicense` |
| **Luhn Checksum** | **Yes**: `_isValidLuhnCard(digits)` differentiates real cards from arbitrary digit strings | **No**: Regex match triggers unconditionally |
| **Payload Validation** | **Structured Recursive Object Walker** (`scanValue`): walks nested JSON, skips `session_id`/`sessionId`, tracks exact property paths (`v.category@v.path`), ignores numbers outside `CONTENT_KEYS` | **Flat `JSON.stringify()` scan**: blind regex test across serialized string; false positives on numeric IDs and base64 strings |
| **Canvas Redaction** | Modern styled overlay: `#0f172a` dark slate container badge, `#38bdf8` cyan border, centered cyan monospace placeholder text with clipping; fallback solid blackout | Flat `#0a0a0c` fill, `#ff0055` border, token text; includes unoptimized `_applyPixelate` for `FACE_AVATAR` |
| **Canvas Export** | Standard `canvas.convertToBlob({ type: 'image/webp' })` and `toDataURL` fallback; strips data URI prefix cleanly | Converts blob to `arrayBuffer` and manual character loop + `btoa` encoding (CPU intensive) |
| **DOM Scanning** | `extractDOMBoundingBoxes(dpr)` scans document inputs; returns empty array if `typeof document === 'undefined'` | `scanDOM()` attempts to scan document in offscreen context (where target page DOM does not exist; offscreen document is blank HTML) |

---

### 1.3 Other Dead / Shadowed / Corrupted Artifacts

1. **Root `offscreen.html` (275 bytes)**:
   - Contains: `<script type="module" src="dist/offscreen.bundle.js"></script>`.
   - `background/service-worker.js:118` creates the offscreen document via `url: "offscreen/offscreen.html"`.
   - Manifest V3 does not register root `offscreen.html`.
   - Root `offscreen.html` is an unreferenced legacy file from an earlier directory layout.

2. **`offscreen/vault_manager.js` (7,294 bytes)**:
   - Module defines `SessionVaultManager` (in-RAM tokenization vault).
   - Only imported by `offscreen/privacy_engine.js:22`.
   - Distinct from `lib/vault.js` (which is the active persistent vault for user credentials used by `background/service-worker.js` and `popup/popup.js`).
   - If `offscreen/privacy_engine.js` is removed, `offscreen/vault_manager.js` is orphaned.

3. **`tests/e2e/helpers/` Syntax Errors**:
   - `tests/e2e/helpers/extension-launcher.js:14`:
     ```javascript
     --disable-extensions-except=,
     --load-extension=,
     ```
     Missing backticks in template literal strings causes `SyntaxError: Invalid left-hand side in assignment`.
   - `tests/e2e/helpers/mock-server.js:15`:
     ```javascript
     thought: Executed test action successfully.,
     ```
     Unquoted string literal causes `SyntaxError: Unexpected identifier 'test'`.
   - `tests/e2e/helpers/dom-fixtures.js:12`:
     ```javascript
     backendUrl: http://127.0.0.1:8000,
     ```
     Unquoted URL causes `SyntaxError: Unexpected token ':'`.

---

## 2. Logic Chain

1. **Premise 1 (Dead Code Verification)**:
   - A file is dead if it is not imported by any runtime component, not referenced by any test suite or packaging script, and not reachable through extension manifest entry points.
   - `lib/agent-loop-test.js` has 0 references in any code or config file (Observation 1.1).
   - Root `offscreen.html` is never created by `service-worker.js` (Observation 1.3).
   - `offscreen/privacy_engine.js` is not imported by any file in the extension (Observation 1.2).
   - *Inference*: These files can be safely deleted without breaking any active dependency.

2. **Premise 2 (Syntax Corruption Verification)**:
   - `lib/agent-loop-test.js` fails `node --check` with `SyntaxError: Unexpected token 'const'` due to a `-/**` diff artifact and missing imports (Observation 1.1).
   - *Inference*: The file is not a test suite; it is a damaged fragment of an older `agent-loop.js` and provides negative value to the repository.

3. **Premise 3 (Canonical Privacy Engine Identity)**:
   - Both active consumers (`offscreen/offscreen.js:26` and `lib/agent-loop.js:26`) explicitly import `../privacy_engine.js` at the repository root.
   - Root `privacy_engine.js` possesses Luhn checksum verification and structured recursive JSON payload traversal, preventing false-positive blocks that break valid agent runs.
   - *Inference*: Root `privacy_engine.js` is the true canonical module. Deleting `offscreen/privacy_engine.js` eliminates shadowing while requiring **zero import changes** across extension source files.

4. **Premise 4 (Indian PII Completeness Guarantee)**:
   - `offscreen/privacy_engine.js` contains 3 additional regex patterns (`upiId`, `passport`, `drivingLicense`) not yet in root `privacy_engine.js`.
   - Milestone 5 and Project Specifications require comprehensive Indian PII protection.
   - *Inference*: Before or during deletion of `offscreen/privacy_engine.js`, these 3 patterns and their placeholder labels must be added to root `privacy_engine.js` `PII_PATTERNS`.

---

## 3. Caveats

1. **`dist/offscreen.bundle.js` is NOT Dead**:
   - Although root `offscreen.html` references it, `vision_model.js:1` also imports `runVisionDetection` from `./dist/offscreen.bundle.js`.
   - `offscreen/offscreen.js:27` imports `LocalVisionModel` from `../vision_model.js`.
   - Therefore, `dist/offscreen.bundle.js` is **active at runtime**. Do not delete it.

2. **`offscreen/accessibility_sanitizer.js` is NOT Dead**:
   - Even though it lives in `offscreen/`, `lib/agent-loop.js:25` imports `AccessibilitySanitizer` directly from `../offscreen/accessibility_sanitizer.js`.
   - Therefore, `offscreen/accessibility_sanitizer.js` is **active at runtime**. Do not delete it.

3. **`offscreen/vault_manager.js` Status**:
   - This file is self-contained and holds context dictionaries for entity recognition.
   - It is orphaned once `offscreen/privacy_engine.js` is deleted, but can be kept as a standalone reference or unit-tested module.

---

## 4. Conclusion & Actionable Steps for Worker

The Worker should execute the following precise sequence of actions:

### Step 1: Remove `lib/agent-loop-test.js`
Delete the corrupted duplicate file:
```powershell
Remove-Item e:\SIH-171\lib\agent-loop-test.js
```
*Rationale*: Removes 535 lines of invalid diff code that causes linter and parser failures. Zero runtime or test imports exist.

---

### Step 2: Enrich Root `privacy_engine.js` with Missing Indian PII Patterns
Update `e:\SIH-171\privacy_engine.js` to incorporate the 3 missing patterns from `offscreen/privacy_engine.js`:

1. In `static PII_PATTERNS` (around line 18):
   ```javascript
   static PII_PATTERNS = {
     AADHAAR: /\b[2-9]\d{3}[ -]?\d{4}[ -]?\d{4}\b/,
     PAN: /\b[A-Z]{5}[0-9]{4}[A-Z]{1}\b/,
     CREDIT_CARD: /(?<!\d)(?:\d{4}[\s\-]?){3}\d{4}(?!\d)|(?<!\d)\d{13,16}(?!\d)/,
     PHONE: /\b(?:\+91[ -]?)?[6-9]\d{9}\b/,
     EMAIL: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/,
     UPI_ID: /\b[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z]{2,64}\b/,
     PASSPORT: /\b[A-Z]{1}[0-9]{7}\b/,
     DRIVING_LICENSE: /\b[A-Z]{2}[0-9]{2}[0-9]{11}\b/
   };
   ```

2. In `static getPlaceholderText()` (around line 32):
   ```javascript
   if (cat.includes('UPI')) return '[REDACTED_UPI_ID]';
   if (cat.includes('PASSPORT')) return '[REDACTED_PASSPORT]';
   if (cat.includes('LICENSE') || cat.includes('DRIVING')) return '[REDACTED_DL]';
   ```

---

### Step 3: Remove Shadowed `offscreen/privacy_engine.js`
Delete the orphaned duplicate:
```powershell
Remove-Item e:\SIH-171\offscreen\privacy_engine.js
```
*Rationale*: Eliminates shadowing. No import path updates are needed in `offscreen/offscreen.js` or `lib/agent-loop.js` because both already reference `../privacy_engine.js`.

---

### Step 4: Remove Obsolete Root `offscreen.html`
Delete the unreferenced root HTML file:
```powershell
Remove-Item e:\SIH-171\offscreen.html
```
*Rationale*: The active offscreen document created by `service-worker.js:118` is `offscreen/offscreen.html`. Removing the root file avoids developer confusion.

---

### Step 5: Fix Template Literal Syntax in `tests/e2e/helpers/`
Repair missing backticks in:
1. `tests/e2e/helpers/extension-launcher.js`:
   - Line 14: `` `--disable-extensions-except=${extPath}`, ``
   - Line 15: `` `--load-extension=${extPath}`, ``
   - Line 50: `` const popupUrl = `chrome-extension://${extensionId}/popup/popup.html${extraParams}`; ``
2. `tests/e2e/helpers/mock-server.js`:
   - Line 15: `thought: 'Executed test action successfully.',`
3. `tests/e2e/helpers/dom-fixtures.js`:
   - Line 12: `backendUrl: 'http://127.0.0.1:8000',`

---

### Step 6: Update `package.json` Scripts & Dependencies
1. Relocate `eslint` and `playwright` from `"dependencies"` to `"devDependencies"`.
2. Replace the placeholder `"test"` script with standard workflow scripts:
   ```json
   "scripts": {
     "build:css": "tailwindcss -i ./popup/input.css -o ./popup/popup.css --minify",
     "watch:css": "tailwindcss -i ./popup/input.css -o ./popup/popup.css --watch",
     "lint": "eslint . --ext .js",
     "test:backend": "python -m pytest project/backend/tests",
     "test:syntax": "node --check lib/*.js background/*.js offscreen/*.js popup/*.js privacy_engine.js vision_model.js",
     "test": "npm run test:syntax && npm run test:backend"
   }
   ```
3. Set `"main"` to `"background/service-worker.js"` or omit it.

---

## 5. Verification Method

### 5.1 Syntax Verification Across Codebase
Run:
```powershell
Get-ChildItem -Path @("lib", "background", "offscreen", "popup", ".") -Filter "*.js" | ForEach-Object {
    $res = node --check $_.FullName 2>&1
    if ($LASTEXITCODE -ne 0) { Write-Error "FAIL: $($_.Name): $res" }
    else { Write-Host "OK: $($_.Name)" }
}
```
**Expected Outcome**: 100% OK, 0 failures.

### 5.2 Privacy Engine Module Resolution
Run:
```powershell
node -e "import('./privacy_engine.js').then(m => { const pe = new m.PrivacyEngine(); console.log('Patterns:', Object.keys(m.PrivacyEngine.PII_PATTERNS)); })"
```
**Expected Outcome**:
```
Patterns: [ 'AADHAAR', 'PAN', 'CREDIT_CARD', 'PHONE', 'EMAIL', 'UPI_ID', 'PASSPORT', 'DRIVING_LICENSE' ]
```

### 5.3 Backend Contract & Health Check
Run:
```powershell
$env:PYTHONPATH='e:\SIH-171\project\backend'; python -m pytest project/backend/tests
```
**Expected Outcome**: 11 passed in < 0.15s.

### 5.4 Headless Chrome Extension Smoke Test
Run:
```powershell
$env:NODE_PATH='e:\SIH-171\project\extension\node_modules'; node -e "const {chromium} = require('playwright'); (async () => { const ctx = await chromium.launchPersistentContext('', { headless: false, args: ['--headless=new', '--disable-extensions-except=e:/SIH-171', '--load-extension=e:/SIH-171', '--no-sandbox'] }); const sw = ctx.serviceWorkers()[0] || await ctx.waitForEvent('serviceworker', { timeout: 8000 }); console.log('Service Worker loaded:', sw.url()); await ctx.close(); })()"
```
**Expected Outcome**:
```
Service Worker loaded: chrome-extension://<extId>/background/service-worker.js
```
No import errors, no unhandled exceptions.
