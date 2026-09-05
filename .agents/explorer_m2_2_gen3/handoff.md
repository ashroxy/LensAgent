# Milestone 2 Investigation Report: Accessible Focus Rings (F7) & Form Labels (F8)
**Investigator**: Explorer M2-2 (Gen 3)  
**Date**: September 5, 2026  
**Target Files**: `popup/popup.html`, `popup/input.css`, `popup/popup.js`  
**Related Requirements**: Feature 7 (Accessible Focus Rings), Feature 8 (Accessible Form Labels), WCAG 2.1 AA Compliance

---

## 1. Observation

### 1.1 Direct Observations in `popup/input.css`
At `popup/input.css:143-145`:
```css
input#goalInput:focus-visible, input.border-none:focus-visible { outline: none !important; }
.neu-recessed:focus-within { outline: 2px solid #305f9f; outline-offset: 2px; }
```
- Line 143 explicitly suppresses keyboard focus rings with `!important` on `input#goalInput:focus-visible` and any input carrying the class `border-none`.
- Because `border-none` is applied to `#setting-serverUrl`, `#setting-maxSteps`, `#setting-timeout`, `#settCaptureQuality`, `#settStabilizeDelay`, `#vaultAddKey`, `#vaultAddValue`, and `#hitlInput`, **every single text and number input across the entire application has zero visible focus outline**.
- There are no `:focus-visible` rules defined for:
  - Navigation buttons (`.nav-btn`, `popup/input.css:58-87`)
  - Neumorphic buttons (`.neu-btn`, `.neu-btn-primary`, `.neu-btn-secondary`, `popup/input.css:24-51`)
  - Custom toggle switch inputs (`.neu-toggle-input`, `popup/input.css:88-96`). When the `.sr-only` checkbox receives focus, the visible pill `.neu-toggle-bg` renders no indicator.

### 1.2 Direct Observations in `popup/popup.html`

#### Missing Form Labels & `for` Attributes:
1. **Agent Goal Input** (`popup/popup.html:71`):
   ```html
   <label class="block font-label-md text-[11px] text-on-surface-variant mb-2 ml-2 uppercase tracking-wider">Agent Goal</label>
   <div class="neu-recessed rounded-xl px-4 py-3 flex items-center gap-3">
       <span class="material-symbols-outlined text-primary text-[20px]">target</span>
       <input id="goalInput" class="bg-transparent border-none outline-none w-full font-body-md text-body-md text-on-surface placeholder:text-outline/60 p-0" type="text" placeholder="Enter objective..."/>
   </div>
   ```
   - `<label>` lacks `for="goalInput"`.
   - Clicking the label does not focus `#goalInput`.
2. **Settings Inputs** (`popup/popup.html:174-192`):
   - Line 174: `<label class="font-label-md text-[11px] text-on-surface-variant uppercase tracking-wide">Server URL</label>` lacks `for="setting-serverUrl"`.
   - Line 178: `<label class="...">Max Steps</label>` lacks `for="setting-maxSteps"`.
   - Line 182: `<label class="...">Timeout (ms)</label>` lacks `for="setting-timeout"`.
   - Line 186: `<label class="...">Capture Quality</label>` lacks `for="settCaptureQuality"`.
   - Line 190: `<label class="...">Stabilize Delay (ms)</label>` lacks `for="settStabilizeDelay"`.
3. **Settings Toggle Switches** (`popup/popup.html:199-226`):
   - Line 199: `<label class="flex items-center justify-between cursor-pointer">` lacks explicit `for="setting-jitter"`.
   - Line 208: `<label class="flex items-center justify-between cursor-pointer">` lacks explicit `for="setting-delta"`.
   - Line 217: `<label class="flex items-center justify-between cursor-pointer">` lacks explicit `for="setting-liveAudit"`.
