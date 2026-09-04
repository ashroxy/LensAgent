/**
 * UI Test Harness for LensAgent popup using Playwright.
 * Loads popup/popup.html with a stubbed `chrome.*` API so the popup
 * can render without the real extension runtime.
 */
const { chromium } = require('playwright');

// ── Chrome API mock ──────────────────────────────────────────────────────────
function chromeMockScript(vaultData) {
  const vault = vaultData || {
    full_name: 'John Doe',
    email: 'john@example.com',
    phone: '+919876543210',
    city: 'Mumbai',
  };
  return `
    (function() {
      const VAULT = Object.assign({}, ${JSON.stringify(vault)});
      const listeners = new Set();
      const pendingResponses = {};
      let msgCounter = 0;

      const storage = {
        local: {
          get: (keys, cb) => {
            const out = {};
            if (typeof keys === 'string') {
              if (VAULT[keys] !== undefined) out[keys] = VAULT[keys];
            } else if (Array.isArray(keys)) {
              keys.forEach(k => { if (VAULT[k] !== undefined) out[k] = VAULT[k]; });
            } else if (typeof keys === 'object' && keys !== null) {
              Object.entries(keys).forEach(([k, def]) => { out[k] = VAULT[k] !== undefined ? VAULT[k] : def; });
            } else {
              Object.assign(out, VAULT);
            }
            cb(out);
          },
          set: (obj, cb) => { Object.assign(VAULT, obj); cb && cb(); },
          remove: (key, cb) => { if (typeof key === 'string') delete VAULT[key]; else key.forEach(k => delete VAULT[k]); cb && cb(); },
        },
        session: {
          get: (keys, cb) => { cb({}); },
          set: (obj, cb) => { cb && cb(); },
          remove: (k, cb) => { cb && cb(); },
          clear: () => {},
        },
      };

      window.__TEST_VAULT = VAULT;

      window.chrome = {
        runtime: {
          id: 'test-extension',
          getURL: (p) => 'chrome-extension://test/' + p,
          lastError: null,
          sendMessage: (msg, cb) => {
            // Simulate background responses
            let resp = { status: 'OK' };
            if (msg.type === 'POPUP_VAULT_GET') {
              resp = Object.assign({}, VAULT);
            } else if (msg.type === 'POPUP_VAULT_SET') {
              VAULT[msg.key] = msg.value;
            } else if (msg.type === 'POPUP_VAULT_DELETE') {
              delete VAULT[msg.key];
            } else if (msg.type === 'POPUP_VAULT_FLUSH') {
              Object.keys(VAULT).forEach(k => delete VAULT[k]);
            } else if (msg.type === 'POPUP_GET_HISTORY') {
              resp = [
                { goal: 'Task 1', state: 'FINISHED', steps: 3, durationMs: 5000, startedAt: Date.now() },
              ];
            } else if (msg.type === 'POPUP_GET_SETTINGS') {
              resp = {
                backendUrl: 'http://localhost:8000',
                maxSteps: 30,
                captureQuality: 75,
                serverTimeoutMs: 10000,
                stabilizeDelayMs: 250,
                humanizeInputs: true,
                enableDeltaFrames: true,
                enableAuditStream: true,
              };
            } else if (msg.type === 'POPUP_GET_STATUS') {
              resp = { state: 'IDLE' };
            }
            cb(resp);
          },
          onMessage: {
            addListener: (fn) => { listeners.add(fn); },
            removeListener: (fn) => { listeners.delete(fn); },
          },
          sendMessageAsync: () => {},
        },
        tabs: {
          query: (q, cb) => cb([{ id: 1, title: 'Test Tab', url: 'https://example.com', active: false }]),
          create: () => {},
          get: () => {},
        },
        storage: storage,
        action: { setBadgeText: () => {}, setBadgeBackgroundColor: () => {} },
        debugger: {
          attach: () => {},
          detach: () => {},
          sendCommand: () => {},
          onEvent: { addListener: () => {}, removeListener: () => {} },
          onDetach: { addListener: () => {}, removeListener: () => {} },
        },
        alarms: { create: () => {}, onAlarm: { addListener: () => {} } },
        commands: { onCommand: { addListener: () => {} } },
      };
    })();
  `;
}

async function run() {
  const browser = await chromium.launch({
    channel: 'chrome',
    // headless: false, // uncomment to watch
  });
  const page = await browser.newPage({ viewport: { width: 950, height: 700 } });

  // Load the popup file but stub chrome first
  await page.addInitScript(chromeMockScript({}));

  const errors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push('PAGEERROR: ' + err.message));

  // Serve via a local server or file URL. Use HTTP server.
  await page.goto('http://localhost:8123/popup/popup.html');

  await page.waitForTimeout(1500);

  console.log('CONSOLE ERRORS SO FAR:', errors.length ? errors : 'none');
  await page.screenshot({ path: 'E:/SIH-171/testing/loaded.png' });
  const hasNav = await page.$$('.nav-btn');
  console.log('NAV BTNS FOUND:', hasNav.length);
  const bodyText = await page.evaluate(() => document.querySelector('body').innerText.slice(0, 300));
  console.log('BODY TEXT:', JSON.stringify(bodyText));

  // Switch to vault tab
  await page.click('.nav-btn[data-tab="vault"]');
  await page.waitForTimeout(300);

  // Take a screenshot
  await page.screenshot({ path: 'E:/SIH-171/testing/vault-tab.png' });

  console.log('CONSOLE ERRORS:', errors.length ? errors : 'none');

  // Inspect vault section layout
  const info = await page.evaluate(() => {
    const vault = document.querySelector('#tab-vault');
    const fields = Array.from(document.querySelectorAll('#tab-vault .vault-field-row'));
    const rect = vault && vault.getBoundingClientRect();
    // Check if any field overflows viewport
    const overflows = fields.filter(f => {
      const r = f.getBoundingClientRect();
      return r.right > window.innerWidth || r.left < 0;
    }).length;
    const sections = Array.from(document.querySelectorAll('.tab-content')).map(c => ({
      id: c.id,
      active: c.classList.contains('active'),
      display: getComputedStyle(c).display,
    }));
    return {
      vaultVisible: vault ? vault.getBoundingClientRect() : null,
      fieldCount: fields.length,
      overflowFields: overflows,
      sections,
    };
  });
  console.log('VAULT INFO:', JSON.stringify(info, null, 2));

  // Test other tabs
  for (const tab of ['main', 'settings', 'history', 'vault']) {
    await page.click(`.nav-btn[data-tab="${tab}"]`);
    await page.waitForTimeout(200);
    await page.screenshot({ path: `E:/SIH-171/testing/tab-${tab}.png` });
  }

  await browser.close();
  console.log('DONE');
}

run().catch((e) => { console.error('FATAL:', e); process.exit(1); });
