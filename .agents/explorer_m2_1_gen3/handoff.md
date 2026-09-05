# Handoff Report: Feature 5 (Fluid Popout Viewport) & Feature 6 (Responsive Shell & Grid)

**Agent**: Explorer M2-1 (Gen 3)  
**Date**: 2026-09-05  
**Target Milestone**: Milestone 2 (Responsive Shell & A11y)  
**Target Recipient**: Worker M2 & Parent Orchestrator (`6cb78db2-267d-4206-85c4-e535a7d4b1ec`)  

---

## 1. Observation

Direct code inspections and tool runs confirmed the following exact state:

### 1.1 Hardcoded Viewport Constraints
- **`popup/popup.html:11`**:
  ```html
  <body class="bg-background text-on-surface font-body-md flex overflow-hidden" style="width: 800px; height: 600px;">
  ```
  The inline `style="width: 800px; height: 600px;"` has highest CSS specificity, preventing the document from adapting to any viewport larger than 800x600 or smaller than 800x600 when opened in a dedicated browser tab.
- **`popup/input.css:99-105`**:
  ```css
  /* Base Body Styles */
  body {
      width: 800px;
      height: 600px;
      overflow: hidden;
      user-select: none;
      -webkit-font-smoothing: antialiased;
  }
  ```
  `popup/popup.css` reflects this rule directly. There are no media queries or fluid viewport modifiers (`max-width: 100vw; max-height: 100vh;`) for standard popup safety or fluid tab scaling.

### 1.2 Popout Button Behavior & Mode Detection
- **`popup/popup.js:142`**:
  ```javascript
  const isPopoutMode = window.innerWidth > 800 || window.innerHeight > 600;
  ```
- **`popup/popup.js:162-166`**:
  ```javascript
  if (btnPopout) {
    btnPopout.addEventListener("click", () => {
      chrome.tabs.create({ url: chrome.runtime.getURL("popup/popup.html") });
    });
  }
  ```
  `chrome.tabs.create` opens `popup/popup.html` without any query parameters or hash to declare tab mode. In `popup.js:148-160`, `isPopoutMode` attempts to detect full tab mode only via `window.innerWidth > 800 || window.innerHeight > 600`. However, because `popup.html` lacks a `.popout-mode` class on the root or body, CSS rules cannot target tab mode independently. Furthermore, if the user opens a popout tab on a narrow window (<= 800px width), `isPopoutMode` evaluates to `false` and treats it as an extension popup.

### 1.3 Rigid Shell & Grid Layouts
- **Navigation Bar (`popup/popup.html:13`)**:
  ```html
  <nav class="w-[200px] h-full bg-surface-container-low border-r border-outline-variant/10 shadow-sm flex flex-col py-6 shrink-0 z-20">
  ```
  Comment on line 12 states `<!-- SideNavBar (Bottom bar on mobile) -->`, but the classes use static `w-[200px] flex flex-col` without mobile responsiveness. On screens < 768px, a 200px column consumes 50%+ of the viewport width.
- **Video Feeds Grid (`popup/popup.html:91`)**:
  ```html
  <div class="grid gap-4 grid-cols-2">
  ```
  Rigid 2 columns forced at all viewport sizes. On mobile viewports (< 640px), dual 1280x720 video feeds shrink to ~150px each, rendering canvas content illegible.
- **Telemetry Metrics Bar (`popup/popup.html:114`)**:
  ```html
  <div class="grid gap-2 grid-cols-7">
  ```
  Hardcoded `grid-cols-7` compresses 7 metric tiles into <45px width on narrow screens, causing numeric clipping, sparkline distortion, and text overflow.
- **Settings Connection Grid (`popup/popup.html:172`)**:
  ```html
  <div class="grid grid-cols-2 gap-4">
      <div class="flex flex-col gap-2 col-span-2">
  ```
  Forces 2 columns even on small mobile screens (< 640px), squishing numeric inputs and labels.
- **Goal Input Row (`popup/popup.html:69`)**:
  ```html
  <div class="flex gap-4 items-end">
  ```
  Forces horizontal arrangement without stacking on narrow viewports.

