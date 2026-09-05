import fs from 'node:fs';
import { JSDOM } from 'jsdom';

const html = fs.readFileSync('popup/popup.html', 'utf8');
const js = fs.readFileSync('popup/popup.js', 'utf8');

const dom = new JSDOM(html, {
  runScripts: "outside-only",
  url: "chrome-extension://test/popup/popup.html"
});

const { window } = dom;
const { document } = window;

// Provide mock chrome runtime
window.chrome = {
  runtime: {
    sendMessage: (msg, cb) => { if (cb) cb({}); },
    onMessage: { addListener: () => {} },
    getURL: (p) => `chrome-extension://test/${p}`
  },
  tabs: {
    query: async () => [],
    create: async () => {}
  },
  storage: {
    local: {
      get: async () => ({}),
      set: async () => {}
    }
  }
};

// Mock canvas getContext
window.HTMLCanvasElement.prototype.getContext = () => ({
  drawImage: () => {},
  clearRect: () => {},
  beginPath: () => {},
  stroke: () => {},
  fill: () => {},
  arc: () => {},
  moveTo: () => {},
  lineTo: () => {},
  strokeRect: () => {},
  fillRect: () => {},
  measureText: () => ({ width: 10 }),
  createLinearGradient: () => ({ addColorStop: () => {} })
});

// Execute switchTab logic directly extracted from popup.js
function switchTab(target) {
  const navBtns = document.querySelectorAll(".nav-btn");
  const tabPanes = document.querySelectorAll(".tab-content");
  const targetBtn = document.querySelector(`.nav-btn[data-tab="${target}"]`);
  const targetPane = document.getElementById(`tab-${target}`);

  if (!targetBtn || !targetPane) return;

  navBtns.forEach((btn) => {
    btn.classList.remove("active");
    btn.setAttribute("aria-selected", "false");
  });
  tabPanes.forEach((pane) => {
    pane.classList.remove("active");
    pane.setAttribute("aria-hidden", "true");
  });

  targetBtn.classList.add("active");
  targetBtn.setAttribute("aria-selected", "true");
  targetPane.classList.add("active");
  targetPane.removeAttribute("aria-hidden");

  const titles = { agent: "Agent Dashboard", settings: "System Settings", history: "Session History", vault: "Identity Vault" };
  const headerTitle = document.getElementById("headerTitle");
  if (headerTitle) headerTitle.textContent = titles[target] || "LensAgent";
}

console.log('=== Testing Tab Switching Behavior ===');

// Initial state
const defaultBtn = document.querySelector('.nav-btn.active');
const defaultPane = document.querySelector('.tab-content.active');
console.log('Default tab btn:', defaultBtn?.dataset.tab, 'Default tab pane:', defaultPane?.id);

// Switch to settings
switchTab('settings');
const settingsBtn = document.querySelector('.nav-btn[data-tab="settings"]');
const settingsPane = document.getElementById('tab-settings');
console.log('Settings btn active:', settingsBtn.classList.contains('active'), 'aria-selected:', settingsBtn.getAttribute('aria-selected'));
console.log('Settings pane active:', settingsPane.classList.contains('active'), 'aria-hidden:', settingsPane.getAttribute('aria-hidden'));
console.log('Agent pane active:', document.getElementById('tab-agent').classList.contains('active'), 'aria-hidden:', document.getElementById('tab-agent').getAttribute('aria-hidden'));
console.log('Header title:', document.getElementById('headerTitle').textContent);

// Switch to vault
switchTab('vault');
console.log('Vault btn aria-selected:', document.querySelector('.nav-btn[data-tab="vault"]').getAttribute('aria-selected'));
console.log('Header title:', document.getElementById('headerTitle').textContent);

// Test invalid tab
switchTab('non_existent');
console.log('After invalid tab, active count:', document.querySelectorAll('.nav-btn.active').length);
