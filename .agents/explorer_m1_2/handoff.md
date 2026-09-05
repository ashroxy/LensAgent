# Milestone 1: Dependency Installation, Resolution & Packaging Handoff Report

**Project**: SIH-171 (LensAgent)  
**Agent**: Explorer M1-2 (Dependencies, Tooling Resolution & MV3 Packaging)  
**Working Directory**: `e:\SIH-171\.agents\explorer_m1_2`  
**Date**: 2026-09-05  

---

## 1. Observation

### 1.1 Root `package.json` and Categorization Mismatch
- **File**: `e:\SIH-171\package.json`
- **Lines 10, 29-33**:
  ```json
  "main": "tailwind.config.js",
  ...
  "dependencies": {
    "eslint": "^10.9.1",
    "playwright": "^1.62.1"
  },
  "devDependencies": {
    "acorn": "^8.18.0",
    "jsdom": "^29.1.1",
    "tailwindcss": "^3.4.19"
  }
  ```
- **Observation**:
  - `eslint` and `playwright` are categorized under `"dependencies"`. In a client-side Chrome MV3 extension, there are zero runtime Node.js dependencies; all code is executed in Chromium V8 or offscreen WebGPU/WASM contexts.
  - `"main": "tailwind.config.js"` specifies a build config file as the package entry point rather than a valid module entry or background worker.
  - There are currently no build or lint npm scripts in `package.json`.