### 1.4 Test Suite Baseline Verification
- Tool command: `node --test tests/e2e/tier1_features.test.js tests/e2e/tier2_boundaries.test.js`
- Result: **301 tests passing, 0 failing, 0 skipped** across all 30 features (Tier 1 & Tier 2).
- Key test assertions:
  * `tier1_features.test.js:212-248` (F5.1 - F5.5): Verifies root `body` exists, `#btnPopout` button exists, main wrapper has `h-full` or `flex`, responsive viewport meta tag exists, and `#videoModal` exists.
  * `tier1_features.test.js:253-294` (F6.1 - F6.5): Verifies `nav` has `flex`, 7 telemetry cell IDs exist, dual canvas streams have parent containers, 4 nav buttons exist with `data-tab`, and `main` is flexible (`flex-1`).
  * `tier2_boundaries.test.js:242-278` (F5.B1 - F5.B5): Verifies `body.style.width = '320px'` (mobile boundary) and `body.style.width = '3840px'` (4K boundary) can be set programmatically without error, and `body` has `overflow-hidden`.
  * `tier2_boundaries.test.js:285-323` (F6.B1 - F6.B5): Verifies telemetry displays large steps (999,999), 0ms latency, high dropped frames, 0%/100% quality, and 1x1 canvas dimensions.
- Build tool command: `npm run build:css` (`tailwindcss -i ./popup/input.css -o ./popup/popup.css --minify`) succeeds in 426ms.

---

## 2. Logic Chain

1. **Chromium Extension Popup Constraints vs Fluid Tab Mode**:
   - Chromium extension popups (opened via `chrome.action`) have hard upper bounds of 800px width and 600px height. Chromium sizes the popup bubble window strictly based on the dimensions of `<html>` and `<body>` in CSS/HTML.
   - If `body` has no explicit dimensions or uses only `100vw`/`100vh` without a fixed fallback, Chromium popup windows can collapse to minimum bounds (25x25) or intrinsic content dimensions, causing layout instability.
   - If `body` has fixed `width: 800px; height: 600px;` without `max-width: 100vw; max-height: 100vh;`, on displays with DPI scaling (e.g. 125% or 150% scaling on 1080p/768p displays where available height is < 600px), Chromium adds an outer scrollbar or clips the popup.
   - Therefore, the base style for standard popup mode must be:
     `width: 800px; height: 600px; max-width: 100vw; max-height: 100vh; overflow: hidden;`.
   - Conversely, when opened in a dedicated browser tab via `#btnPopout`, the page must expand to `width: 100vw; height: 100vh;` with full fluid scaling across mobile, tablet, desktop, and 4K viewports.

2. **Dual-Trigger Mode Architecture**:
   - To reliably distinguish Extension Popup mode from Popout Tab mode without timing glitches:
     * **Trigger A (URL Parameter)**: `#btnPopout` must navigate to `popup/popup.html?popout=true`.
     * **Trigger B (Media Queries & Window Dimension)**: CSS `@media (min-width: 801px), (min-height: 601px)` and JS detection check `window.innerWidth > 800 || window.innerHeight > 600`.
     * **Trigger C (Class Marker)**: An inline script in `<head>` of `popup.html` checks `location.search.includes('popout=true') || window.innerWidth > 800 || window.innerHeight > 600` before first paint, adding `popout-mode` to `document.documentElement`.
   - Result:
     * In extension popup: window is <= 800x600, no URL parameter -> renders in standard 800x600 extension bounds.
     * In dedicated tab: `popout-mode` class and `@media` apply immediately -> renders in 100% fluid full-window layout without any visual jump or clipping.

3. **Responsive Grid & Shell Decomposition**:
   - **Navigation (`<nav>`)**:
     * Mobile (< 768px): Bottom navigation bar (`order-last w-full h-14 flex-row justify-around border-t`). Brand logo hidden (`hidden md:flex`), buttons compact (`flex-col md:flex-row`).
     * Standard Popup & Desktop (>= 768px / `md:`): Vertical sidebar (`md:order-first md:w-[200px] md:h-full md:flex-col md:border-r md:py-6`). Standard 800x600 popup has 800px width (>= 768px), so the standard popup sidebar layout is 100% preserved.
   - **Video Streams Grid**:
     * Mobile (< 640px): `grid-cols-1` stacked feeds.
     * Standard Popup & Desktop (>= 640px / `sm:`): `sm:grid-cols-2` side-by-side feeds (`h-[200px] lg:h-[260px]`).
   - **Telemetry Metrics Grid**:
     * Mobile (< 640px): `grid-cols-2`.
     * Tablet (640px - 767px): `sm:grid-cols-4`.
     * Standard Popup & Desktop (>= 768px / `md:`): `md:grid-cols-7`. In standard 800px popup, 800 >= 768, so all 7 metrics remain on a single row as designed!
   - **Goal Input Row**:
     * `flex-col sm:flex-row gap-3 sm:gap-4 items-stretch sm:items-end`.
   - **Settings Connection Grid**:
     * `grid-cols-1 sm:grid-cols-2 gap-4`.

