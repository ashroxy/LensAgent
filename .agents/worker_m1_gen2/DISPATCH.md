## 2026-09-05T07:23:10Z
You are Worker M1 (teamwork_preview_worker) for Milestone 1: Tooling, Packaging & Code Hygiene.

Your working directory is: e:\SIH-171\.agents\worker_m1_gen2

Read the following files before taking action:
- e:\SIH-171\.agents\ORIGINAL_REQUEST.md
- e:\SIH-171\.agents\orchestrator_gen2\PROJECT.md
- e:\SIH-171\.agents\explorer_m1_1\handoff.md
- e:\SIH-171\.agents\explorer_m1_2\handoff.md
- e:\SIH-171\.agents\explorer_m1_3\handoff.md

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Scope and Tasks:
1. Update `package.json`:
   - Set `"main": "background/service-worker.js"`
   - Move `"eslint"` and `"playwright"` from `"dependencies"` to `"devDependencies"`
   - Add npm scripts:
     - `"build:css": "tailwindcss -i ./popup/input.css -o ./popup/popup.css --minify"`
     - `"watch:css": "tailwindcss -i ./popup/input.css -o ./popup/popup.css --watch"`
     - `"lint": "eslint ."`
     - `"test": "node --test tests/unit/*.test.js"`
     - `"test:e2e": "playwright test"`
     - `"test:backend": "python -m pytest project/backend/tests -o pythonpath=project/backend"`
     - `"test:syntax": "node --check background/service-worker.js popup/popup.js privacy_engine.js lib/*.js offscreen/offscreen.js"`
2. Create `eslint.config.js` (ESLint 10 Flat Config):
   - Ignore `node_modules/**`, `dist/**`, `models/**`, `assets/**`, `project/**`, `.agents/**`.
   - Provide standard globals: `chrome`, `window`, `document`, `console`, `Blob`, `URL`, `setTimeout`, `clearTimeout`, `setInterval`, `clearInterval`.
3. Delete dead / corrupt / orphaned files:
   - `e:\SIH-171\lib\agent-loop-test.js` (corrupted duplicate with patch error)
   - `e:\SIH-171\offscreen\privacy_engine.js` (orphaned duplicate)
   - `e:\SIH-171\offscreen.html` (root duplicate, extension uses `offscreen/offscreen.html`)
   - `e:\SIH-171\offscreen\vault_manager.js` (orphaned legacy copy)
4. Enrich active `e:\SIH-171\privacy_engine.js`:
   - Add Indian PII regexes in `PII_PATTERNS`:
     - `UPI_ID`: `/[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z]{2,64}/i`
     - `PASSPORT`: `/[A-Z][1-9][0-9]{7}/`
     - `DRIVING_LICENSE`: `/[A-Z]{2}[0-9]{2}[0-9]{11}|[A-Z]{2}-[0-9]{13}/`
   - Update `getPlaceholderText(category)`:
     - 'UPI_ID': '[REDACTED_UPI_ID]'
     - 'PASSPORT': '[REDACTED_PASSPORT_****]'
     - 'DRIVING_LICENSE': '[REDACTED_DL_****]'
   - Ensure `scanValue` and `redactText` work seamlessly with these new patterns.
5. Check and fix syntax in `tests/e2e/helpers/`:
   - Inspect `extension-launcher.js`, `mock-server.js`, `dom-fixtures.js` and fix any syntax errors.
6. Compile Tailwind CSS:
   - Run `npx tailwindcss -i ./popup/input.css -o ./popup/popup.css --minify`
   - Verify `popup/popup.css` is generated and valid.
7. Verification:
   - Run `npm run build:css`
   - Run `npm run test:syntax`
   - Run `npm run test:backend`
   - Run `npx eslint .` (or `npm run lint`)
8. Write your completion handoff report to `e:\SIH-171\.agents\worker_m1_gen2\handoff.md` with:
   - What changed
   - Build and test commands run and exact outputs
   - Any notes or caveats
9. Notify orchestrator via `send_message` when done.

## 2026-09-05T07:28:21Z
**Context**: User Guidance Update on Indian PII & E2E Coverage
**Content**: The user and sentinel provided updated guidance:
"Ensure that all Indian PII patterns strictly follow the updated rules from the requirements, and E2E coverage is comprehensive. Keep going."
In addition to Aadhaar, PAN, UPI_ID, Passport, Driving License, Phone (+91), ensure `privacy_engine.js` `PII_PATTERNS` and `getPlaceholderText` also include:
- `VOTER_ID`: `/[A-Z]{3}[0-9]{7}/` -> `'[REDACTED_VOTER_ID]'`
- `PIN_CODE`: `/\b[1-9][0-9]{5}\b/` -> `'[REDACTED_PIN_CODE]'`
Ensure `scanValue` and `redactText` support all of these Indian PII types cleanly.
**Action**: Incorporate these patterns into your `privacy_engine.js` updates and verification.
