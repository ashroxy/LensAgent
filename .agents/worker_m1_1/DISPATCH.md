## 2026-09-05T07:11:03Z
You are Worker 1 for Milestone 1 (Tooling, Packaging & Code Hygiene).
Your working directory is: e:\SIH-171\.agents\worker_m1_1

MANDATORY: Read e:\SIH-171\.agents\ORIGINAL_REQUEST.md first before starting work.
Read e:\SIH-171\.agents\orchestrator_1\PROJECT.md for global architecture, contracts, and milestone plan.
Read all 3 Explorer handoffs for Milestone 1:
- e:\SIH-171\.agents\explorer_m1_1\handoff.md (Scripts & Config)
- e:\SIH-171\.agents\explorer_m1_2\handoff.md (Dependencies & Packaging)
- e:\SIH-171\.agents\explorer_m1_3\handoff.md (Hygiene & Dead Code)

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

File Write Ownership:
You own exclusively:
- e:\SIH-171\package.json
- e:\SIH-171\eslint.config.js
- e:\SIH-171\privacy_engine.js
- e:\SIH-171\lib\agent-loop-test.js (delete)
- e:\SIH-171\offscreen\privacy_engine.js (delete)
- e:\SIH-171\offscreen.html (delete)
- e:\SIH-171\popup\popup.css (compile via Tailwind)
- e:\SIH-171\tests\e2e\helpers\extension-launcher.js, mock-server.js, dom-fixtures.js (syntax fixes)
- e:\SIH-171\PROJECT.md (copy from e:\SIH-171\.agents\orchestrator_1\PROJECT.md to project root)

Implementation Tasks:
1. Update e:\SIH-171\package.json:
   - Move eslint and playwright to devDependencies; leave dependencies as {}.
   - Remove "main": "tailwind.config.js" (set to "background/service-worker.js" or omit).
   - Add standard scripts:
     * "build:css": "tailwindcss -i ./popup/input.css -o ./popup/popup.css --minify"
     * "watch:css": "tailwindcss -i ./popup/input.css -o ./popup/popup.css --watch"
     * "lint": "eslint ."
     * "test:syntax": "node --check lib/*.js background/*.js offscreen/*.js popup/*.js privacy_engine.js vision_model.js"
     * "test:backend": "python -m pytest project/backend/tests -o pythonpath=project/backend"
     * "test": "npm run test:syntax && npm run test:backend"
2. Run `npm install` at root e:\SIH-171 to update package-lock.json. Verify `npm ci --dry-run` and `npm ls` exit 0.
3. Create minimal `e:\SIH-171\eslint.config.js` (per Explorer 1 & 2 recommendations) so `npm run lint` works cleanly under ESLint v10.
4. Delete corrupted/dead files:
   - `e:\SIH-171\lib\agent-loop-test.js`
   - `e:\SIH-171\offscreen\privacy_engine.js`
   - `e:\SIH-171\offscreen.html` (root unreferenced file)
5. Enrich `e:\SIH-171\privacy_engine.js` with the missing Indian PII patterns (UPI_ID, PASSPORT, DRIVING_LICENSE) and placeholder mappings per Explorer 3 handoff.
6. Fix syntax in `tests/e2e/helpers/extension-launcher.js`, `mock-server.js`, and `dom-fixtures.js`.
7. Copy `e:\SIH-171\.agents\orchestrator_1\PROJECT.md` to `e:\SIH-171\PROJECT.md`.
8. Execute verification:
   - Run `npm run build:css` and confirm valid minified `popup/popup.css` is generated.
   - Run `npm run test:syntax` and confirm 0 syntax errors.
   - Run `npm run test:backend` and confirm 11/11 pytest tests pass.
   - Run `npm run lint` and verify output.
9. Deliver comprehensive self-contained `e:\SIH-171\.agents\worker_m1_1\handoff.md` with all command outputs and verification details, then send completion message to orchestrator.