4. **Vault Add Item Inputs** (`popup/popup.html:274-281`):
   - Lines 276-280:
     ```html
     <form id="vaultAddForm" class="flex gap-3 items-center">
         <input type="text" id="vaultAddKey" placeholder="Key (e.g. passport_num)" class="flex-1 neu-flat rounded-lg px-3 py-2 text-body-sm bg-transparent border-none outline-none" required />
         <input type="password" id="vaultAddValue" placeholder="Value" class="flex-1 neu-flat rounded-lg px-3 py-2 text-body-sm bg-transparent border-none outline-none" required />
         <button type="submit" class="p-2 neu-btn-primary rounded-lg text-primary flex items-center justify-center shrink-0" title="Add to Vault"><span class="material-symbols-outlined text-[18px]">add</span></button>
     </form>
     ```
     - Neither `#vaultAddKey` nor `#vaultAddValue` has an associated `<label>` or `aria-label`.
5. **Modal Overlays** (`popup/popup.html:293-335`):
   - `#hitlOverlay`: `#hitlInput` (line 299) has no `<label>` or `aria-label`. `#hitlSaveToVault` `<label>` (line 301) lacks `for="hitlSaveToVault"`. Overlay lacks `role="dialog"` and `aria-modal="true"`.
   - `#approvalOverlay`: Lacks `role="alertdialog"` and `aria-modal="true"`. `<h2>Action Approval</h2>` lacks an ID to associate with `aria-labelledby`.

#### Missing `aria-label`s on Icon-Only Buttons:
- `popup/popup.html:49`: `<button id="btnPopout" title="Open in new tab" ...>` has icon `open_in_new`, lacks `aria-label="Open in new tab"`.
- `popup/popup.html:52`: `<button id="btnTestConnection" title="Test Connection" ...>` has icon `sensors`, lacks `aria-label="Test backend connection"`.
- `popup/popup.html:93`: `<button class="expand-btn ... data-target="raw">` has icon `fullscreen`, lacks `aria-label` and `title`.
- `popup/popup.html:100`: `<button class="expand-btn ... data-target="redacted">` has icon `fullscreen`, lacks `aria-label` and `title`.
- `popup/popup.html:279`: `<button type="submit" ... title="Add to Vault">` has icon `add`, lacks `aria-label="Add to Vault"`.
- `popup/popup.html:327`: `<button id="modalClose" ...>` has icon `close`, lacks `aria-label="Close fullscreen view"` and `title="Close"`.

### 1.3 Direct Observations in `popup/popup.js`
In `loadVaultUI()` (`popup/popup.js:764-824`):
- Line 765: `toggleEyeBtn.className = "... focus:outline-none ...";` explicitly disables focus outline.
- Line 764-775: `toggleEyeBtn` has icon `visibility`, lacks `aria-label` and `title`.
- Line 761, 798: `valEl` has `border-none outline-none` and lacks `aria-label`.
- Line 786-789: `saveBtn` has icon `save`, lacks `aria-label` and `title`.
- Line 790-793: `editBtn` has icon `edit`, lacks `aria-label` and `title`.
- Line 816-819: `delBtn` has icon `delete`, lacks `aria-label` and `title`.

### 1.4 Test Suite Baseline Execution
Executed commands and verbatim output:
1. `node --test tests/e2e/tier1_features.test.js`:
   - Output: `ℹ pass 150, fail 0` (duration 10.2s).
   - Features 7 & 8 tests (F7.1-F7.5, F8.1-F8.5) passed assertions on DOM node existence, `document.activeElement`, and placeholder presence.
2. `node --test tests/e2e/tier2_boundaries.test.js`:
   - Output: `ℹ pass 151, fail 0` (duration 3.9s).
   - Boundary tests F7.B1-F7.B5 and F8.B1-F8.B5 verified focus eligibility and label containment.
3. `npm run build:css`:
   - Output: `tailwindcss -i ./popup/input.css -o ./popup/popup.css --minify` succeeded in 346ms.

---

## 2. Logic Chain

