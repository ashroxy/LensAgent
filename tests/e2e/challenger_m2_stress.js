/**
 * Challenger M2-1 Stress Test Suite
 * Comprehensive empirical stress testing for Milestone 2: Responsive Shell & A11y
 * 
 * Tests:
 * 1. Extreme Viewports (200px, 320px, 768px, 800x600, 1920x1080, 3840x2160)
 * 2. Focus Flows & Keyboard Navigation (WCAG 2.1 AA outlines, Tablist WAI-ARIA cycling, Modal focus)
 * 3. Rapid Tab Switching & Race Conditions
 * 4. Popout Mode Query Parameter Hardening & Edge Cases
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const PORT = 8899;
const BASE_URL = `http://127.0.0.1:${PORT}`;
const REPO_ROOT = path.resolve('.');

// Static file server
function createServer() {
  return http.createServer((req, res) => {
    const parsedUrl = new URL(req.url, BASE_URL);
    let pathname = parsedUrl.pathname;
    if (pathname === '/') pathname = '/popup/popup.html';
    
    let filePath = path.join(REPO_ROOT, pathname);
    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      filePath = path.join(REPO_ROOT, 'popup', pathname);
    }

    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      const ext = path.extname(filePath);
      const mimeTypes = {
        '.html': 'text/html; charset=utf-8',
        '.js': 'application/javascript; charset=utf-8',
        '.css': 'text/css; charset=utf-8',
        '.json': 'application/json; charset=utf-8',
        '.png': 'image/png',
        '.svg': 'image/svg+xml'
      };
      res.writeHead(200, {
        'Content-Type': mimeTypes[ext] || 'text/plain',
        'Access-Control-Allow-Origin': '*'
      });
      fs.createReadStream(filePath).pipe(res);
    } else {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end(`Not found: ${pathname}`);
    }
  });
}

// Helper to setup mock chrome extension environment in browser page
async function setupPage(page) {
  await page.addInitScript(() => {
    window.chrome = {
      runtime: {
        sendMessage: (msg, cb) => {
          let resp = { status: 'OK' };
          if (msg.type === 'POPUP_START_AGENT') resp = { status: 'STARTED', dpr: 1 };
          if (msg.type === 'POPUP_GET_STATUS') resp = { status: 'OK', state: 'IDLE' };
          if (msg.type === 'POPUP_GET_SETTINGS') resp = {
            backendUrl: 'http://127.0.0.1:8000',
            maxSteps: 25,
            captureQuality: 80,
            serverTimeoutMs: 15000,
            stabilizeDelayMs: 300,
            humanizeInputs: false,
            enableDeltaFrames: false,
            enableAuditStream: true
          };
          if (msg.type === 'POPUP_GET_HISTORY') resp = [];
          if (msg.type === 'POPUP_VAULT_GET') resp = {};
          if (cb) cb(resp);
          return Promise.resolve(resp);
        },
        getURL: (p) => `chrome-extension://lens-agent-id/${p}`,
        onMessage: {
          addListener: () => {},
          removeListener: () => {}
        }
      },
      tabs: {
        query: () => Promise.resolve([{ id: 101, url: 'https://example.com', title: 'Target Webpage' }]),
        create: (opts) => Promise.resolve({ id: 102, ...opts })
      },
      storage: {
        local: {
          get: (keys) => Promise.resolve({
            userSettings: {
              backendUrl: 'http://127.0.0.1:8000',
              maxSteps: 25,
              captureQuality: 80,
              serverTimeoutMs: 15000,
              stabilizeDelayMs: 300,
              humanizeInputs: false,
              enableDeltaFrames: false,
              enableAuditStream: true
            },
            sessionHistory: [],
            lensagent_vault: {}
          }),
          set: () => Promise.resolve()
        }
      }
    };
  });
}

async function runAllStressTests() {
  const results = {
    total: 0,
    passed: 0,
    failed: 0,
    findings: []
  };

  function record(testName, pass, details = '') {
    results.total++;
    if (pass) {
      results.passed++;
      console.log(`  ✔ [PASS] ${testName}`);
    } else {
      results.failed++;
      console.error(`  ✖ [FAIL] ${testName}: ${details}`);
      results.findings.push({ testName, details });
    }
  }

  const server = createServer();
  await new Promise((resolve) => server.listen(PORT, resolve));
  console.log(`Test server running on port ${PORT}`);

  const browser = await chromium.launch({ headless: true });

  try {
    // =========================================================================
    // CATEGORY 1: Extreme Viewport Dimensions
    // =========================================================================
    console.log('\n--- Category 1: Extreme Viewport Dimensions ---');

    // 1.1: 200px x 400px (Extreme Narrow Viewport)
    {
      const page = await browser.newPage();
      await setupPage(page);
      await page.setViewportSize({ width: 200, height: 400 });
      await page.goto(`${BASE_URL}/popup/popup.html`);
      await page.waitForLoadState('networkidle');

      const metrics = await page.evaluate(() => {
        const body = document.body;
        const nav = document.querySelector('nav');
        const navStyle = window.getComputedStyle(nav);
        const navButtons = Array.from(document.querySelectorAll('.nav-btn'));
        const goalInput = document.getElementById('goalInput');
        const startBtn = document.getElementById('startBtn');
        const stopBtn = document.getElementById('stopBtn');

        const bodyOverflowX = document.documentElement.scrollWidth > window.innerWidth;
        const navIsBottom = navStyle.order === '9999' || nav.classList.contains('order-last');
        const allNavVisible = navButtons.every(b => b.offsetWidth > 0 && b.offsetHeight > 0);

        const goalRect = goalInput.getBoundingClientRect();
        const startRect = startBtn.getBoundingClientRect();

        return {
          windowWidth: window.innerWidth,
          bodyScrollWidth: document.body.scrollWidth,
          docScrollWidth: document.documentElement.scrollWidth,
          bodyOverflowX,
          navIsBottom,
          allNavVisible,
          goalWidth: goalRect.width,
          startWidth: startRect.width
        };
      });

      record('1.1.1: Viewport 200px - Document has no horizontal scroll overflow', !metrics.bodyOverflowX, `docScrollWidth=${metrics.docScrollWidth}, innerWidth=${metrics.windowWidth}`);
      record('1.1.2: Viewport 200px - Nav positioned as mobile bottom bar (order-last)', metrics.navIsBottom);
      record('1.1.3: Viewport 200px - All 4 navigation tab buttons are rendered with positive dimensions', metrics.allNavVisible);
      record('1.1.4: Viewport 200px - Goal input and start button remain within viewport bounds', metrics.goalWidth > 50 && metrics.startWidth > 30, `goalWidth=${metrics.goalWidth}, startWidth=${metrics.startWidth}`);

      await page.close();
    }

    // 1.2: 320px x 568px (Standard Small Mobile - iPhone SE)
    {
      const page = await browser.newPage();
      await setupPage(page);
      await page.setViewportSize({ width: 320, height: 568 });
      await page.goto(`${BASE_URL}/popup/popup.html`);
      await page.waitForLoadState('networkidle');

      const metrics = await page.evaluate(() => {
        const bodyOverflowX = document.documentElement.scrollWidth > window.innerWidth;
        const videoGrid = document.querySelector('.grid.gap-4.grid-cols-1.sm\\:grid-cols-2');
        const videoGridCols = videoGrid ? window.getComputedStyle(videoGrid).gridTemplateColumns.split(' ').length : 0;
        const telemetryGrid = document.querySelector('#tab-agent .neu-flat.rounded-2xl.p-4 .grid');
        const telemetryCols = telemetryGrid ? window.getComputedStyle(telemetryGrid).gridTemplateColumns.split(' ').length : 0;

        return {
          bodyOverflowX,
          videoGridCols,
          telemetryCols
        };
      });

      record('1.2.1: Viewport 320px (iPhone SE) - Zero horizontal scroll overflow', !metrics.bodyOverflowX);
      record('1.2.2: Viewport 320px - Video grid collapses to single column', metrics.videoGridCols === 1, `columns=${metrics.videoGridCols}`);
      record('1.2.3: Viewport 320px - Telemetry grid wraps to 2 columns on mobile', metrics.telemetryCols === 2, `columns=${metrics.telemetryCols}`);

      // Test settings and vault tab layout at 320px
      await page.evaluate(() => window.switchTab('settings'));
      const settingsMetrics = await page.evaluate(() => {
        const serverUrlInput = document.getElementById('setting-serverUrl');
        const maxStepsInput = document.getElementById('setting-maxSteps');
        const serverRect = serverUrlInput.getBoundingClientRect();
        const maxStepsRect = maxStepsInput.getBoundingClientRect();
        return {
          serverFits: serverRect.right <= window.innerWidth,
          maxStepsFits: maxStepsRect.right <= window.innerWidth
        };
      });
      record('1.2.4: Viewport 320px - Settings form inputs fit within viewport', settingsMetrics.serverFits && settingsMetrics.maxStepsFits);

      await page.close();
    }

    // 1.3: 768px x 600px & 768px x 1024px (Tablet Boundary md: breakpoint)
    {
      const page = await browser.newPage();
      await setupPage(page);
      await page.setViewportSize({ width: 768, height: 600 });
      await page.goto(`${BASE_URL}/popup/popup.html`);
      await page.waitForLoadState('networkidle');

      const metrics = await page.evaluate(() => {
        const bodyStyle = window.getComputedStyle(document.body);
        const nav = document.querySelector('nav');
        const navStyle = window.getComputedStyle(nav);
        const bodyScrollWidth = document.body.scrollWidth;
        const docScrollWidth = document.documentElement.scrollWidth;
        const innerWidth = window.innerWidth;
        const isHorizontalScroll = docScrollWidth > innerWidth || bodyScrollWidth > innerWidth;

        return {
          bodyWidth: bodyStyle.width,
          bodyScrollWidth,
          docScrollWidth,
          innerWidth,
          isHorizontalScroll,
          navWidth: navStyle.width,
          navOrder: navStyle.order
        };
      });

      record('1.3.1: Viewport 768px (Tablet) - Sidebar navigation transforms to side nav (w: 200px, order: first)',
        metrics.navWidth === '200px' && (metrics.navOrder === '-1' || metrics.navOrder === '0' || metrics.navOrder === '1'),
        `navWidth=${metrics.navWidth}, navOrder=${metrics.navOrder}`);
      
      record('1.3.2: Viewport 768px - Body does not cause horizontal scrollbar or out-of-viewport clip',
        !metrics.isHorizontalScroll || document.documentElement.clientWidth >= 768,
        `docScrollWidth=${metrics.docScrollWidth}, innerWidth=${metrics.innerWidth}, bodyWidth=${metrics.bodyWidth}`);

      await page.close();
    }

    // 1.4: 800px x 600px (Standard Chrome Extension Popup Dimensions)
    {
      const page = await browser.newPage();
      await setupPage(page);
      await page.setViewportSize({ width: 800, height: 600 });
      await page.goto(`${BASE_URL}/popup/popup.html`);
      await page.waitForLoadState('networkidle');

      const metrics = await page.evaluate(() => {
        const isPopout = document.documentElement.classList.contains('popout-mode') || document.body.classList.contains('popout-mode');
        const bodyStyle = window.getComputedStyle(document.body);
        const btnPopout = document.getElementById('btnPopout');
        const btnPopoutDisplay = btnPopout ? window.getComputedStyle(btnPopout).display : 'none';

        return {
          isPopout,
          bodyWidth: bodyStyle.width,
          bodyHeight: bodyStyle.height,
          bodyOverflow: bodyStyle.overflow,
          btnPopoutVisible: btnPopoutDisplay !== 'none'
        };
      });

      record('1.4.1: Viewport 800x600 (Standard Popup) - Popout mode class is NOT added in standard popup', !metrics.isPopout);
      record('1.4.2: Viewport 800x600 - Body dimensions match standard popup spec (800px x 600px)',
        metrics.bodyWidth === '800px' && metrics.bodyHeight === '600px',
        `width=${metrics.bodyWidth}, height=${metrics.bodyHeight}`);
      record('1.4.3: Viewport 800x600 - Popout button is visible in header for expanding to tab', metrics.btnPopoutVisible);

      await page.close();
    }

    // 1.5: 1920px x 1080px (Full HD Desktop Tab Mode)
    {
      const page = await browser.newPage();
      await setupPage(page);
      await page.setViewportSize({ width: 1920, height: 1080 });
      await page.goto(`${BASE_URL}/popup/popup.html?popout=true`);
      await page.waitForLoadState('networkidle');

      const metrics = await page.evaluate(() => {
        const isPopout = document.documentElement.classList.contains('popout-mode') || document.body.classList.contains('popout-mode');
        const bodyStyle = window.getComputedStyle(document.body);
        const terminal = document.querySelector('#tab-agent .neu-flat.rounded-2xl.p-4.flex.flex-col:last-child');
        const terminalHeight = terminal ? window.getComputedStyle(terminal).height : '';

        return {
          isPopout,
          bodyWidth: bodyStyle.width,
          bodyHeight: bodyStyle.height,
          terminalHeight
        };
      });

      record('1.5.1: Viewport 1920x1080 (Desktop Tab) - Popout mode is active', metrics.isPopout);
      record('1.5.2: Viewport 1920x1080 - Body fills full viewport (1920px x 1080px)',
        metrics.bodyWidth === '1920px' && metrics.bodyHeight === '1080px',
        `width=${metrics.bodyWidth}, height=${metrics.bodyHeight}`);

      await page.close();
    }

    // 1.6: 3840px x 2160px (4K Ultra HD Display)
    {
      const page = await browser.newPage();
      await setupPage(page);
      await page.setViewportSize({ width: 3840, height: 2160 });
      await page.goto(`${BASE_URL}/popup/popup.html?popout=true`);
      await page.waitForLoadState('networkidle');

      const metrics = await page.evaluate(() => {
        const bodyStyle = window.getComputedStyle(document.body);
        const headerTitle = document.getElementById('headerTitle');
        const startBtn = document.getElementById('startBtn');
        const startBtnRect = startBtn.getBoundingClientRect();

        return {
          bodyWidth: bodyStyle.width,
          bodyHeight: bodyStyle.height,
          hasHeaderTitle: !!headerTitle && headerTitle.textContent.length > 0,
          startBtnVisible: startBtnRect.width > 0 && startBtnRect.height > 0
        };
      });

      record('1.6.1: Viewport 4K (3840x2160) - Body expands cleanly to full 4K dimensions',
        metrics.bodyWidth === '3840px' && metrics.bodyHeight === '2160px',
        `width=${metrics.bodyWidth}, height=${metrics.bodyHeight}`);
      record('1.6.2: Viewport 4K - Primary controls and typography render without failure',
        metrics.hasHeaderTitle && metrics.startBtnVisible);

      await page.close();
    }

    // =========================================================================
    // CATEGORY 2: Focus Flows & Keyboard Navigation
    // =========================================================================
    console.log('\n--- Category 2: Focus Flows & Keyboard Navigation ---');

    {
      const page = await browser.newPage();
      await setupPage(page);
      await page.setViewportSize({ width: 800, height: 600 });
      await page.goto(`${BASE_URL}/popup/popup.html`);
      await page.waitForLoadState('networkidle');

      // 2.1: WCAG 2.1 AA focus ring on nav buttons
      const navFocusMetrics = await page.evaluate(() => {
        const navBtn = document.getElementById('tab-btn-agent');
        navBtn.focus();
        const style = window.getComputedStyle(navBtn);
        return {
          outlineStyle: style.outlineStyle,
          outlineWidth: style.outlineWidth,
          outlineColor: style.outlineColor
        };
      });

      record('2.1.1: Nav tabs have visible high-contrast focus outline when focused',
        navFocusMetrics.outlineStyle === 'solid' && parseFloat(navFocusMetrics.outlineWidth) >= 2,
        `style=${navFocusMetrics.outlineStyle}, width=${navFocusMetrics.outlineWidth}, color=${navFocusMetrics.outlineColor}`);

      // 2.2: Focus outline on start button
      const startBtnFocus = await page.evaluate(() => {
        const btn = document.getElementById('startBtn');
        btn.focus();
        const style = window.getComputedStyle(btn);
        return {
          outlineStyle: style.outlineStyle,
          outlineWidth: style.outlineWidth
        };
      });

      record('2.2.1: Primary button (#startBtn) has 2px solid focus outline',
        startBtnFocus.outlineStyle === 'solid' && parseFloat(startBtnFocus.outlineWidth) >= 2,
        `style=${startBtnFocus.outlineStyle}, width=${startBtnFocus.outlineWidth}`);

      // 2.3: Goal input recessed container focus ring
      const goalFocusMetrics = await page.evaluate(() => {
        const goalInput = document.getElementById('goalInput');
        const container = goalInput.closest('.neu-recessed');
        goalInput.focus();
        const inputStyle = window.getComputedStyle(goalInput);
        const containerStyle = window.getComputedStyle(container);

        return {
          inputOutlineStyle: inputStyle.outlineStyle,
          containerOutlineStyle: containerStyle.outlineStyle,
          containerOutlineWidth: containerStyle.outlineWidth
        };
      });

      record('2.3.1: Goal input delegates single focus outline to surrounding recessed card',
        goalFocusMetrics.inputOutlineStyle === 'none' && goalFocusMetrics.containerOutlineStyle === 'solid',
        `inputOutline=${goalFocusMetrics.inputOutlineStyle}, containerOutline=${goalFocusMetrics.containerOutlineStyle}`);

      // 2.4: Settings toggle focus indicator
      await page.evaluate(() => window.switchTab('settings'));
      const toggleFocus = await page.evaluate(() => {
        const checkbox = document.getElementById('setting-jitter');
        const pillBg = checkbox.nextElementSibling;
        checkbox.focus();
        const bgStyle = window.getComputedStyle(pillBg);
        return {
          bgOutlineStyle: bgStyle.outlineStyle,
          bgOutlineWidth: bgStyle.outlineWidth
        };
      });

      record('2.4.1: Custom toggle switch displays outline on visible pill when focused',
        toggleFocus.bgOutlineStyle === 'solid' && parseFloat(toggleFocus.bgOutlineWidth) >= 2,
        `pillOutline=${toggleFocus.bgOutlineStyle}, width=${toggleFocus.bgOutlineWidth}`);

      // 2.5: WAI-ARIA Tablist Arrow Key Cycling (ArrowRight, ArrowLeft, ArrowDown, ArrowUp, Home, End)
      await page.evaluate(() => window.switchTab('agent'));
      await page.focus('#tab-btn-agent');

      await page.keyboard.press('ArrowRight');
      const tabAfterRight = await page.evaluate(() => {
        const activeTab = document.querySelector('.nav-btn.active');
        const activePane = document.querySelector('.tab-content.active');
        return {
          activeTabId: activeTab ? activeTab.id : null,
          activePaneId: activePane ? activePane.id : null,
          focusedId: document.activeElement ? document.activeElement.id : null
        };
      });
      record('2.5.1: Tablist ArrowRight activates next tab (Settings)',
        tabAfterRight.activeTabId === 'tab-btn-settings' && tabAfterRight.activePaneId === 'tab-settings' && tabAfterRight.focusedId === 'tab-btn-settings',
        `activeTab=${tabAfterRight.activeTabId}, activePane=${tabAfterRight.activePaneId}, focused=${tabAfterRight.focusedId}`);

      await page.keyboard.press('ArrowDown');
      const tabAfterDown = await page.evaluate(() => {
        const activeTab = document.querySelector('.nav-btn.active');
        return activeTab ? activeTab.id : null;
      });
      record('2.5.2: Tablist ArrowDown activates next tab (History)', tabAfterDown === 'tab-btn-history');

      await page.keyboard.press('End');
      const tabAfterEnd = await page.evaluate(() => {
        const activeTab = document.querySelector('.nav-btn.active');
        return activeTab ? activeTab.id : null;
      });
      record('2.5.3: Tablist End key activates final tab (Vault)', tabAfterEnd === 'tab-btn-vault');

      await page.keyboard.press('ArrowRight');
      const tabAfterWrap = await page.evaluate(() => {
        const activeTab = document.querySelector('.nav-btn.active');
        return activeTab ? activeTab.id : null;
      });
      record('2.5.4: Tablist ArrowRight wraps around from last tab to first tab (Agent)', tabAfterWrap === 'tab-btn-agent');

      await page.keyboard.press('Home');
      const tabAfterHome = await page.evaluate(() => {
        const activeTab = document.querySelector('.nav-btn.active');
        return activeTab ? activeTab.id : null;
      });
      record('2.5.5: Tablist Home key returns to first tab (Agent)', tabAfterHome === 'tab-btn-agent');

      await page.keyboard.press('ArrowLeft');
      const tabAfterLeftWrap = await page.evaluate(() => {
        const activeTab = document.querySelector('.nav-btn.active');
        return activeTab ? activeTab.id : null;
      });
      record('2.5.6: Tablist ArrowLeft wraps around backwards to last tab (Vault)', tabAfterLeftWrap === 'tab-btn-vault');

      // 2.6: Modal Focus & Escape handling
      const modalEscape = await page.evaluate(() => {
        const videoModal = document.getElementById('videoModal');
        videoModal.removeAttribute('hidden');
        const isShownBefore = !videoModal.hasAttribute('hidden');

        // Fire Escape key event
        const escapeEvent = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true });
        window.dispatchEvent(escapeEvent);

        const isHiddenAfter = videoModal.hasAttribute('hidden');
        return { isShownBefore, isHiddenAfter };
      });
      record('2.6.1: Fullscreen video modal closes on Escape key press', modalEscape.isShownBefore && modalEscape.isHiddenAfter);

      await page.close();
    }

    // =========================================================================
    // CATEGORY 3: Rapid Tab Switching & Race Conditions
    // =========================================================================
    console.log('\n--- Category 3: Rapid Tab Switching & Race Conditions ---');

    {
      const page = await browser.newPage();
      await setupPage(page);
      await page.setViewportSize({ width: 800, height: 600 });
      await page.goto(`${BASE_URL}/popup/popup.html`);
      await page.waitForLoadState('networkidle');

      // Execute 100 rapid tab switches alternating between all 4 tabs
      const stressResult = await page.evaluate(async () => {
        const tabs = ['agent', 'settings', 'history', 'vault'];
        const errors = [];

        for (let i = 0; i < 100; i++) {
          const target = tabs[i % tabs.length];
          try {
            window.switchTab(target);
          } catch (err) {
            errors.push({ step: i, target, err: err.message });
          }
        }

        // Validate final DOM consistency
        const activeNavBtns = document.querySelectorAll('.nav-btn.active');
        const selectedNavBtns = document.querySelectorAll('.nav-btn[aria-selected="true"]');
        const activePanes = document.querySelectorAll('.tab-content.active');
        const unhiddenPanes = Array.from(document.querySelectorAll('.tab-content')).filter(p => !p.hasAttribute('aria-hidden'));
        const headerTitle = document.getElementById('headerTitle').textContent;

        return {
          errors,
          activeNavCount: activeNavBtns.length,
          selectedNavCount: selectedNavBtns.length,
          activePaneCount: activePanes.length,
          unhiddenPaneCount: unhiddenPanes.length,
          finalActiveTab: activeNavBtns[0] ? activeNavBtns[0].dataset.tab : null,
          headerTitle
        };
      });

      record('3.1.1: 100 rapid sequential tab switches complete with 0 JS exceptions', stressResult.errors.length === 0, JSON.stringify(stressResult.errors));
      record('3.1.2: Exactly 1 nav button has .active class', stressResult.activeNavCount === 1, `count=${stressResult.activeNavCount}`);
      record('3.1.3: Exactly 1 nav button has aria-selected="true"', stressResult.selectedNavCount === 1, `count=${stressResult.selectedNavCount}`);
      record('3.1.4: Exactly 1 tab panel has .active class', stressResult.activePaneCount === 1, `count=${stressResult.activePaneCount}`);
      record('3.1.5: Exactly 1 tab panel has aria-hidden removed', stressResult.unhiddenPaneCount === 1, `count=${stressResult.unhiddenPaneCount}`);
      record('3.1.6: Header title matches final active tab',
        (stressResult.finalActiveTab === 'vault' && stressResult.headerTitle === 'Identity Vault') ||
        (stressResult.finalActiveTab === 'agent' && stressResult.headerTitle === 'Agent Dashboard'),
        `tab=${stressResult.finalActiveTab}, title=${stressResult.headerTitle}`);

      // Rapid concurrent click event firing
      const concurrentClickResult = await page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll('.nav-btn'));
        // Fire clicks simultaneously
        btns.forEach(b => b.click());
        btns.reverse().forEach(b => b.click());

        const activePanes = document.querySelectorAll('.tab-content.active');
        const activeBtns = document.querySelectorAll('.nav-btn.active');
        return {
          activePanes: activePanes.length,
          activeBtns: activeBtns.length
        };
      });
      record('3.2.1: Concurrent asynchronous click firing maintains single active tab state',
        concurrentClickResult.activePanes === 1 && concurrentClickResult.activeBtns === 1,
        `activePanes=${concurrentClickResult.activePanes}, activeBtns=${concurrentClickResult.activeBtns}`);

      await page.close();
    }

    // =========================================================================
    // CATEGORY 4: Broken & Adversarial Query Params in Popout Mode
    // =========================================================================
    console.log('\n--- Category 4: Broken & Adversarial Query Params in Popout Mode ---');

    const queryScenarios = [
      { query: '?popout=true', expectPopout: true, desc: 'Standard popout=true' },
      { query: '?mode=tab', expectPopout: true, desc: 'Standard mode=tab' },
      { query: '?popout=false', expectPopout: false, desc: 'popout=false should NOT enable popout' },
      { query: '?popout=0', expectPopout: false, desc: 'popout=0 should NOT enable popout' },
      { query: '?popout=null', expectPopout: false, desc: 'popout=null should NOT enable popout' },
      { query: '?popout=', expectPopout: false, desc: 'popout= (empty) should NOT enable popout' },
      { query: '?mode=unknown', expectPopout: false, desc: 'mode=unknown should NOT enable popout' },
      { query: '?not_popout=true', expectPopout: false, desc: 'not_popout=true should NOT enable popout (substring vulnerability check)' },
      { query: '?popout=true&evil=<script>alert(1)</script>', expectPopout: true, desc: 'XSS attempt query param does not crash parser' },
      { query: '?foo=bar&popout=true&baz=qux', expectPopout: true, desc: 'popout=true combined with arbitrary parameters' }
    ];

    for (let i = 0; i < queryScenarios.length; i++) {
      const { query, expectPopout, desc } = queryScenarios[i];
      const page = await browser.newPage();
      await setupPage(page);
      await page.setViewportSize({ width: 800, height: 600 });
      
      let pageError = null;
      page.on('pageerror', err => { pageError = err.message; });

      await page.goto(`${BASE_URL}/popup/popup.html${query}`);
      await page.waitForLoadState('networkidle');

      const isPopoutActive = await page.evaluate(() => {
        return document.documentElement.classList.contains('popout-mode') || document.body.classList.contains('popout-mode');
      });

      record(`4.${i + 1}: Popout Query Stress [${desc}]`,
        pageError === null && isPopoutActive === expectPopout,
        `expected=${expectPopout}, actual=${isPopoutActive}, pageError=${pageError}`);

      await page.close();
    }

  } finally {
    await browser.close();
    server.close();
  }

  console.log('\n======================================================');
  console.log(`STRESS TEST SUMMARY: ${results.passed}/${results.total} PASSED (${results.failed} FAILED)`);
  console.log('======================================================\n');

  if (results.failed > 0) {
    console.log('VULNERABILITIES / FAILURES DETECTED:');
    results.findings.forEach(f => console.log(`- ${f.testName}: ${f.details}`));
  }

  return results;
}

runAllStressTests().catch(err => {
  console.error('Fatal stress harness crash:', err);
  process.exit(1);
});
