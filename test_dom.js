const fs = require('fs');
const jsdom = require('jsdom');
const { JSDOM } = jsdom;

const html = fs.readFileSync('popup/popup.html', 'utf8');
let js = fs.readFileSync('popup/popup.js', 'utf8');

const mocks = 'const POPUP_START_AGENT = 1, POPUP_STOP_AGENT = 2, POPUP_GET_STATUS = 3, POPUP_GET_SETTINGS = 4, POPUP_UPDATE_SETTINGS = 5, POPUP_GET_HISTORY = 6, POPUP_EXPORT_LOG = 7, POPUP_HITL_RESPONSE = 8, POPUP_APPROVAL_RESPONSE = 9, POPUP_VAULT_GET = 10, POPUP_VAULT_SET = 11, POPUP_VAULT_DELETE = 12, POPUP_VAULT_FLUSH = 13, POPUP_CLEAR_HISTORY = 14, BG_AGENT_STATUS = 15, BG_SETTINGS_UPDATED = 16, BG_HITL_PROMPT = 17, BG_APPROVAL_PROMPT = 18, BG_VAULT_DATA = 19, AUDIT_FRAME_UPDATE = 20, AUDIT_ACTION_LOG = 21, AgentState = { IDLE: "IDLE", RUNNING: "RUNNING", WAITING_FOR_USER: "WAITING_FOR_USER", WAITING_FOR_APPROVAL: "WAITING_FOR_APPROVAL", ERROR: "ERROR" }, DEFAULT_SETTINGS = {};';

js = js.replace(/import\s+\{[\s\S]*?\}\s+from\s+['"].*?['"];/g, mocks);

const dom = new JSDOM(html, { runScripts: 'dangerously' });
dom.window.chrome = {
  runtime: {
    sendMessage: (msg, cb) => {
      console.log('Sending message:', msg);
      if (cb) setTimeout(() => cb({}), 10);
    },
    onMessage: { addListener: () => {} },
    lastError: null
  },
  tabs: { query: () => Promise.resolve([]) }
};
dom.window.fetch = () => Promise.resolve({ json: () => Promise.resolve({}) });
dom.window.matchMedia = () => ({ matches: false });

const scriptEl = dom.window.document.createElement('script');
scriptEl.textContent = js;

dom.window.addEventListener('error', (e) => {
  console.log('JSDOM Unhandled Error:', e.error || e.message);
});

try {
  dom.window.document.body.appendChild(scriptEl);
  console.log('Script evaluated without synchronous errors');
  
  setTimeout(() => {
    const vaultForm = dom.window.document.getElementById('vaultForm');
    console.log('Vault form children count initially:', vaultForm ? vaultForm.children.length : 'null');
    
    // Simulate clicking Vault tab to trigger loadVaultUI
    const vaultTab = dom.window.document.querySelector('[data-tab="vault"]');
    if (vaultTab) vaultTab.click();
    
    setTimeout(() => {
      console.log('Vault form children count after click:', vaultForm ? vaultForm.children.length : 'null');
      const settingsUrl = dom.window.document.getElementById('setting-serverUrl');
      console.log('Settings URL value:', settingsUrl ? settingsUrl.value : 'null');
    }, 500);

  }, 500);

} catch (e) {
  console.log('Error appending script:', e);
}