1. **Focus Rings (Feature 7)**:
   - *Premise A*: WCAG 2.1 Success Criterion 2.4.7 (Focus Visible - Level AA) requires all keyboard operable user interface components to display an active focus indicator.
   - *Observation 1.1*: Line 143 in `input.css` enforces `input.border-none:focus-visible { outline: none !important; }`.
   - *Observation 1.1 & 1.2*: All form inputs carry class `border-none` and `outline-none`. Thus, Tab navigation produces zero visible indicator on any form input.
   - *Inference 1*: Deleting `input.border-none:focus-visible { outline: none !important; }` and replacing it with a universal `:focus-visible` rule (`outline: 2px solid #305f9f !important; outline-offset: 2px !important;`) ensures all interactive elements receive high-contrast visual feedback.
   - *Color Contrast Check*: `#305f9f` on `#f7f9fd` has a contrast ratio of 5.8:1, significantly higher than the 3:1 WCAG requirement.
   - *Premise B*: The custom toggle switches (`.neu-toggle-input`) are hidden with Tailwind `.sr-only`. Focus is placed on the hidden element, giving no visual feedback on the switch itself.
   - *Inference 2*: Adding `.neu-toggle-input:focus-visible + .neu-toggle-bg { outline: 2px solid #305f9f !important; outline-offset: 2px !important; }` draws the focus ring directly onto the visible toggle pill.
   - *Premise C*: For `#goalInput`, its outer parent container `.neu-recessed` houses both the `target` icon and the text input.
   - *Inference 3*: Applying `:focus-within` on `.neu-recessed` outlines the composite input control. Setting `#goalInput:focus-visible { outline: none !important; }` prevents an ugly inner nested border while keeping the container focus ring active.

2. **Form Labels & Attributes (Feature 8)**:
   - *Premise D*: WCAG 2.1 Success Criterion 3.3.2 (Labels or Instructions - Level A) and Criterion 1.3.1 (Info and Relationships) require form controls to have programmatically determinable labels via explicit `for="..."` attributes referencing unique element IDs.
   - *Observation 1.2*: `<label>` elements in `#tab-agent` and `#tab-settings` lack `for="..."` attributes.
   - *Inference 4*: Adding `for="goalInput"`, `for="setting-serverUrl"`, `for="setting-maxSteps"`, `for="setting-timeout"`, `for="settCaptureQuality"`, `for="settStabilizeDelay"`, `for="setting-jitter"`, `for="setting-delta"`, and `for="setting-liveAudit"` establishes explicit accessibility relationships and allows clicking labels to activate inputs.
   - *Premise E*: The Vault add form in `#tab-vault` completely lacks `<label>` tags for `#vaultAddKey` and `#vaultAddValue`.
   - *Inference 5*: Adding `<label for="vaultAddKey" class="sr-only">Vault Item Key</label>` and `<label for="vaultAddValue" class="sr-only">Vault Item Value</label>` along with explicit `aria-label` attributes ensures full screen reader compatibility without altering the visual neumorphic layout.

3. **Icon-Only Buttons & Modals**:
   - *Premise F*: WCAG 2.1 Success Criterion 4.1.2 (Name, Role, Value) requires controls without visible text labels to provide an accessible name via `aria-label`.
   - *Observation 1.2 & 1.3*: 10 icon-only buttons across header, video cards, modals, and dynamic vault items lack `aria-label` attributes.
   - *Inference 6*: Adding descriptive `aria-label` and `title` attributes across all 10 buttons satisfies Criterion 4.1.2.
   - *Premise G*: Modals must announce their dialog role to screen readers.
   - *Inference 7*: Adding `role="dialog" aria-modal="true"` to `#hitlOverlay` and `#videoModal`, and `role="alertdialog" aria-modal="true"` to `#approvalOverlay`, prevents screen readers from treating modals as generic inline containers.

---

## 3. Caveats

1. **Popout/Tab Mode Grid Shift**: Feature 5 and Feature 6 are being investigated in parallel by Explorer M2-1 for responsive width/height adaptations. The CSS and HTML changes proposed here are scoped purely to focus indicators and label accessibility, and do not alter layout geometry or grid structures.
2. **HITL Abort Button**: Feature 26 (HITL Modal Abort Button) will add an abort/cancel button in Milestone 6. The `aria-modal="true"` and `aria-labelledby` additions here prepare the modal foundation without pre-empting Milestone 6 implementation.
3. **Tailwind CLI Dependency**: The CSS changes in `popup/input.css` require running `npm run build:css` to recompile `popup/popup.css`. The compiled bundle must be kept in sync.

