# Adversarial Challenge Report: Milestone 2 ? Responsive Shell and Accessibility

**Agent**: Challenger M2-2 (Gen 3)
**Role**: Empirical Challenger (critic, specialist)
**Working Directory**: e:\SIH-171\.agents\challenger_m2_2_gen3
**Milestone**: Milestone 2: Responsive Shell and A11y (Features 5, 6, 7, 8, 9)
**Verdict**: **REJECT**

---

## 1. Observation

Direct empirical observations from source inspection, CSS rule analysis, and executions of `tests/adversarial_m2_2.test.js` (JSDOM) and `tests/playwright_a11y_audit.js` (Real Headless Chromium):

### A. Label Associations and Form Controls (Requirement 1)
- In `popup/popup.html`:
  - Line 71: `<label for="goalInput" ...>Agent Goal</label>` correctly pairs with `<input id="goalInput">`.
  - Lines 174-190: Explicit `<label for="...">` associations exist for `#setting-serverUrl`, `#setting-maxSteps`, `#setting-timeout`, `#settCaptureQuality`, `#settStabilizeDelay`.
  - Lines 199, 208, 217, 304: Enclosing `<label>` elements wrap toggle checkboxes `#setting-jitter`, `#setting-delta`, `#setting-liveAudit`, `#hitlSaveToVault`.
  - Lines 277, 279, 301: Screen-reader-only `<label class="sr-only" for="...">` elements associate with `#vaultAddKey`, `#vaultAddValue`, `#hitlInput`.
  - `popup/popup.js` Line 822: Dynamic vault inputs receive `valEl.setAttribute("aria-label", "Vault value for " + key)`.
- Clicking `<label for>` elements successfully transfers focus to target inputs.

### B. Button Accessible Names and Ligature Leaks (Requirement 2)
- In `popup/popup.html`:
  - Line 80: `<button id="startBtn" ...><span class="material-symbols-outlined">play_arrow</span> Start</button>`
  - Line 83: `<button id="stopBtn" ...><span class="material-symbols-outlined">stop</span> Halt</button>`
  - Line 241: `<button id="clearHistoryBtn" ...><span class="material-symbols-outlined text-[16px]">delete</span> Clear</button>`
- The `<span class="material-symbols-outlined">` elements lack `aria-hidden="true"`.
- W3C Accessible Name Computation (AccName 1.1) computes the accessible names as:
  - `#startBtn`: `"play_arrow Start"` (expected: `"Start"`)
  - `#stopBtn`: `"stop Halt"` (expected: `"Halt"`)
  - `#clearHistoryBtn`: `"delete Clear"` (expected: `"Clear"`)
- In contrast, navigation tabs (`.nav-btn`, lines 25, 29, 33, 37) and header icon buttons (lines 50, 53) correctly specify `aria-hidden="true"`.

### C. Color Contrast Ratios (Requirement 2 ? WCAG 2.1 Level AA SC 1.4.3)
- Background surface: `#f7f9fd` (Luminance = 0.948).
- Outline text color: `.text-outline` (`#737781`, Luminance = 0.177).
  - Computed contrast ratio: **4.25:1**.
  - WCAG 2.1 AA requirement for normal text (< 18pt / < 14pt bold): **>= 4.5:1**.
  - **FAILS WCAG AA**.
  - Affects telemetry metric labels in `popup.html` lines 116, 120, 124, 129, 133, 137, 141 ("Steps", "Frames", "Latency", "Redactions", "FPS", "Dropped", "Quality" rendered at `text-[9px]`), `#hitlVaultKeyLabel` ("Key:" at `text-[10px]`), and dynamic vault key labels (`text-[10px]`).
- Primary button gradient: `.neu-btn-primary` (lines 38-40 in `popup/input.css`) with background `linear-gradient(145deg, #e5edff, #c0d3fa)` and text `text-primary` (`#305f9f`).
  - At the gradient end `#c0d3fa` (Luminance = 0.651):
  - Computed contrast ratio: **4.27:1**.
  - WCAG 2.1 AA requirement for normal text (12px bold `font-label-md`): **>= 4.5:1**.
  - **FAILS WCAG AA**.
  - Affects `#startBtn`, `#saveSettingsBtn`, `#hitlSendBtn`, `#approvalApproveBtn`, and `#vaultAddForm button[type="submit"]`.

