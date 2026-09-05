# Milestone 1: Tooling, Packaging & NPM Scripts Investigation & Strategy

**Role**: Explorer 1 (`explorer_m1_1`)  
**Milestone**: M1 (Tooling & Packaging)  
**Date**: 2026-09-05  
**Target File**: `e:\SIH-171\.agents\explorer_m1_1\handoff.md`  

---

## 1. Observation

### 1.1 Current `package.json` State (`e:\SIH-171\package.json`)
The current root `package.json` contains:
```json
{
  "devDependencies": {
    "acorn": "^8.18.0",
    "jsdom": "^29.1.1",
    "tailwindcss": "^3.4.19"
  },
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
  "keywords": [],
  "author": "",
  "license": "ISC",
  "type": "module",
  "bugs": {
    "url": "https://github.com/ashroxy/LensAgent/issues"
  },
  "homepage": "https://github.com/ashroxy/LensAgent#readme",
  "dependencies": {
    "eslint": "^10.9.1",
    "playwright": "^1.62.1"
  }
}
```

Key observations:
1. **Misplaced `"main"`**: Line 10 designates `"main": "tailwind.config.js"`.
2. **Missing npm scripts**: Line 15 has only `"test": "echo \"Error: no test specified\" && exit 1"`. There are no `build:css`, `watch:css`, or `lint` scripts.
3. **Misclassified dependencies**: Lines 29-32 designate `eslint` and `playwright` as runtime `"dependencies"`, while `tailwindcss`, `jsdom`, and `acorn` are `"devDependencies"`.

### 1.2 Lockfile & Package Availability (`e:\SIH-171\package-lock.json`)
- `package-lock.json` lockfileVersion is `3`.
- `eslint` is locked to `10.9.1` (lines 828-831).
- `tailwindcss` is locked to `3.4.19` (line 18).
- `playwright` is locked to `1.62.1` (line 13).
- `jsdom` is locked to `29.1.1` (line 17).
- `acorn` is locked to `8.18.0` (line 16).
- All binaries exist in `e:\SIH-171\node_modules\.bin`:
  - `tailwindcss`, `tailwindcss.cmd`, `tailwindcss.ps1`
  - `eslint`, `eslint.cmd`, `eslint.ps1`
  - `playwright`, `playwright.cmd`, `playwright.ps1`
  - `acorn`, `acorn.cmd`, `acorn.ps1`

### 1.3 Tailwind CSS CLI Build Verification
- Running `npx tailwindcss -i ./popup/input.css -o ./popup/popup.css --minify`:
  - Exit code: `0`.
  - Execution time: ~355ms.
  - Output file: `popup/popup.css`.
  - File size: `19,417` bytes.
  - Compression: Minified onto 2 lines, starting with `@import url("https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap");` followed by CSS variable reset blocks (`--tw-*`), base resets, utility classes (`.bg-background`, `.text-headline-md`, etc.), and custom neumorphic utilities (`.neu-flat`, `.neu-btn`, `.neo-card`, `.nav-btn`).
- `popup/popup.html:8` links directly to this artifact: `<link href="popup.css" rel="stylesheet"/>`.

### 1.4 ESLint 10.9.1 Flat Configuration Requirement
- Running `npx eslint` without a configuration file produces:
  ```
  Oops! Something went wrong! :(
  ESLint: 10.9.1
  ESLint couldn't find an eslint.config.* file.
  From ESLint v9.0.0, the default configuration file is now eslint.config.*.
  ```
  (Exit code `1`).
- Empirically verified: ESLint 10 requires an `eslint.config.js` (Flat Config).
- When an `eslint.config.js` is provided that ignores `dist/**`, `lib/ort/**`, `project/**`, `models/**`, `assets/**`, and supplies browser/extension globals (`chrome`, `window`, `document`, `Blob`, `URL`, `console`, etc.), ESLint executes cleanly in ~1.2s.

### 1.5 Test Infrastructure Status
- **Backend**: `python -m pytest project/backend/tests -o pythonpath=project/backend` runs 11 tests in 0.08s with **100% pass rate (11/11)**.
- **Node Test Runner**: Node is `v24.11.1`. Running unscoped `node --test` attempts to execute corrupt files (`lib/agent-loop-test.js:1` with `-/**` syntax error) and legacy test scripts in `project/testing/` (which use CommonJS `require()` in an ES module project).
- Scoped command `node --test tests/unit/*.test.js` exits `0` cleanly on Node 24.
- Playwright Chromium binary is verified installed at `C:\Users\User\AppData\Local\ms-playwright\chromium-1234\chrome-win64\chrome.exe` and launches with `--headless=new` with 0 errors.

---

## 2. Logic Chain