4. **Zero-Regression Assurance**:
   - All proposed class additions strictly preserve IDs, DOM hierarchies, element tag names, and existing class names required by tests (`flex`, `nav-btn`, `data-tab`, `tab-agent`, `stepCount`, `liveStream`, `annotatedStream`, etc.).
   - Rebuilding CSS via `npm run build:css` updates `popup/popup.css` cleanly.

---

## 3. Caveats

- **Chromium Native Popup Minimum**: Chromium enforces an unalterable minimum window limit of 25px x 25px and maximum limit of 800px x 600px for extension toolbar popups. Fluid scaling above 800x600 only occurs in the dedicated tab mode.
- **High-DPI Zoom Factors**: When Windows display scaling is set to 150% on a 1080p screen, Chromium reports a smaller CSS viewport height (~540px) to extension popups. The addition of `max-height: 100vh; overflow: hidden;` prevents Chromium from generating ugly window scrollbars, with the internal `<main>` container handling smooth vertical scrolling.
- **No caveats** regarding browser compatibility: Manifest V3 with ES modules and standard Tailwind CSS v3.4.19 supports all specified modern Chrome versions.

---

## 4. Conclusion & Concrete Implementation Plan for Worker M2

Worker M2 can implement Feature 5 and Feature 6 safely with the following exact changes:

### Task 1: Update `popup/input.css`
In `popup/input.css`, update the Base Body Styles and utility grid definitions:

```css
/* ==========================================================================
   Base Body & Viewport Styles
   ========================================================================== */
html, body {
    width: 800px;
    height: 600px;
    max-width: 100vw;
    max-height: 100vh;
    overflow: hidden;
    user-select: none;
    -webkit-font-smoothing: antialiased;
}

/* Fluid Popout Tab Mode */
html.popout-mode,
html.popout-mode body,
body.popout-mode {
    width: 100% !important;
    height: 100% !important;
    width: 100vw !important;
    height: 100vh !important;
    max-width: none !important;
    max-height: none !important;
}

@media (min-width: 801px), (min-height: 601px) {
    html, body {
        width: 100% !important;
        height: 100% !important;
        width: 100vw !important;
        height: 100vh !important;
        max-width: none !important;
        max-height: none !important;
    }
}
```

Ensure grid utility declarations in `input.css`:
```css
.grid-cols-1 { grid-template-columns: repeat(1, minmax(0, 1fr)); }
.grid-cols-2 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.grid-cols-4 { grid-template-columns: repeat(4, minmax(0, 1fr)); }
.grid-cols-6 { grid-template-columns: repeat(6, minmax(0, 1fr)); }
.grid-cols-7 { grid-template-columns: repeat(7, minmax(0, 1fr)); }
```

### Task 2: Update `popup/popup.html`
1. **Pre-paint Popout Detection Script** (inside `<head>`):
   ```html
   <script>
       if (window.location.search.includes('popout=true') || window.location.search.includes('mode=tab') || window.innerWidth > 800 || window.innerHeight > 600) {
           document.documentElement.classList.add('popout-mode');
       }
   </script>
   ```
2. **Remove Inline Sizing from `<body>`**:
   * Replace:
     ```html
     <body class="bg-background text-on-surface font-body-md flex overflow-hidden" style="width: 800px; height: 600px;">
     ```
   * With:
     ```html
     <body class="bg-background text-on-surface font-body-md flex flex-col md:flex-row overflow-hidden w-full h-screen md:w-[800px] md:h-[600px]">
     ```
