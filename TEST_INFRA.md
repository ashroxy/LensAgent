# LensAgent Test Infrastructure Specification (TEST_INFRA.md)

## 1. Test Philosophy & Principles

LensAgent is a Manifest V3 privacy-preserving visual browser automation extension backed by a local FastAPI inference backend. Because LensAgent manipulates sensitive user data (credentials, Indian PII) and executes automated CDP browser actions, testing must be rigorous, automated, and strictly opaque-box.

### 1.1 Core Principles
1. **Opaque-Box Requirement Verification**: Tests verify external behavior against published contracts and requirements (from PROJECT.md, ackend_contracts.md, and rontend_audit.md), rather than private implementation details.
2. **Zero Facade Tests**: Every test exercises real code paths, real state transitions, and real DOM/storage operations. Tests that pass trivially without asserting real logic are strictly forbidden.
3. **Authoritative Output Derivation**: Expected outputs are derived directly from interface specifications:
   - FastAPI /health endpoint contract: { status:  ok, vlm_status: ok, gpu_accelerated: true, version: 1.1.0 }
   - Chrome Storage schemas: userSettings, sessionHistory, lensagent_vault
   - Message passing contracts: POPUP_* actions and BG_* broadcasts defined in lib/message-types.js
4. **Deterministic & Isolated Execution**: Each test case initializes its own state, avoids cross-test contamination, cleans up mocks and browser contexts, and runs independently of execution order.
5. **Fail-Closed Privacy Guarantees**: Any frame or payload egressing to a remote server must contain zero raw Indian PII (Aadhaar, PAN, Passport, Phone, Email, PIN Code).

---

## 2. 4-Tier Test Architecture

The test suite is structured into four progressive tiers:

`
┌────────────────────────────────────────────────────────────────────────┐
│  Tier 4: Real-World Application Scenarios                              │
│  - Playwright + Chromium (--headless=new) + Mock Backend               │
│  - Multi-step browser automation: Form filling, search, HITL, approval │
│  - Zero raw PII egress verification on wire                            │
├────────────────────────────────────────────────────────────────────────┤
│  Tier 3: Cross-Feature Combinatorial Interactions                     │
│  - Pairwise state machine & UI interactions                            │
│  - Goal entry + streaming, settings + health check, vault + PII redaction│
├────────────────────────────────────────────────────────────────────────┤
│  Tier 2: Boundary & Corner Cases (>=5 per feature across 30 features)  │
│  - Empty inputs, maximum lengths, zeros, overflow, invalid formats     │
│  - XSS injection strings, prototype pollution, rapid event firing      │
├────────────────────────────────────────────────────────────────────────┤
│  Tier 1: Feature Coverage (>=5 per feature across all 30 features)     │
│  - 30 features from PROJECT.md Feature Inventory                       │
│  - Primary happy paths, state transitions, DOM attributes, contracts   │
└────────────────────────────────────────────────────────────────────────┘
`

### Tier 1: Feature Coverage (>= 150 Test Cases)
Provides baseline functional coverage for every one of the 30 features in the PROJECT.md Feature Inventory:
- **Features 1-4**: Tooling, dependencies, codebase hygiene, test harness setup.
- **Features 5-9**: Responsive layout, fluid popout viewport, accessible focus rings, form labels, nav lifecycle.
- **Features 10-14**: Goal entry (Enter key), terminal auto-scroll, dual stream states, agent controls, telemetry.
- **Features 15-20**: Backend connection fix, offline badge CSS, history empty button, history cards, history controls, settings form UX.
- **Features 21-25**: Indian PII presets, touch-friendly vault, vault validation, masked/reveal toggle, clear vault UX.
- **Features 26-28**: HITL modal abort button, approval modal controls, modal keyboard escape.
- **Features 29-30**: E2E test suite integration, adversarial hardening verification.

### Tier 2: Boundary & Corner Cases (>= 150 Test Cases)
Stress-tests every feature at its operational boundaries:
- **Empty & Whitespace Inputs**: Blank goals, empty vault keys, whitespace-only fields, empty history.
- **Extreme Lengths & Overflow**: 10,000 character goals, 500+ terminal logs, numeric limits (maxSteps, timeouts).
- **Invalid Formats & Sanitization**: Corrupt URLs, invalid JSON, special characters, script tags, forbidden keys.
- **Rapid Asynchronous Events**: Debounce testing, duplicate start requests, double-clicks on modal buttons.
- **Hardware & Network Boundaries**: Connection drops, 500 server errors, timeouts, zero FPS.