### D. Focus Ring Suppression (Requirement 2 ? WCAG 2.1 SC 2.4.7)
- In `popup/input.css` lines 244-246:
  ```css
  #goalInput:focus-visible {
      outline: none !important;
  }
  ```
- In real Chromium (`tests/playwright_a11y_audit.js`):
  `inputOutlineStyle: "none"`, `inputOutlineWidth: "3px"`.
- The parent container `.neu-recessed:has(#goalInput:focus-visible)` applies an outline (`outline: 2px solid #305f9f; outline-offset: 2px`), but this relies entirely on CSS `:has()` support. If `:has()` is unsupported, `#goalInput` has zero visible focus ring.

### E. Tab Navigation and Roving Tabindex (Requirement 3 ? WAI-ARIA APG Tabs)
- In `popup/popup.html` lines 24, 28, 32, 36:
  - `#tab-btn-agent`: `aria-selected="true"`, `tabindex="0"`
  - `#tab-btn-settings`: `aria-selected="false"`, `tabindex="0"`
  - `#tab-btn-history`: `aria-selected="false"`, `tabindex="0"`
  - `#tab-btn-vault`: `aria-selected="false"`, `tabindex="0"`
- All 4 tabs have static `tabindex="0"`.
- In `popup/popup.js`, `switchTab()` does not update `tabindex`.
- Real Chromium Tab Sequence: Every single tab button is visited sequentially in the Tab ring:
  `#tab-btn-agent` -> `#tab-btn-settings` -> `#tab-btn-history` -> `#tab-btn-vault` -> panel controls.
- Under WAI-ARIA APG Tabs pattern, unselected tabs must have `tabindex="-1"` so `Tab` moves directly from the active tab into the active panel.

### F. Modal Focus Traps and Escape Key Gaps (Requirement 3 ? WCAG 2.1 SC 2.1.2 and WAI-ARIA Modal)
- `#hitlOverlay` (`popup.html:295`) specifies `role="dialog" aria-modal="true"`, but:
  1. In Chromium: Focus on `#hitlInput` -> press `Shift+Tab` -> focus escapes modal and lands on `#exportLogBtn` in background dashboard.
  2. Focus on `#hitlSendBtn` -> press `Tab` -> focus escapes modal to `BODY` -> next Tab reaches `#tab-btn-agent` and `#startBtn`.
  3. No background element has `inert` or `aria-hidden="true"` when `#hitlOverlay` is visible.
  4. There is no abort or cancel button inside `#hitlOverlay`.
  5. Pressing `Escape` does not dismiss `#hitlOverlay` (`popup.js` only listens for Escape on `#videoModal`).
- `#approvalOverlay` (`popup.html:313`) specifies `role="alertdialog" aria-modal="true"`, but:
  1. `Tab` escapes the modal into background controls.
  2. Pressing `Escape` does not close or reject `#approvalOverlay`.

---

## 2. Logic Chain

1. **Premise 1 (Accessible Names)**: From Observation B, `#startBtn`, `#stopBtn`, and `#clearHistoryBtn` enclose unmasked icon text nodes ("play_arrow", "stop", "delete"). Assistive technology adhering to the W3C AccName algorithm computes the button names including these strings. Because the icon text is an internal ligature rather than semantic action description, screen reader users hear confusing strings like "play underscore arrow Start" or "delete Clear". This violates WCAG 2.1 SC 4.1.2 (Name, Role, Value).
2. **Premise 2 (Contrast Ratio)**: From Observation C, text color `#737781` on `#f7f9fd` yields a 4.25:1 contrast ratio, and `#305f9f` on `#c0d3fa` yields 4.27:1. Both are below the 4.5:1 threshold required for text smaller than 18pt regular / 14pt bold under WCAG 2.1 SC 1.4.3 (Contrast Minimum, Level AA). Low-vision users will experience reduced legibility on critical telemetry metrics and primary action buttons.
3. **Premise 3 (Focus Ring Fragility)**: From Observation D, `#goalInput:focus-visible` suppresses outline via `outline: none !important`. Shifting the focus outline exclusively to a parent container via `:has()` introduces an unnecessary failure mode when rendering in engines or webviews without complete `:has()` support.
4. **Premise 4 (Tablist Ergonomics)**: From Observation E, assigning `tabindex="0"` to all 4 tabs in a `role="tablist"` breaks standard roving tabindex contracts. Keyboard users are forced to press Tab 4 times across tabs instead of using arrow keys within the tablist and a single Tab to enter the active dashboard panel.
5. **Premise 5 (Modal Focus Leak)**: From Observation F, `#hitlOverlay` and `#approvalOverlay` claim `aria-modal="true"` but implement zero focus trapping. Real Chromium verification confirms that `Shift+Tab` and `Tab` escape directly into background interactive elements, allowing users to trigger `#startBtn` while a blocking HITL or Approval modal is active. Furthermore, missing `Escape` listeners and missing abort buttons make keyboard dismissal impossible. This violates WCAG 2.1 SC 2.1.2 (No Keyboard Trap).
6. **Inference**: Because these defects violate core WCAG 2.1 AA accessibility criteria and WAI-ARIA DOM contracts, Milestone 2 cannot be approved in its current state.