---

## 4. Conclusion & Actionable Implementation Plan for Worker M2

### Step 1: CSS Updates in `popup/input.css`

Replace lines 143-145:
```css
/* BEFORE */
input#goalInput:focus-visible, input.border-none:focus-visible { outline: none !important; }
.neu-recessed:focus-within { outline: 2px solid #305f9f; outline-offset: 2px; }
```

With:
```css
/* AFTER: Accessible Focus Indicators (WCAG 2.1 AA Compliant - Criteria 2.4.7 & 1.4.11) */
:focus-visible {
    outline: 2px solid #305f9f !important;
    outline-offset: 2px !important;
}

button:focus-visible,
input:focus-visible,
select:focus-visible,
textarea:focus-visible,
[tabindex]:focus-visible,
.nav-btn:focus-visible,
.neu-btn:focus-visible,
.neu-btn-primary:focus-visible,
.neu-btn-secondary:focus-visible {
    outline: 2px solid #305f9f !important;
    outline-offset: 2px !important;
}

/* Custom toggle switch: outline the visible pill when sr-only input has keyboard focus */
.neu-toggle-input:focus-visible + .neu-toggle-bg {
    outline: 2px solid #305f9f !important;
    outline-offset: 2px !important;
}

/* Recessed container focus integration */
.neu-recessed:focus-within {
    outline: 2px solid #305f9f;
    outline-offset: 2px;
}

/* Goal input search bar: parent container provides the single focus outline */
.neu-recessed:has(#goalInput:focus-visible) {
    outline: 2px solid #305f9f;
    outline-offset: 2px;
}
#goalInput:focus-visible {
    outline: none !important;
}
```

---

### Step 2: HTML Markup Updates in `popup/popup.html`

#### 2.1 Header Icon-Only Buttons (lines 49-54)
```html
<button id="btnPopout" title="Open in new tab" aria-label="Open in new tab" class="w-8 h-8 rounded-full neu-btn-secondary flex items-center justify-center text-on-surface-variant hover:text-primary transition-colors hidden md:flex">
    <span class="material-symbols-outlined text-[18px]" aria-hidden="true">open_in_new</span>
</button>
<button id="btnTestConnection" title="Test Connection" aria-label="Test backend connection" class="w-8 h-8 rounded-full neu-btn-secondary flex items-center justify-center text-on-surface-variant hover:text-primary transition-colors">
    <span class="material-symbols-outlined text-[18px]" aria-hidden="true">sensors</span>
</button>
```

#### 2.2 Agent Goal Label (lines 71-75)
```html
<label for="goalInput" class="block font-label-md text-[11px] text-on-surface-variant mb-2 ml-2 uppercase tracking-wider">Agent Goal</label>
<div class="neu-recessed rounded-xl px-4 py-3 flex items-center gap-3">
    <span class="material-symbols-outlined text-primary text-[20px]" aria-hidden="true">target</span>
    <input id="goalInput" class="bg-transparent border-none outline-none w-full font-body-md text-body-md text-on-surface placeholder:text-outline/60 p-0" type="text" placeholder="Enter objective..." aria-label="Agent Goal"/>
</div>
```

#### 2.3 Feed Fullscreen Expand Buttons (lines 93, 100)
```html
<!-- Raw Viewport Expand -->
<button class="expand-btn w-6 h-6 rounded neu-btn-secondary flex items-center justify-center text-primary" data-target="raw" aria-label="Expand Raw Viewport to fullscreen" title="Fullscreen">
    <span class="material-symbols-outlined text-[14px]" aria-hidden="true">fullscreen</span>
</button>

<!-- Sanitized Stream Expand -->
<button class="expand-btn w-6 h-6 rounded neu-btn-secondary flex items-center justify-center text-tertiary" data-target="redacted" aria-label="Expand Sanitized Stream to fullscreen" title="Fullscreen">
    <span class="material-symbols-outlined text-[14px]" aria-hidden="true">fullscreen</span>
</button>
```