1. **Client-Side Extension Dependency Model**:
   - *From Obs 1.1 & Obs 1.2*: LensAgent is a client-side Manifest V3 browser extension running in Chromium. None of the Node modules are shipped to end users or executed in a Node production runtime.
   - *Reasoning*: All packages (`acorn`, `eslint`, `jsdom`, `playwright`, `tailwindcss`) are developer-only tools for linting, compilation, and testing. Keeping `eslint` and `playwright` in `"dependencies"` is semantically invalid.
   - *Inference*: `"dependencies"` should be emptied or removed, and all 5 packages must reside under `"devDependencies"`.

2. **Removal of Misleading `"main"` Property**:
   - *From Obs 1.1*: `"main": "tailwind.config.js"` designates a Tailwind config file as the main entry point.
   - *Reasoning*: An extension is not an importable library package. Designating `tailwind.config.js` causes IDEs and bundlers to assume it is the module root.
   - *Inference*: The `"main"` field should be removed entirely from `package.json`.

3. **Tailwind CLI Script Standardization**:
   - *From Obs 1.3*: Running `tailwindcss -i ./popup/input.css -o ./popup/popup.css --minify` produces a valid, minified 19.4KB CSS file consumed by `popup/popup.html`.
   - *Reasoning*: npm automatically injects `./node_modules/.bin` into the execution path when running npm scripts, making `npx` redundant inside `package.json`.
   - *Inference*: Root scripts should be:
     - `"build:css": "tailwindcss -i ./popup/input.css -o ./popup/popup.css --minify"`
     - `"watch:css": "tailwindcss -i ./popup/input.css -o ./popup/popup.css --watch"`

4. **ESLint Script and Flat Config Dependency**:
   - *From Obs 1.4*: ESLint 10.9.1 fails immediately with exit code 1 if `eslint.config.*` is absent.
   - *Reasoning*: Simply adding `"lint": "eslint ."` to `package.json` without adding `eslint.config.js` will break `npm run lint`. Additionally, vendor files (`lib/ort/ort.min.js`, `dist/offscreen.bundle.js`) and binary/legacy files (`project/**`) must be excluded to prevent false positives and performance degradation.
   - *Inference*: Milestone 1 implementation must pair `"lint": "eslint ."` with an `eslint.config.js` file at root.

5. **Test Script Architecture**:
   - *From Obs 1.5*: Unscoped `node --test` discovers corrupted files and fails. Scoped backend pytest passes 100% (11/11).
   - *Reasoning*: A reliable `"test"` script must pass out of the box in Milestone 1 without false failures from legacy unmigrated scripts, while providing dedicated sub-commands for backend, unit, and E2E suites.
   - *Inference*: Configure `"test": "npm run test:backend"`, alongside granular targets `"test:backend"`, `"test:unit"`, and `"test:e2e"`.

---

## 3. Caveats

1. **No direct code editing by Explorer**: In accordance with the Teamwork Explorer protocol, this report documents exact file contents and diffs for the implementation worker without modifying `package.json` or source files directly.
2. **ESLint Warnings vs Errors**: Some existing files (e.g. `popup/popup.js`) reference functions intended to be implemented in later milestones (e.g., `populateVaultUI` in M5). Setting `"no-undef": "warn"` or defining appropriate globals ensures `npm run lint` passes while alerting developers to missing bindings.
3. **Python Runtime for Backend Tests**: `npm run test:backend` assumes `python` and `pytest` are available in the developer's PATH. This has been verified in the current environment (`Python 3.13.0`, `pytest 8.4.2`).
4. **Dead File Deletion Prerequisite**: Feature 3 of M1 removes `lib/agent-loop-test.js`. Once deleted, `node --test` will no longer choke on that file.

---

## 4. Conclusion & Concrete Strategy

### 4.1 Proposed `package.json` (Exact Target Content)

```json
{
  "name": "sih-171",
  "version": "1.0.0",
  "description": "Build a privacy-preserving vision agent that runs in the browser. A local Vision Transformer reads the user's screen, sanitizes sensitive/PII data using DOM tags or other methods, and sends only anonymized structural data to a server. The server processes the sanitized context and returns actionable browser commands (click, type, scroll) that the local client executes autonomously.",
  "type": "module",
  "scripts": {
    "build:css": "tailwindcss -i ./popup/input.css -o ./popup/popup.css --minify",
    "watch:css": "tailwindcss -i ./popup/input.css -o ./popup/popup.css --watch",
    "lint": "eslint .",
    "test:backend": "python -m pytest project/backend/tests -o pythonpath=project/backend",
    "test:unit": "node --test tests/unit/*.test.js",
    "test:e2e": "node tests/e2e/runner.js",
    "test": "npm run test:backend"
  },
  "directories": {
    "lib": "lib"
  },
  "repository": {
    "type": "git",
    "url": "git+https://github.com/ashroxy/LensAgent.git"
  },
  "keywords": [
    "chrome-extension",
    "manifest-v3",
    "vision-agent",
    "privacy-preserving",
    "browser-automation"
  ],
  "author": "",
  "license": "ISC",
  "bugs": {
    "url": "https://github.com/ashroxy/LensAgent/issues"
  },
  "homepage": "https://github.com/ashroxy/LensAgent#readme",
  "devDependencies": {
    "acorn": "^8.18.0",
    "eslint": "^10.9.1",
    "jsdom": "^29.1.1",
    "playwright": "^1.62.1",
    "tailwindcss": "^3.4.19"
  }
}
```