3. **Responsive Navigation Bar**:
   * Replace:
     ```html
     <nav class="w-[200px] h-full bg-surface-container-low border-r border-outline-variant/10 shadow-sm flex flex-col py-6 shrink-0 z-20">
         <div class="px-6 mb-8 flex items-center gap-3">
     ```
   * With:
     ```html
     <nav class="order-last md:order-first w-full md:w-[200px] h-14 md:h-full bg-surface-container-low border-t md:border-t-0 md:border-r border-outline-variant/10 shadow-sm flex flex-row md:flex-col py-1 md:py-6 shrink-0 z-20">
         <div class="hidden md:flex px-6 mb-8 items-center gap-3">
     ```
   * Nav Items Wrapper:
     ```html
     <div class="flex-1 flex flex-row md:flex-col justify-around md:justify-start gap-1 md:gap-2 px-2 md:px-3">
     ```
   * Nav Buttons:
     ```html
     <button class="nav-btn active flex flex-col md:flex-row items-center justify-center md:justify-start gap-1 md:gap-3 px-2 md:px-4 py-1.5 md:py-3 rounded-lg text-on-surface-variant w-full text-center md:text-left" data-tab="agent" aria-label="Agent Dashboard">
     ```
4. **Header Bar**:
   * Change `px-8` to `px-4 md:px-8`, `h-16` to `h-14 md:h-16`.
   * Title: `text-[16px] md:text-headline-md font-bold text-on-surface truncate`.
5. **Goal Input Row**:
   * Replace `<div class="flex gap-4 items-end">` with `<div class="flex flex-col sm:flex-row gap-3 sm:gap-4 items-stretch sm:items-end">`.
   * Buttons wrapper: `<div class="flex gap-2 sm:gap-3 shrink-0">`.
6. **Dual Video Feeds Grid**:
   * Replace `<div class="grid gap-4 grid-cols-2">` with `<div class="grid gap-4 grid-cols-1 sm:grid-cols-2">`.
   * Feed cards: `<div class="neu-flat rounded-2xl p-4 flex flex-col h-[200px] lg:h-[260px]">`.
7. **Telemetry Metrics Grid**:
   * Replace `<div class="grid gap-2 grid-cols-7">` with `<div class="grid gap-2 grid-cols-2 sm:grid-cols-4 md:grid-cols-7">`.
8. **Execution Log Terminal**:
   * Replace `h-[180px]` with `h-[180px] md:h-[200px] lg:h-[240px] xl:h-[300px]`.
9. **Settings Tab Connection Grid**:
   * Replace `<div class="grid grid-cols-2 gap-4">` with `<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">`.
   * Server URL: `<div class="flex flex-col gap-2 col-span-1 sm:col-span-2">`.

### Task 3: Update `popup/popup.js`
1. **Mode Detection & Class Setting**:
   ```javascript
   const isPopoutMode = window.location.search.includes("popout=true") ||
                        window.location.search.includes("mode=tab") ||
                        window.innerWidth > 800 ||
                        window.innerHeight > 600;
   
   if (isPopoutMode) {
     document.documentElement.classList.add("popout-mode");
     document.body.classList.add("popout-mode");
   }
   ```
2. **Popout Button Event**:
   ```javascript
   if (btnPopout) {
     btnPopout.addEventListener("click", () => {
       chrome.tabs.create({ url: chrome.runtime.getURL("popup/popup.html?popout=true") });
     });
   }
   ```

### Task 4: Recompile CSS
Execute `npm run build:css` to compile `popup/input.css` into `popup/popup.css`.

---

## 5. Verification Method

Independent verification steps:

1. **CSS Build Verification**:
   ```powershell
   npm run build:css
   ```
   *Expected*: Exits with code 0 in < 1 second. `popup/popup.css` contains updated responsive utilities and popout-mode rules.

2. **Full Automated Test Suite**:
   ```powershell
   node --test tests/e2e/tier1_features.test.js tests/e2e/tier2_boundaries.test.js
   ```
   *Expected*: All 301 tests pass (0 failures). Specifically verifies F5.1 - F5.5, F6.1 - F6.5, F5.B1 - F5.B5, and F6.B1 - F6.B5.

3. **Chrome Extension Popup Bounds Verification**:
   * Run Playwright test or manual check: standard popup opens with body bounds constrained to <= 800x600 without root scrollbars.
   * Verify `#btnPopout` is visible at 800px width.

4. **Dedicated Tab Popout Fluid Scaling Verification**:
   * Open `chrome-extension://<ext-id>/popup/popup.html?popout=true` in a full browser tab.
   * Inspect body element: width and height are 100vw / 100vh (full fluid scaling).
   * Resize tab across viewports:
     - 375px (Mobile): Nav bar moves to bottom, video feeds stack vertically, telemetry grid wraps to 2 columns.
     - 768px (Tablet): Nav bar moves to left sidebar, video feeds side-by-side, telemetry in 4/7 columns.
     - 1920px (Desktop): Full width dashboard, spacious terminal log, feeds expand smoothly.
