# Dispatch: Worker M2 (Gen 3)

## Milestone
Milestone 2: Responsive Shell & A11y (Features 5, 6, 7, 8, 9)

## File Ownership
Worker M2 has exclusive write ownership of:
- `popup/input.css`
- `popup/popup.html`
- `popup/popup.js`
- `popup/popup.css` (generated via `npm run build:css`)

## Core Instructions & Explorer References
Worker M2 must read and synthesize:
1. `ORIGINAL_REQUEST.md`: `e:\SIH-171\.agents\ORIGINAL_REQUEST.md`
2. `PROJECT.md`: `e:\SIH-171\.agents\orchestrator_gen3\PROJECT.md`
3. Explorer Reports:
   - `e:\SIH-171\.agents\explorer_m2_1_gen3\handoff.md` (Features 5 & 6)
   - `e:\SIH-171\.agents\explorer_m2_2_gen3\handoff.md` (Features 7 & 8)
   - `e:\SIH-171\.agents\explorer_m2_3_gen3\handoff.md` (Feature 9)

## Mandatory Integrity Warning
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

## Deliverables & Verification
1. Apply all CSS, HTML, and JS changes specified by the 3 explorers.
2. Compile CSS: `npm run build:css`.
3. Check syntax: `npm run test:syntax`.
4. Run unit tests: `npm test`.
5. Run E2E tests: `node --test tests/e2e/tier1_features.test.js tests/e2e/tier2_boundaries.test.js`.
6. Write full handoff report to `e:\SIH-171\.agents\worker_m2_gen3\handoff.md` and notify parent via `send_message`.

## 2026-09-05T08:35:51Z
You are Worker M2 (Gen 3).
Your working directory is e:\SIH-171\.agents\worker_m2_gen3.

First, read:
1. e:\SIH-171\.agents\ORIGINAL_REQUEST.md
2. e:\SIH-171\.agents\orchestrator_gen3\PROJECT.md
3. e:\SIH-171\.agents\worker_m2_gen3\DISPATCH.md
4. e:\SIH-171\.agents\explorer_m2_1_gen3\handoff.md
5. e:\SIH-171\.agents\explorer_m2_2_gen3\handoff.md
6. e:\SIH-171\.agents\explorer_m2_3_gen3\handoff.md

You have exclusive write ownership of:
- popup/input.css
- popup/popup.html
- popup/popup.js
- popup/popup.css (compiled via npm run build:css)

DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Implement all changes for Milestone 2 (Responsive Shell & A11y: Features 5, 6, 7, 8, 9) per the explorer handoffs:
1. Update popup/input.css:
   - Base body styles maintaining Chrome popup bounds (max 800x600, clamped with max-width: 100vw; max-height: 100vh; overflow: hidden;) and fluid tab popout scaling.
   - Remove outline: none !important on inputs; add universal accessible :focus-visible indicators (#305f9f, 2px outline), toggle focus rings, and container focus-within.
   - Nav button lifecycle states (:focus-visible, :active, :disabled, hover).
2. Update popup/popup.html:
   - Add popout detection script in <head>.
   - Remove inline style="width: 800px; height: 600px;" from body and add responsive classes (w-full h-screen md:w-[800px] md:h-[600px] flex flex-col md:flex-row overflow-hidden).
   - Responsive nav bar: bottom bar on mobile (< 768px), vertical sidebar on standard popup/desktop (>= 768px).
   - Responsive grids: video feeds (grid-cols-1 sm:grid-cols-2), telemetry bar (grid-cols-2 sm:grid-cols-4 md:grid-cols-7), settings grid (grid-cols-1 sm:grid-cols-2), goal input row (flex-col sm:flex-row).
   - Form accessibility: add for="..." attributes to all labels in Agent, Settings, Vault, and HITL. Add sr-only labels for vault add inputs.
   - Button accessibility: add aria-label and title to icon-only buttons (#btnPopout, #btnTestConnection, .expand-btn, #modalClose, #vaultAddForm button).
   - Modal accessibility: role="dialog" aria-modal="true" on #hitlOverlay and #videoModal; role="alertdialog" aria-modal="true" on #approvalOverlay.
   - WAI-ARIA tab semantics: role="tablist", role="tab", aria-selected, aria-controls on nav, role="tabpanel" on tab panes.
3. Update popup/popup.js:
   - Popout mode detection (set popout-mode class on documentElement and body if popout=true query param or window > 800x600).
   - #btnPopout opens popup/popup.html?popout=true.
   - Accessible tab switching logic synchronizing aria-selected, hidden, active, aria-hidden.
   - In loadVaultUI(), add aria-label and title to dynamic vault buttons (toggleEyeBtn, valEl, editBtn, saveBtn, delBtn) and remove focus:outline-none.
4. Run verification commands:
   - npm run build:css
   - npm run test:syntax
   - npm test
   - node --test tests/e2e/tier1_features.test.js tests/e2e/tier2_boundaries.test.js
5. Write your handoff report to e:\SIH-171\.agents\worker_m2_gen3\handoff.md and report back via send_message to your caller.