### 4.2 Accompanying `eslint.config.js` (Required at Root)

To allow `"lint": "eslint ."` to succeed under ESLint 10:

```javascript
export default [
  {
    ignores: [
      "**/node_modules/**",
      "dist/**",
      "lib/ort/**",
      "project/**",
      "models/**",
      "assets/**",
      ".agents/**",
      "popup/popup.css"
    ]
  },
  {
    files: [
      "popup/**/*.js",
      "background/**/*.js",
      "offscreen/**/*.js",
      "lib/**/*.js",
      "*.js"
    ],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        chrome: "readonly",
        window: "readonly",
        document: "readonly",
        console: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        setInterval: "readonly",
        clearInterval: "readonly",
        requestAnimationFrame: "readonly",
        cancelAnimationFrame: "readonly",
        fetch: "readonly",
        Response: "readonly",
        Headers: "readonly",
        URL: "readonly",
        Blob: "readonly",
        FileReader: "readonly",
        Image: "readonly",
        ImageData: "readonly",
        OffscreenCanvas: "readonly",
        createImageBitmap: "readonly",
        navigator: "readonly",
        performance: "readonly",
        crypto: "readonly",
        btoa: "readonly",
        atob: "readonly",
        alert: "readonly",
        confirm: "readonly",
        prompt: "readonly",
        importScripts: "readonly",
        CustomEvent: "readonly",
        Event: "readonly"
      }
    },
    rules: {
      "no-unused-vars": "warn",
      "no-undef": "warn"
    }
  }
];
```

### 4.3 Summary of Structural Changes
| Item | Current State | Recommended Target State | Rationale |
| :--- | :--- | :--- | :--- |
| `"main"` | `"tailwind.config.js"` | Removed | Extension is not a library; prevents invalid entry point resolution. |
| `"dependencies"` | `eslint`, `playwright` | Removed (empty) | Client-side extension has no Node runtime dependencies. |
| `"devDependencies"` | `acorn`, `jsdom`, `tailwindcss` | `acorn`, `eslint`, `jsdom`, `playwright`, `tailwindcss` | Unifies all build, lint, and test tooling in devDependencies. |
| `"scripts.build:css"` | Missing | `tailwindcss -i ./popup/input.css -o ./popup/popup.css --minify` | Single-command production stylesheet compilation. |
| `"scripts.watch:css"` | Missing | `tailwindcss -i ./popup/input.css -o ./popup/popup.css --watch` | Developer live-reloading stylesheet watcher. |
| `"scripts.lint"` | Missing | `eslint .` | Root code quality verification using ESLint 10 Flat Config. |
| `"scripts.test"` | Echo error placeholder | `npm run test:backend` | Out-of-the-box passing test suite (11/11 tests pass in 0.08s). |
| `"scripts.test:backend"`| Missing | `python -m pytest project/backend/tests -o pythonpath=project/backend` | Cross-platform backend pytest invocation. |
| `"scripts.test:unit"` | Missing | `node --test tests/unit/*.test.js` | Built-in Node test runner target for unit tests. |
| `"scripts.test:e2e"` | Missing | `node tests/e2e/runner.js` | Headless Playwright test runner target. |

---

## 5. Verification Method

To independently verify the strategy once implemented by the Worker:

1. **Verify Tailwind CSS Compilation**:
   ```bash
   npm run build:css
   ```
   - **Expected Result**: Exits with code `0` in < 500ms.
   - **File Check**: Inspect `popup/popup.css`.
     - File size should be ~19,417 bytes.
     - Timestamp should match execution time.
     - Contains compiled classes `.bg-background`, `.neu-flat`, `.nav-btn`, and CSS variable definitions.

2. **Verify Watch Script Syntax**:
   ```bash
   npm run watch:css -- --help
   ```
   - **Expected Result**: Exits with code `0`, displays Tailwind CLI options including `--watch`.

3. **Verify Linting**:
   ```bash
   npm run lint
   ```
   - **Expected Result**: Exits with code `0` (warnings allowed, 0 unhandled fatal config errors).

4. **Verify Test Suite**:
   ```bash
   npm test
   ```
   - **Expected Result**: Executes `npm run test:backend`, passing all 11 pytest backend tests in < 0.15s.

5. **Verify Dependencies Cleanliness**:
   ```bash
   npm ls --depth=0
   ```
   - **Expected Result**: Shows only devDependencies (`acorn`, `eslint`, `jsdom`, `playwright`, `tailwindcss`) with 0 unmet dependency warnings.
