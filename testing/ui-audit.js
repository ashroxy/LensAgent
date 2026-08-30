/**
 * Deep UI geometry audit for LensAgent popup.
 * Detects: overflowing content, clipped elements, overlapping elements,
 * zero-size/blank sections, misaligned grids, hidden-but-should-show elements,
 * and console errors. Dumps a structured report per tab.
 */
const { chromium } = require('playwright');

function chromeMockScript(vaultData) {
  const vault = vaultData || {
    full_name: 'John Doe',
    email: 'john@example.com',
    phone: '+919876543210',
    address: '123 Main St',
    city: 'Mumbai',
    state: 'Maharashtra',
    pincode: '400001',
    dob: '1990-01-01',
    gender: 'Male',
  };
  return `
    (function() {
      const VAULT = Object.assign({}, ${JSON.stringify(vault)});
      const listeners = new Set();
      window.__TEST_VAULT = VAULT;
      window._testMsgs = [];
      window.chrome = {
        runtime: {
          id: 'test-extension',
          getURL: (p) => 'chrome-extension://test/' + p,
          lastError: null,
          sendMessage: (msg, cb) => {
            window._testMsgs.push(msg.type);
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
                { goal: 'Search train tickets to Mumbai on IRCTC', state: 'FINISHED', steps: 4, durationMs: 12345, startedAt: Date.now() - 600000 },
                { goal: 'Fill a login form using vault', state: 'STOPPED', steps: 2, durationMs: 4000, startedAt: Date.now() - 3600000 },
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
            } else if (msg.type === 'POPUP_EXPORT_LOG') {
              resp = { text: 'sample log' };
            } else if (msg.type === 'POPUP_CLEAR_HISTORY') {
              // handled
            }
            if (typeof cb === 'function') cb(resp); else cb;
          },
          onMessage: {
            addListener: (fn) => { listeners.add(fn); },
            removeListener: (fn) => { listeners.delete(fn); },
          },
        },
        tabs: {
          query: (q, cb) => cb([{ id: 1, title: 'Test Tab', url: 'https://example.com', active: false }]),
          create: () => {},
          get: (id, cb) => cb({ id, url: 'https://example.com' }),
          getCurrent: () => new Promise(()=>{}),
        },
        storage: {
          local: {
            get: (keys, cb) => {
              const out = {};
              if (typeof keys === 'string') { if (VAULT[keys]!==undefined) out[keys]=VAULT[keys]; }
              else if (Array.isArray(keys)) keys.forEach(k=>{if(VAULT[k]!==undefined) out[k]=VAULT[k];});
              else if (keys && typeof keys==='object') Object.entries(keys).forEach(([k,d])=>{out[k]=VAULT[k]!==undefined?VAULT[k]:d;});
              else Object.assign(out, VAULT);
              cb(out);
            },
            set: (o,cb)=>{Object.assign(VAULT,o);cb&&cb();},
            remove: (k,cb)=>{if(typeof k==='string') delete VAULT[k]; else k.forEach(x=>delete VAULT[x]);cb&&cb();},
          },
          session: {
            get: (k,cb)=>cb({}), set:(o,cb)=>cb&&cb(), remove:(k,cb)=>cb&&cb(), clear:()=>{},
          },
        },
        action: { setBadgeText:()=>{}, setBadgeBackgroundColor:()=>{} },
        debugger: {
          attach:()=>{}, detach:()=>{}, sendCommand:()=>{},
          onEvent:{addListener:()=>{},removeListener:()=>{}},
          onDetach:{addListener:()=>{},removeListener:()=>{}},
        },
        alarms:{create:()=>{},onAlarm:{addListener:()=>{}}},
      };
    })();
  `;
}