#### 2.4 Settings Form Labels (lines 173-193)
```html
<div class="flex flex-col gap-2 col-span-2">
    <label for="setting-serverUrl" class="font-label-md text-[11px] text-on-surface-variant uppercase tracking-wide">Server URL</label>
    <input id="setting-serverUrl" type="url" placeholder="http://localhost:8000" class="neu-recessed bg-transparent border-none rounded-xl px-4 py-2.5 text-body-md text-primary outline-none w-full"/>
</div>
<div class="flex flex-col gap-2">
    <label for="setting-maxSteps" class="font-label-md text-[11px] text-on-surface-variant uppercase tracking-wide">Max Steps</label>
    <input id="setting-maxSteps" type="number" min="5" max="100" placeholder="25" class="neu-recessed bg-transparent border-none rounded-xl px-4 py-2.5 text-body-md text-primary outline-none w-full"/>
</div>
<div class="flex flex-col gap-2">
    <label for="setting-timeout" class="font-label-md text-[11px] text-on-surface-variant uppercase tracking-wide">Timeout (ms)</label>
    <input id="setting-timeout" type="number" min="2000" max="30000" step="500" placeholder="15000" class="neu-recessed bg-transparent border-none rounded-xl px-4 py-2.5 text-body-md text-primary outline-none w-full"/>
</div>
<div class="flex flex-col gap-2">
    <label for="settCaptureQuality" class="font-label-md text-[11px] text-on-surface-variant uppercase tracking-wide">Capture Quality</label>
    <input id="settCaptureQuality" type="number" min="30" max="100" placeholder="80" class="neu-recessed bg-transparent border-none rounded-xl px-4 py-2.5 text-body-md text-primary outline-none w-full"/>
</div>
<div class="flex flex-col gap-2">
    <label for="settStabilizeDelay" class="font-label-md text-[11px] text-on-surface-variant uppercase tracking-wide">Stabilize Delay (ms)</label>
    <input id="settStabilizeDelay" type="number" min="50" max="2000" step="50" placeholder="300" class="neu-recessed bg-transparent border-none rounded-xl px-4 py-2.5 text-body-md text-primary outline-none w-full"/>
</div>
```

#### 2.5 Settings Toggle Labels (lines 199-226)
```html
<label for="setting-jitter" class="flex items-center justify-between cursor-pointer">
    <span class="text-[13px] font-bold text-on-surface">Enable Request Jitter</span>
    <div class="relative">
        <input type="checkbox" id="setting-jitter" class="sr-only neu-toggle-input">
        <div class="w-12 h-6 bg-surface-container-high rounded-full neu-recessed neu-toggle-bg transition-colors p-1 flex items-center">
            <div class="w-4 h-4 bg-surface rounded-full neu-extruded neu-toggle-knob transition-transform"></div>
        </div>
    </div>
</label>
<label for="setting-delta" class="flex items-center justify-between cursor-pointer">
    <span class="text-[13px] font-bold text-on-surface">Delta Synchronization</span>
    <div class="relative">
        <input type="checkbox" id="setting-delta" class="sr-only neu-toggle-input">
        <div class="w-12 h-6 bg-surface-container-high rounded-full neu-recessed neu-toggle-bg transition-colors p-1 flex items-center">
            <div class="w-4 h-4 bg-surface rounded-full neu-extruded neu-toggle-knob transition-transform"></div>
        </div>
    </div>
</label>
<label for="setting-liveAudit" class="flex items-center justify-between cursor-pointer">
    <span class="text-[13px] font-bold text-on-surface">Live Audit Logging</span>
    <div class="relative">
        <input type="checkbox" id="setting-liveAudit" class="sr-only neu-toggle-input" checked>
        <div class="w-12 h-6 bg-surface-container-high rounded-full neu-recessed neu-toggle-bg transition-colors p-1 flex items-center">
            <div class="w-4 h-4 bg-surface rounded-full neu-extruded neu-toggle-knob transition-transform"></div>
        </div>
    </div>
</label>
```

