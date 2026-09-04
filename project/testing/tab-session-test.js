/**
 * Deeply test: (a) vault data persistence across tab switches,
 * (b) session history persistence, (c) clear-history, (d) modal overlay visibility.
 */
const { chromium } = require('playwright');

async function run() {
  const browser = await chromium.launch({ channel: 'chrome' });
  const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

  await page.addInitScript(chromeMock);
  await page.goto('http://localhost:8123/popup/popup.html');
  await page.waitForTimeout(1500);

  // 1. Vault tab: load seeded values
  await page.click('.nav-btn[data-tab="vault"]');
  await page.waitForTimeout(300);
  let seeded = await page.evaluate(() => ({
    full_name: document.getElementById('vault_full_name').value,
    phone: document.getElementById('vault_phone').value,
    count: document.getElementById('vaultFilledCount').textContent,
  }));
  console.log('SEEDED VAULT:', JSON.stringify(seeded));

  // 2. Edit fields and save
  await page.fill('#vault_full_name', 'Changed Name');
  await page.fill('#vault_phone', '2222222222');
  await page.click('#saveVaultBtn');
  await page.waitForTimeout(300);

  // 3. Leave and return to vault — persistence check
  await page.click('.nav-btn[data-tab="settings"]');
  await page.waitForTimeout(250);
  await page.click('.nav-btn[data-tab="vault"]');
  await page.waitForTimeout(300);
  let persisted = await page.evaluate(() => ({
    full_name: document.getElementById('vault_full_name').value,
    phone: document.getElementById('vault_phone').value,
    count: document.getElementById('vaultFilledCount').textContent,
  }));
  console.log('PERSISTED AFTER TAB SWITCH:', JSON.stringify(persisted));

  // 4. Clear a field (gender select) => change to empty, save, verify removed
  await page.fill('#vault_phone', '');
  await page.click('#saveVaultBtn');
  await page.waitForTimeout(300);

  // 5. History tab
  await page.click('.nav-btn[data-tab="history"]');
  await page.waitForTimeout(300);
  let historyCards = await page.evaluate(() => document.querySelectorAll('#tab-history .history-card').length);
  console.log('HISTORY CARDS INITIAL:', historyCards);

  // 6. Clear history
  await page.click('#clearHistoryBtn');
  await page.waitForTimeout(400);
  await page.click('.nav-btn[data-tab="history"]');
  await page.waitForTimeout(300);
  let historyAfterClear = await page.evaluate(() => document.querySelectorAll('#tab-history .history-card').length);
  console.log('HISTORY CARDS AFTER CLEAR:', historyAfterClear);

  // 7. Modal overlays
  await page.click('.nav-btn[data-tab="main"]');
  await page.waitForTimeout(200);
  await page.click('.expand-btn[data-target="raw"]');
  await page.waitForTimeout(250);
  const videoModalVisible = await page.isVisible('#videoModal');
  console.log('VIDEO MODAL VISIBLE:', videoModalVisible);
  await page.click('#modalClose');
  await page.waitForTimeout(150);
  const vm2 = await page.isVisible('#videoModal');
  console.log('VIDEO MODAL HIDDEN AFTER CLOSE:', !vm2);

  console.log('HITL INITIAL (should be hidden):', await page.isVisible('#hitlOverlay'));
  console.log('APPROVAL INITIAL (should be hidden):', await page.isVisible('#approvalOverlay'));

  await browser.close();
  console.log('ERRORS:', JSON.stringify(errors, null, 2));
}

// chrome mock defined as a serializable function injected into page.
function chromeMock() {
  (function () {
    const VAULT = { full_name: 'Original Name', phone: '1111111111', city: 'Mumbai' };
    let HISTORY = [ { goal: 'First Task', state: 'FINISHED', startedAt: Date.now() - 600000 } ];
    window.chrome = {
      runtime: {
        id: 'test',
        getURL: function (p) { return 'chrome-extension://test/' + p; },
        lastError: null,
        sendMessage: function (msg, cb) {
          let resp = { status: 'OK' };
          if (msg.type === 'POPUP_VAULT_GET') resp = Object.assign({}, VAULT);
          else if (msg.type === 'POPUP_VAULT_SET') VAULT[msg.key] = msg.value;
          else if (msg.type === 'POPUP_VAULT_DELETE') delete VAULT[msg.key];
          else if (msg.type === 'POPUP_VAULT_FLUSH') Object.keys(VAULT).forEach(function (k) { delete VAULT[k]; });
          else if (msg.type === 'POPUP_GET_HISTORY') resp = JSON.parse(JSON.stringify(HISTORY));
          else if (msg.type === 'POPUP_CLEAR_HISTORY') HISTORY = [];
          else if (msg.type === 'POPUP_GET_SETTINGS') resp = {
            backendUrl: 'http://localhost:8000', maxSteps: 30, captureQuality: 75,
            serverTimeoutMs: 10000, stabilizeDelayMs: 250, humanizeInputs: true,
            enableDeltaFrames: true, enableAuditStream: true,
          };
          else if (msg.type === 'POPUP_GET_STATUS') resp = { state: 'IDLE' };
          if (typeof cb === 'function') cb(resp);
        },
        onMessage: { addListener: function () {}, removeListener: function () {} },
      },
      tabs: {
        query: function (q, cb) { cb([{ id: 1, title: 'Test', url: 'https://example.com', active: false }]); },
        create: function () {},
        get: function (id, cb) { cb({ id: id, url: 'https://example.com' }); },
      },
      storage: {
        local: {
          get: function (keys, cb) {
            var out = {};
            if (typeof keys === 'string') { if (VAULT[keys] !== undefined) out[keys] = VAULT[keys]; }
            else if (Object.prototype.toString.call(keys) === '[object Array]') { keys.forEach(function (k) { if (VAULT[k] !== undefined) out[k] = VAULT[k]; }); }
            else if (keys && typeof keys === 'object') { Object.keys(keys).forEach(function (k) { out[k] = VAULT[k] !== undefined ? VAULT[k] : keys[k]; }); }
            else { Object.assign(out, VAULT); }
            cb(out);
          },
          set: function (o, cb) { Object.assign(VAULT, o); if (cb) cb(); },
          remove: function (k, cb) { if (typeof k === 'string') delete VAULT[k]; else k.forEach(function (x) { delete VAULT[x]; }); if (cb) cb(); },
        },
      },
      action: { setBadgeText: function () {}, setBadgeBackgroundColor: function () {} },
      debugger: {
        attach: function () {}, detach: function () {}, sendCommand: function () {},
        onEvent: { addListener: function () {}, removeListener: function () {} },
        onDetach: { addListener: function () {}, removeListener: function () {} },
      },
      alarms: { create: function () {}, onAlarm: { addListener: function () {} } },
    };
  })();
}

run().catch(function (e) { console.error('FATAL:', e); process.exit(1); });
