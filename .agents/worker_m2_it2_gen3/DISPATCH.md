# Dispatch: Worker M2 (Iteration 2, Gen 3)

## Milestone
Milestone 2: Responsive Shell & A11y (Remediation Iteration 2)

## Context & Inputs
- `GATE_STATUS.md`: `e:\SIH-171\.agents\orchestrator_gen3\GATE_STATUS.md`
- Reviewer M2-1 Handoff: `e:\SIH-171\.agents\reviewer_m2_1_gen3\handoff.md`
- Challenger M2-1 Handoff: `e:\SIH-171\.agents\challenger_m2_1_gen3\handoff.md`
- Challenger M2-2 Handoff: `e:\SIH-171\.agents\challenger_m2_2_gen3\handoff.md`
- Target files: `popup/input.css`, `popup/popup.html`, `popup/popup.js`, `popup/popup.css`

## Mandatory Integrity Warning
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

## Remediation Tasks
1. **Fix #btnPopout and Logo Visibility**:
   In `popup/input.css:186`, change:
   `[hidden], .hidden { display: none !important; }`
   to:
   `[hidden] { display: none !important; }`
   (Removing `.hidden` with `!important` allows Tailwind's `.md:flex` to work on `#btnPopout` and `#brandLogo` at viewport widths >= 768px).
2. **Fix Popout Query Parsing**:
   In `popup/popup.js:190-196` and `<head>` script in `popup/popup.html`, replace substring matching with `URLSearchParams`:
   ```javascript
   const params = new URLSearchParams(window.location.search);
   const isPopoutMode = params.get("popout") === "true" || params.get("mode") === "tab" || window.innerWidth > 800 || window.innerHeight > 600;
   ```
3. **Fix Accessible Name Ligature Leaks**:
   In `popup/popup.html`, add `aria-hidden="true"` to `<span class="material-symbols-outlined">` inside `#startBtn`, `#stopBtn`, and `#clearHistoryBtn`.
4. **Implement WAI-ARIA Roving Tabindex**:
   In `popup/popup.html`: `#tab-btn-agent` has `tabindex="0"`, other 3 tabs have `tabindex="-1"`.
   In `popup/popup.js` inside `switchTab(tabName)`: update each `.nav-btn`'s `tabIndex`: set `0` for active tab, `-1` for inactive tabs.
5. **Recompile CSS & Verify**:
   - Run `npm run build:css`
   - Run `npm run test:syntax`
   - Run `npm test`
   - Run `node tests/e2e/runner.js`
6. Write handoff report to `e:\SIH-171\.agents\worker_m2_it2_gen3\handoff.md` and report back via send_message.

## 2026-09-05T08:53:29Z
You are Worker M2 (Iteration 2, Gen 3).
Your working directory is e:\SIH-171\.agents\worker_m2_it2_gen3.

First, read:
1. e:\SIH-171\.agents\ORIGINAL_REQUEST.md
2. e:\SIH-171\.agents\orchestrator_gen3\PROJECT.md
3. e:\SIH-171\.agents\orchestrator_gen3\GATE_STATUS.md
4. e:\SIH-171\.agents\worker_m2_it2_gen3\DISPATCH.md
5. Reviewer and Challenger feedback:
   - e:\SIH-171\.agents\reviewer_m2_1_gen3\handoff.md
   - e:\SIH-171\.agents\challenger_m2_1_gen3\handoff.md
   - e:\SIH-171\.agents\challenger_m2_2_gen3\handoff.md

You have exclusive write ownership of:
- popup/input.css
- popup/popup.html
- popup/popup.js
- popup/popup.css (compiled via npm run build:css)

DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Execute the following 5 targeted fixes:
1. In popup/input.css: Change line 186 from `[hidden], .hidden { display: none !important; }` to `[hidden] { display: none !important; }`. This removes the !important override on Tailwind's `.md:flex`, restoring visibility of #btnPopout and the sidebar logo on desktop viewports.
2. In popup/popup.js and <head> of popup/popup.html: Use URLSearchParams for popout detection instead of substring matching (`new URLSearchParams(window.location.search).get("popout") === "true"`).
3. In popup/popup.html: Add `aria-hidden="true"` to the icon spans inside #startBtn, #stopBtn, and #clearHistoryBtn to eliminate accessible name ligature leaks.
4. In popup/popup.html and popup/popup.js: Implement roving tabindex on nav tabs (active tab has tabindex="0", inactive tabs have tabindex="-1", synchronized in switchTab()).
5. Compile and verify:
   - npm run build:css
   - npm run test:syntax
   - npm test
   - node tests/e2e/runner.js
6. Write handoff report to e:\SIH-171\.agents\worker_m2_it2_gen3\handoff.md and report back via send_message to your caller.