---

## 3. Caveats

- **Label associations**: All 13 form inputs across the static HTML and dynamic Vault cards passed label association verification. Clicking labels cleanly focuses or toggles target controls.
- **Fluid Popout Viewport**: Media queries and `.popout-mode` responsive sizing contracts in `input.css` properly scale to full window without breaking 800x600 popup bounds.
- **Rapid Arrow Navigation**: Tab switching was stress-tested with 100 rapid arrow key events in both directions; no runtime crashes or DOM desynchronization occurred.
- **Modals in Roadmap**: While features 26, 27, and 28 are formally scheduled under Milestone 6 ("Modals and HITL Controls"), dispatch explicitly tasked Challenger M2-2 with testing modal focus traps now.

---

## 4. Conclusion

**Verdict: REJECT**

The Milestone 2 implementation establishes solid responsive shell layout and comprehensive `<label>` associations, but **FAILS** critical accessibility and DOM contracts in four areas:
1. **Critical: Modal Focus Escape**: `#hitlOverlay` and `#approvalOverlay` allow focus to escape into background controls via `Tab` / `Shift+Tab`, lack `inert` on background elements, lack an abort button on HITL, and ignore `Escape`.
2. **High: Accessible Name Ligature Leaks**: `#startBtn`, `#stopBtn`, and `#clearHistoryBtn` lack `aria-hidden="true"` on their icon spans, corrupting their screen reader names.
3. **Medium: WCAG AA Contrast Failures**: `.text-outline` (`#737781` on `#f7f9fd` at 4.25:1) and `.neu-btn-primary` (`#305f9f` on `#c0d3fa` at 4.27:1) fail the 4.5:1 minimum threshold.
4. **Medium: WAI-ARIA Tablist Tabindex**: Inactive tabs lack `tabindex="-1"`, causing unnecessary Tab stops.

### Required Remediations
1. Add `aria-hidden="true"` to `<span class="material-symbols-outlined">` inside `#startBtn`, `#stopBtn`, and `#clearHistoryBtn`.
2. Darken `.text-outline` to `#5e636e` (contrast ratio ~5.5:1) and darken the gradient end of `.neu-btn-primary` to `#a8c4f7` or text to `#1e3a8a` (contrast >= 4.5:1).
3. Implement roving tabindex in `popup.html` and `popup.js`: active tab has `tabindex="0"`, inactive tabs have `tabindex="-1"`.
4. Implement focus trapping on `#hitlOverlay` and `#approvalOverlay` (or mark background `<nav>`, `<header>`, `<main>` with `inert` while open), add an abort button to `#hitlOverlay`, and handle `Escape` key dismissal.

---

## 5. Verification Method

To independently reproduce all findings:

1. **JSDOM Adversarial Test Suite**:
   ```bash
   node --test tests/adversarial_m2_2.test.js
   ```
   *Expected output*: 13 tests execute, reporting ligature leaks on buttons, contrast failures on outline text and primary button gradient, and background non-inertness on modals.

2. **Real Chromium Browser Audit (Playwright)**:
   ```bash
   node tests/playwright_a11y_audit.js
   ```
   *Expected output*:
   - Shift+Tab from `#hitlInput` escapes modal and focuses `#exportLogBtn`.
   - Tab from `#hitlSendBtn` escapes modal to `BODY` and cycles into `#startBtn`.
   - All 4 tabs appear sequentially in the real keyboard Tab ring.

3. **Source Inspections**:
   - Inspect `popup/popup.html` lines 80, 83, 241 for missing `aria-hidden="true"`.
   - Inspect `popup/input.css` line 245 for `outline: none !important;`.
   - Inspect `popup/popup.js` line 761 for missing Escape handlers on `#hitlOverlay` and `#approvalOverlay`.