#### 2.6 Vault Add Form Accessible Labels & Button (lines 274-281)
```html
<div class="neu-recessed rounded-xl p-4 mt-auto">
    <div class="text-[11px] text-on-surface-variant font-bold uppercase mb-3 flex items-center gap-1">
        <span class="material-symbols-outlined text-[14px]" aria-hidden="true">add_circle</span> Add Custom Field
    </div>
    <form id="vaultAddForm" class="flex gap-3 items-center">
        <label for="vaultAddKey" class="sr-only">Vault Item Key</label>
        <input type="text" id="vaultAddKey" placeholder="Key (e.g. passport_num)" aria-label="Vault item key" class="flex-1 neu-flat rounded-lg px-3 py-2 text-body-sm bg-transparent border-none outline-none" required />
        
        <label for="vaultAddValue" class="sr-only">Vault Item Value</label>
        <input type="password" id="vaultAddValue" placeholder="Value" aria-label="Vault item value" class="flex-1 neu-flat rounded-lg px-3 py-2 text-body-sm bg-transparent border-none outline-none" required />
        
        <button type="submit" class="p-2 neu-btn-primary rounded-lg text-primary flex items-center justify-center shrink-0" title="Add to Vault" aria-label="Add to Vault">
            <span class="material-symbols-outlined text-[18px]" aria-hidden="true">add</span>
        </button>
    </form>
</div>
```

#### 2.7 Modals Dialog Accessibility (lines 293-335)
```html
<!-- HITL Overlay -->
<div id="hitlOverlay" hidden role="dialog" aria-modal="true" aria-labelledby="hitlHeading" aria-describedby="hitlQuestion" class="fixed inset-0 bg-surface/80 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
    <div class="neu-flat rounded-2xl p-6 w-[400px] flex flex-col">
        <div class="flex items-center gap-2 text-primary font-bold mb-3" id="hitlHeading">
            <span class="material-symbols-outlined" aria-hidden="true">help</span> Agent needs input
        </div>
        <p id="hitlQuestion" class="text-[14px] text-on-surface mb-4">Loading...</p>
        <label for="hitlInput" class="sr-only">Agent Question Response</label>
        <input id="hitlInput" type="text" aria-labelledby="hitlHeading" aria-describedby="hitlQuestion" class="neu-recessed w-full rounded-lg px-3 py-2 text-[13px] border-none outline-none mb-3"/>
        <div class="flex items-center justify-between mb-4">
            <label for="hitlSaveToVault" class="flex items-center gap-2 text-[11px] text-on-surface-variant cursor-pointer">
                <input type="checkbox" id="hitlSaveToVault" class="accent-primary" checked> Save to Vault
            </label>
            <span id="hitlVaultKeyLabel" hidden class="text-[10px] text-outline">Key: <code id="hitlVaultKey" class="text-primary font-bold"></code></span>
        </div>
        <button id="hitlSendBtn" class="w-full py-2 neu-btn-primary text-primary font-bold text-[12px] uppercase rounded-lg">Send Response</button>
    </div>
</div>

<!-- Approval Overlay -->
<div id="approvalOverlay" hidden role="alertdialog" aria-modal="true" aria-labelledby="approvalTitle" aria-describedby="approvalContext" class="fixed inset-0 bg-surface/80 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
    <div class="neu-flat rounded-2xl p-6 w-[360px] text-center flex flex-col items-center">
        <span class="material-symbols-outlined text-[40px] text-warning mb-3 animate-pulse" aria-hidden="true">warning</span>
        <h2 id="approvalTitle" class="text-[16px] font-bold text-on-surface mb-2">Action Approval</h2>
        <p id="approvalContext" class="text-[13px] text-on-surface-variant mb-2"></p>
        <div id="approvalDetail" class="neu-recessed w-full p-2 rounded text-[11px] font-mono text-warning break-all mb-4"></div>
        <div class="flex gap-3 w-full">
            <button id="approvalDenyBtn" class="flex-1 py-2 neu-btn text-on-surface font-bold text-[12px] uppercase rounded-lg">Reject</button>
            <button id="approvalApproveBtn" class="flex-1 py-2 neu-btn-primary text-primary font-bold text-[12px] uppercase rounded-lg">Approve</button>
        </div>
    </div>
</div>

<!-- Video Modal Close Button -->
<div id="videoModal" hidden role="dialog" aria-modal="true" aria-labelledby="modalTitle" class="bg-surface/90 backdrop-blur-md flex flex-col p-6 transition-all" style="position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; z-index: 999999; margin: 0;">
    <div class="flex justify-between items-center mb-4 w-full shrink-0">
        <h2 id="modalTitle" class="text-[18px] font-bold text-on-surface flex items-center gap-2"></h2>
        <button id="modalClose" title="Close fullscreen view" aria-label="Close fullscreen view" class="w-10 h-10 rounded-full neu-btn text-on-surface flex items-center justify-center shrink-0">
            <span class="material-symbols-outlined" aria-hidden="true">close</span>
        </button>
    </div>
```