async function auditTab(page, tabName) {
  await page.click(`.nav-btn[data-tab="${tabName}"]`);
  await page.waitForTimeout(250);
  return page.evaluate((name) => {
    const win = window.innerWidth, winH = window.innerHeight;
    const sec = document.getElementById('tab-' + name);
    const secRect = sec.getBoundingClientRect();
    const report = { tab: name, window: [win, winH], sectionRect: [secRect.x, secRect.y, secRect.width, secRect.height], issues: [] };

    const visibleEls = Array.from(document.querySelectorAll('#tab-' + name + ' *, #tab-' + name))
      .filter(el => {
        const s = getComputedStyle(el);
        const r = el.getBoundingClientRect();
        return s.display !== 'none' && s.visibility !== 'hidden' && el.offsetParent !== null && r.width > 0 && r.height > 0;
      });

    // 1. Content overflow beyond viewport width
    visibleEls.forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.right > win + 1 || r.left < -1) {
        report.issues.push({ type: 'H-OVERFLOW', el: el.tagName + '.' + (el.className && el.className.baseVal!==undefined?el.className.baseVal:el.className), left: Math.round(r.left), right: Math.round(r.right), win });
      }
      if (r.bottom > winH + 1) {
        // vertical overflow is allowed if container scrolls, note it
        report.issues.push({ type: 'V-OVERFLOW', el: el.tagName + '.' + (el.className && el.className.baseVal!==undefined?el.className.baseVal:el.className), bottom: Math.round(r.bottom), winH });
      }
    });

    // 2. Section itself
    if (secRect.width === 0 || secRect.height === 0) {
      report.issues.push({ type: 'ZERO-SIZE-SECTION' });
    }

    // 3. Zero-size visible inputs/buttons that should be usable
    visibleEls.filter(el => /^(input|button|select|textarea|a)$/i.test(el.tagName)).forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.width < 10 || r.height < 10) {
        report.issues.push({ type: 'TINY-CONTROL', el: el.tagName + '#' + el.id, w: Math.round(r.width), h: Math.round(r.height) });
      }
    });

    // 4. Overlapping sibling elements (same tab)
    const interactive = visibleEls.filter(el => /^(button|input|select|textarea)$/i.test(el.tagName));
    for (let i=0;i<interactive.length;i++){
      for (let j=i+1;j<interactive.length;j++){
        const a = interactive[i].getBoundingClientRect();
        const b = interactive[j].getBoundingClientRect();
        if (a.width===0||a.height===0||b.width===0||b.height===0) continue;
        const ox = Math.min(a.right,b.right) - Math.max(a.left,b.left);
        const oy = Math.min(a.bottom,b.bottom) - Math.max(a.top,b.top);
        if (ox > 2 && oy > 2) {
          report.issues.push({ type:'OVERLAP', a: interactive[i].id||interactive[i].tagName, b: interactive[j].id||interactive[j].tagName, ox:Math.round(ox), oy:Math.round(oy) });
        }
      }
    }

    // 5. Text clipping inside cards (scrollWidth > clientWidth on fixed-width text)
    visibleEls.filter(el => el.childElementCount===0 && (el.scrollWidth > el.clientWidth + 1) && el.clientWidth > 20).forEach(el=>{
      report.issues.push({ type:'TEXT-CLIP', el: el.tagName+'.'+(el.className||''), scroll: el.scrollWidth, client: el.clientWidth, text: (el.textContent||'').slice(0,30) });
    });

    return report;
  }, tabName);
}

async function run() {
  const browser = await chromium.launch({ channel: 'chrome' });
  const page = await browser.newPage({ viewport: { width: 950, height: 720 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

  await page.addInitScript(chromeMockScript({}));
  await page.goto('http://localhost:8123/popup/popup.html');
  await page.waitForTimeout(1200);

  // Use a larger viewport for pop-out mode-like testing
  const reports = [];
  for (const tab of ['main', 'settings', 'history', 'vault']) {
    reports.push(await auditTab(page, tab));
  }

  // Also test popup-sized viewport (800x600) for the same tabs
  await page.setViewportSize({ width: 800, height: 600 });
  await page.waitForTimeout(200);
  const reportsSmall = [];
  for (const tab of ['main', 'settings', 'history', 'vault']) {
    reportsSmall.push(await auditTab(page, tab));
  }

  console.log(JSON.stringify({ errors, reports, reportsSmall }, null, 2));
  await browser.close();
}

run().catch((e) => { console.error('FATAL:', e); process.exit(1); });