### Tier 3: Cross-Feature Combinations (Pairwise Interactions)
Validates interactions between disparate subsystems:
1. **Enter Key Goal Submission + Dual Canvas Video Streaming** (F10 + F12)
2. **Settings Persistence + Backend Health Connection Test** (F20 + F15)
3. **Indian Identity Vault Presets + Canvas PII Redaction** (F21 + F23 + F30)
4. **History Card Re-Run + Agent View Navigation** (F18 + F17 + F10)
5. **Sensitive Action Approval Modal + Escape Key Handling** (F27 + F28)
6. **Human-In-The-Loop Modal + Vault Auto-Save Detokenization** (F26 + F23 + F24)
7. **Fluid Viewport Resize + Dual Canvas Responsive Scaling** (F5 + F6 + F12)
8. **Telemetry Error State Display + Offline Connection Badge** (F14 + F16)
9. **Terminal Log Auto-Scroll + Terminal Log Export** (F11 + F1)
10. **Clear Vault + Clear History Zero-State Synchronization** (F19 + F25)

### Tier 4: Real-World Application Scenarios
End-to-end realistic user workflows running in headless Chromium:
1. **End-to-End Registration Flow**: Agent navigates to sandbox form, injects Indian PII from Vault, ensures zero raw PII egresses in backend inference request, submits form.
2. **Search & Exploration Task**: Agent processes visual viewport, identifies target elements, executes clicks, logs steps, finishes successfully.
3. **Sensitive Action Approval Flow**: Agent encounters sensitive step, presents approval modal, user approves, agent resumes.
4. **Human-In-The-Loop Clarification**: Agent encounters ambiguous field, prompts user, user supplies value and saves to Vault, agent continues.
5. **Backend Error Resilience Flow**: Backend health failure triggers graceful UI warning, connection badge updates, agent pauses safely without unhandled exceptions.

---

## 3. Technology Stack & Execution Environment

| Component | Specification |
| :--- | :--- |
| **Runtime** | Node.js v24.11.1 (Native ES Modules 	ype: module) |
| **Test Runner** | Native Node Test Runner (
ode:test and 
ode:assert/strict) |
| **Browser Engine** | Chromium (Playwright v1.62.1) |
| **Headless Mode** | Chromium New Headless mode (--headless=new) with extension flags |
| **Mock Server** | Native Node 
ode:http mock server implementing backend contracts |
| **DOM Harness** | Isolated DOM fixtures with Mock Chrome Extension API |

### Headless Chrome MV3 Extension Invocation Pattern
Chromium's modern headless mode loads MV3 extensions headlessly:
`javascript
import { chromium } from 'playwright';
import path from 'node:path';

const context = await chromium.launchPersistentContext('', {
  headless: false,
  args: [
    '--headless=new',
    --disable-extensions-except=,
    --load-extension=,
    '--no-sandbox',
  ]
});
let sw = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker', { timeout: 10000 });
const extensionId = sw.url().split('/')[2];
const page = await context.newPage();
await page.goto(chrome-extension:///popup/popup.html);
`

---

## 4. Directory Structure

`
tests/
└── e2e/
    ├── helpers/
    │   ├── extension-launcher.js   # Headless Playwright MV3 extension launcher
    │   ├── mock-server.js          # In-process FastAPI contract mock server
    │   └── dom-fixtures.js         # Isolated popup DOM fixture & Chrome runtime mock
    ├── tier1_features.test.js      # Tier 1: 30 features x >=5 tests (>=150 tests)
    ├── tier2_boundaries.test.js    # Tier 2: 30 features x >=5 boundary tests (>=150 tests)
    ├── tier3_combinations.test.js  # Tier 3: Pairwise cross-feature interaction suites
    ├── tier4_scenarios.test.js     # Tier 4: Real-world browser automation scenarios
    └── runner.js                   # Master test runner & report aggregator
`

---

## 5. Test Runner Invocation

### 5.1 Run Full Test Suite
`ash
node tests/e2e/runner.js
`
Or using npm:
`ash
npm test
`

### 5.2 Run Specific Tier
`ash
node --test tests/e2e/tier1_features.test.js
node --test tests/e2e/tier2_boundaries.test.js
node --test tests/e2e/tier3_combinations.test.js
node --test tests/e2e/tier4_scenarios.test.js
`

---

## 6. Quality Gates & Coverage Thresholds

| Metric | Required Threshold | Verification Method |
| :--- | :--- | :--- |
| **Tier 1 Feature Coverage** | >= 5 tests per feature (30 features = >= 150 tests) | Automated counter in unner.js |
| **Tier 2 Boundary Cases** | >= 5 tests per feature (30 features = >= 150 tests) | Automated counter in unner.js |
| **Tier 3 Combinations** | >= 10 cross-feature pairwise test suites | Automated counter in unner.js |
| **Tier 4 Scenarios** | >= 5 real-world end-to-end workflows | Playwright scenario verification |
| **Pass Rate** | **100.0%** (Zero failures, zero unhandled rejections) | Exit code 0 check |
| **Execution Time** | Total suite execution < 60 seconds | Benchmark timer |