---

### Step 3: Dynamic Vault Card Updates in `popup/popup.js`

In `loadVaultUI()` (`popup/popup.js:757-824`):
1. For `valEl` (lines 757-763):
   ```js
   valEl.setAttribute("aria-label", `Vault value for ${key}`);
   ```
2. For `toggleEyeBtn` (lines 764-775):
   - Remove `focus:outline-none` from `className`.
   - Set initial label:
     ```js
     toggleEyeBtn.className = "text-on-surface-variant hover:text-primary transition-colors shrink-0";
     toggleEyeBtn.setAttribute("aria-label", `Reveal value for ${key}`);
     toggleEyeBtn.title = "Reveal value";
     ```
   - Update in toggle handler:
     ```js
     toggleEyeBtn.onclick = () => {
         if (valEl.type === "password") {
             valEl.type = "text";
             toggleEyeBtn.innerHTML = `<span class="material-symbols-outlined text-[16px]">visibility_off</span>`;
             toggleEyeBtn.setAttribute("aria-label", `Mask value for ${key}`);
             toggleEyeBtn.title = "Mask value";
         } else {
             valEl.type = "password";
             toggleEyeBtn.innerHTML = `<span class="material-symbols-outlined text-[16px]">visibility</span>`;
             toggleEyeBtn.setAttribute("aria-label", `Reveal value for ${key}`);
             toggleEyeBtn.title = "Reveal value";
         }
     };
     ```
3. For `saveBtn` (lines 786-789):
   ```js
   saveBtn.setAttribute("aria-label", `Save ${key}`);
   saveBtn.title = `Save ${key}`;
   ```
4. For `editBtn` (lines 790-793):
   ```js
   editBtn.setAttribute("aria-label", `Edit ${key}`);
   editBtn.title = `Edit ${key}`;
   ```
5. For `delBtn` (lines 816-819):
   ```js
   delBtn.setAttribute("aria-label", `Delete ${key}`);
   delBtn.title = `Delete ${key}`;
   ```

---

## 5. Verification Method

### 5.1 Independent Test Commands
Execute the following verification sequence:
```powershell
# 1. Compile CSS bundle from source
npm run build:css

# 2. Run unit tests
npm test

# 3. Run Tier 1 Feature Coverage E2E suite
node --test tests/e2e/tier1_features.test.js

# 4. Run Tier 2 Boundary & Corner Case E2E suite
node --test tests/e2e/tier2_boundaries.test.js

# 5. Check JS syntax validity
npm run test:syntax
```

### 5.2 Specific Files & Invalidation Conditions
- **Files to Inspect**:
  - `popup/input.css` (verify lines 143+ no longer contain `outline: none !important` on `border-none`)
  - `popup/popup.css` (verify compiled output contains `:focus-visible` outline declarations)
  - `popup/popup.html` (verify all labels have matching `for` attributes and icon buttons have `aria-label`)
  - `popup/popup.js` (verify dynamic vault buttons assign `aria-label` and `title`)
- **Invalidation Conditions**:
  - Any interactive button or input has `outline: none` without an alternative high-contrast focus indicator when navigated via Tab.
  - Any `<label>` in Settings or Agent tabs does not link to an input via `for="..."`.
  - Any icon-only button lacks an accessible name (`aria-label`).
  - `tier1_features.test.js` or `tier2_boundaries.test.js` reports any failing assertions.