### 1.2 Lockfile and Dependency Resolution Status
- **File**: `e:\SIH-171\package-lock.json` (`lockfileVersion: 3`, 2357 lines)
- **Command & Output**:
  ```powershell
  $ npm ls
  sih-171@1.0.0 E:\SIH-171
  +-- acorn@8.18.0
  +-- eslint@10.9.1
  +-- jsdom@29.1.1
  +-- playwright@1.62.1
  `-- tailwindcss@3.4.19
  (Exit code: 0)
  ```
  ```powershell
  $ npm ci --dry-run
  up to date in 1s
  42 packages are looking for funding
  (Exit code: 0)
  ```
  ```powershell
  $ npm audit
  found 0 vulnerabilities
  (Exit code: 0)
  ```
- **Peer Dependencies Analysis**:
  - `package-lock.json` lines 878-885:
    ```json
    "peerDependencies": {
      "jiti": "*"
    },
    "peerDependenciesMeta": {
      "jiti": {
        "optional": true
      }
    }
    ```
    `jiti` is already installed in `node_modules` as a transitive dependency of `tailwindcss`.
  - `@csstools/css-calc` peer dependencies on `@csstools/css-parser-algorithms@^4.0.0` and `@csstools/css-tokenizer@^4.0.0` are fully satisfied.
  - Conclusion: Zero peer dependency conflicts exist across all 150 installed packages.

### 1.3 Executable Paths on Windows (`node_modules/.bin`)
- **Directory**: `e:\SIH-171\node_modules\.bin` contains 45 executable shims:
  - `tailwindcss`, `tailwindcss.cmd`, `tailwindcss.ps1`
  - `eslint`, `eslint.cmd`, `eslint.ps1`
  - `playwright`, `playwright.cmd`, `playwright.ps1`
  - `acorn`, `acorn.cmd`, `acorn.ps1`
- **Execution Checks**:
  - `npx tailwindcss --help`: Succeeded (Tailwind CSS v3.4.19).
  - `npx playwright --version`: Succeeded (Playwright v1.62.1). Chromium binary located at `C:\Users\User\AppData\Local\ms-playwright\chromium-1234\chrome-win64\chrome.exe`.
  - `npx eslint -v`: Succeeded (v10.9.1).
  - `npx eslint popup/popup.js`:
    ```
    Oops! Something went wrong! :(
    ESLint: 10.9.1
    ESLint couldn't find an eslint.config.* file.
    From ESLint v9.0.0, the default configuration file is now eslint.config.*.
    ```
    (Exit code: 1)
  - `npx eslint --no-config-lookup popup/popup.js`: Succeeded (Exit code: 0).

### 1.4 Chrome Extension MV3 Runtime Separation
- **Codebase Grep Verification**:
  - Grepped `background/`, `popup/`, `offscreen/`, `lib/`, and `models/` for `node_modules`. Result: **0 matches**.
  - All extension code uses standard browser ES Modules (`import ... from "./relative.js"`).
  - `manifest.json`:
    - `"service_worker": "background/service-worker.js"`, `"type": "module"`
    - `"default_popup": "popup/popup.html"`
    - `"content_security_policy": { "extension_pages": "script-src 'self' 'wasm-unsafe-eval'; object-src 'self';" }`
    - `"web_accessible_resources": [{ "resources": ["models/*", "lib/ort/*"], "matches": ["<all_urls>"] }]`
  - Third-party runtime dependencies are entirely vendor-vendored:
    - ONNX Runtime Web: `lib/ort/ort.min.js`, `lib/ort/ort-wasm.wasm`, `lib/ort/ort-wasm-simd.wasm`
    - Neural Model: `models/yolo_pii_nano.onnx`
- **Empirical Headless Verification**:
  - Loaded `e:\SIH-171` headlessly using Chromium `--headless=new`:
    ```
    Service Worker loaded: chrome-extension://pnaemjcgbhnnfigfnlabnjbadhoedoic/background/service-worker.js
    Navigated to popup: chrome-extension://pnaemjcgbhnnfigfnlabnjbadhoedoic/popup/popup.html
    Popup title: LensAgent
    Console Errors: 0
    Page Errors: 0
    Failed Requests: 0
    ```

### 1.5 Parallel Track Bug Discovery
- **File**: `e:\SIH-171\tests\e2e\helpers\extension-launcher.js`
- **Lines 14, 15, 50**:
  ```javascript
  14:       --disable-extensions-except=,
  15:       --load-extension=,
  ...
  50:       const popupUrl = chrome-extension:///popup/popup.html;
  ```
- **Error**: `node --check tests/e2e/helpers/extension-launcher.js` throws `SyntaxError: Invalid left-hand side in assignment` due to unescaped bash variable interpolation during file generation.

---

## 2. Logic Chain

1. **Dependency Categorization**:
   - *Premise*: A Chrome Manifest V3 extension runs exclusively inside Chromium. End users do not run Node.js to execute the extension.
   - *Observation*: `package.json` currently places `eslint` and `playwright` in `"dependencies"`.
   - *Deduction*: Placing build/test tools in `"dependencies"` violates clean packaging semantics and causes production prune commands (`npm install --omit=dev`) to retain test runners while stripping build tools like `tailwindcss`. All Node packages (`acorn`, `eslint`, `jsdom`, `playwright`, `tailwindcss`) must reside exclusively under `"devDependencies"`, with `"dependencies"` left empty `{}` or omitted.

2. **Lockfile Synchronization**:
   - *Premise*: `npm ci` enforces strict parity between `package.json` and `package-lock.json`.
   - *Observation*: Modifying `dependencies` in `package.json` invalidates the lockfile's root package declaration (`packages[""]`).
   - *Deduction*: After the Worker updates `package.json`, they must run `npm install` (or `npm install --package-lock-only`) to synchronize `package-lock.json`. Thereafter, `npm ci` will pass reliably in continuous integration and automated test environments.

3. **Binary Resolution in NPM Scripts vs NPX**:
   - *Premise*: NPM automatically prepends `./node_modules/.bin` to the system `PATH` when executing npm scripts.
   - *Observation*: `tailwindcss.cmd`, `eslint.cmd`, and `playwright.cmd` are present in `node_modules/.bin`.
   - *Deduction*: NPM scripts should invoke binaries directly (e.g. `"build:css": "tailwindcss -i ./popup/input.css -o ./popup/popup.css --minify"`). Using `npx tailwindcss` inside npm scripts is redundant, slower, and risks falling back to network queries if path resolution glitches.

4. **ESLint v10 Execution**:
   - *Premise*: ESLint v10 defaults strictly to flat configuration (`eslint.config.js`).
   - *Observation*: No `eslint.config.js` exists at repository root; running `npx eslint` without flags exits with code 1.
   - *Deduction*: To make `"lint": "eslint ."` work in `package.json`, either a minimal `eslint.config.js` must be added at root, or the script must pass `--no-config-lookup`. Creating a clean `eslint.config.js` is the standard solution.

5. **Packaging Separation (Dev vs Runtime)**:
   - *Premise*: Chrome Web Store policy explicitly forbids bundling development dependencies, tests, build scripts, or source maps in the extension package.
   - *Observation*: Zero runtime files import from `node_modules`. All runtime libraries (`lib/ort/`, `models/`) are self-contained.
   - *Deduction*: A distribution packaging script or command must produce a `.zip` in `dist/` that copies strictly runtime files and explicitly excludes `node_modules/`, `package.json`, `tailwind.config.js`, `tests/`, and `.agents/`.

---

## 3. Caveats

- **Offscreen WebGPU Hardware Support**: In headless environments without hardware GPU acceleration (e.g. standard Linux CI containers), Chromium falls back to SwiftShader/CPU or Canvas 2D. The codebase already implements this fallback in `offscreen/offscreen.js`.
- **Google Fonts in Popup**: `popup/popup.html` loads fonts from `fonts.googleapis.com`. While permitted in unpacked developer mode, for complete offline capability (`"offline_enabled": true` in `manifest.json`), external font dependencies can optionally be downloaded locally in a future milestone.
- **Node Version Requirement**: `@asamuzakjp/css-color` (transitive dependency of `jsdom`) requires Node `>=20.19.0` or `>=22.12.0` or `>=24.0.0`. Node v24.11.1 on this host satisfies this requirement.

---

## 4. Conclusion & Actionable Recommendation

### 4.1 Recommended `package.json` Updates
The Worker should update `e:\SIH-171\package.json` to the following canonical configuration:

```json
{
  "name": "sih-171",
  "version": "1.0.0",
  "description": "LensAgent - Privacy-Preserving Visual Browser Agent",
  "type": "module",
  "scripts": {
    "build:css": "tailwindcss -i ./popup/input.css -o ./popup/popup.css --minify",
    "watch:css": "tailwindcss -i ./popup/input.css -o ./popup/popup.css --watch",
    "lint": "eslint .",
    "test:backend": "python -m pytest project/backend/tests",
    "test:e2e": "node --test tests/e2e/*.test.js",
    "test": "npm run test:backend && npm run test:e2e",
    "package": "node scripts/package-extension.cjs"
  },
  "devDependencies": {
    "acorn": "^8.18.0",
    "eslint": "^10.9.1",
    "jsdom": "^29.1.1",
    "playwright": "^1.62.1",
    "tailwindcss": "^3.4.19"
  },
  "dependencies": {},
  "engines": {
    "node": ">=20.19.0",
    "npm": ">=10.0.0"
  },
  "repository": {
    "type": "git",
    "url": "git+https://github.com/ashroxy/LensAgent.git"
  },
  "license": "ISC"
}
```

### 4.2 Lockfile Re-synchronization Procedure
After modifying `package.json`:
1. Run `npm install` at root `e:\SIH-171` to update `package-lock.json`'s dependency classification.
2. Verify lockfile integrity with `npm ci --dry-run`.
3. Verify dependency graph with `npm ls` (must return code 0).

### 4.3 Minimal `eslint.config.js`
To allow `npm run lint` to pass cleanly under ESLint v10:
Create `e:\SIH-171\eslint.config.js`:
```javascript
export default [
  {
    ignores: [
      "node_modules/**",
      "dist/**",
      "project/**",
      "tests/**",
      ".agents/**",
      "lib/ort/**"
    ]
  },
  {
    files: ["**/*.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        chrome: "readonly",
        console: "readonly",
        document: "readonly",
        window: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        setInterval: "readonly",
        clearInterval: "readonly",
        requestAnimationFrame: "readonly",
        Image: "readonly",
        OffscreenCanvas: "readonly",
        Blob: "readonly",
        URL: "readonly",
        fetch: "readonly"
      }
    },
    rules: {
      "no-unused-vars": "warn",
      "no-undef": "error"
    }
  }
];
```

### 4.4 Automated Distribution Packaging (`scripts/package-extension.cjs`)
Create `e:\SIH-171\scripts\package-extension.cjs` to automate generating `dist/lensagent-extension.zip`:
- Whitelist inclusions: `manifest.json`, `assets/**`, `background/**`, `offscreen/**`, `popup/popup.html`, `popup/popup.css`, `popup/popup.js`, `lib/**` (excluding `agent-loop-test.js`), `models/**`, `privacy_engine.js`, `vision_model.js`.
- Explicit exclusions: `node_modules/`, `package*.json`, `tailwind.config.js`, `tests/`, `project/`, `.agents/`, `*.md`.

### 4.5 Immediate Fix Required in Parallel Track
Notify Orchestrator to fix the syntax error in `tests/e2e/helpers/extension-launcher.js`:
- Line 14: replace `--disable-extensions-except=,` with `` `--disable-extensions-except=${extPath}`, ``
- Line 15: replace `--load-extension=,` with `` `--load-extension=${extPath}`, ``
- Line 50: replace `const popupUrl = chrome-extension:///popup/popup.html;` with `` const popupUrl = `chrome-extension://${extensionId}/popup/popup.html`; ``

---

## 5. Verification Method

To independently verify these conclusions:

1. **Verify Dependency Tree & Absence of Peer Conflicts**:
   ```powershell
   cd e:\SIH-171
   npm ls
   # Expected: Exit code 0, 5 top-level packages, 0 missing peer dependencies
   ```

2. **Verify Lockfile Integrity**:
   ```powershell
   npm ci --dry-run
   # Expected: "up to date in 1s", Exit code 0
   ```

3. **Verify Tooling Executables**:
   ```powershell
   npx tailwindcss --help
   npx playwright --version
   # Expected: Both commands output version and options with Exit code 0
   ```

4. **Verify Runtime Isolation & Headless MV3 Execution**:
   Run the test script located at `e:\SIH-171\.agents\explorer_m1_2\test_load.cjs`:
   ```powershell
   node e:\SIH-171\.agents\explorer_m1_2\test_load.cjs
   # Expected Output:
   # Service Worker loaded: chrome-extension://.../background/service-worker.js
   # Navigating to popup: chrome-extension://.../popup/popup.html
   # Popup page title: LensAgent
   # SUCCESS: Headless verification complete.
   ```

5. **Verify Syntax of Parallel Helper**:
   ```powershell
   node --check e:\SIH-171\tests\e2e\helpers\extension-launcher.js
   # Invalidation Condition: Exits with SyntaxError until lines 14, 15, and 50 are patched.
   ```
