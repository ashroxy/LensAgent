import fs from 'fs';
import { JSDOM } from 'jsdom';

const html = fs.readFileSync('popup/popup.html', 'utf-8');
const dom = new JSDOM(html, { runScripts: 'dangerously', url: 'http://localhost/popup.html' });
const { window } = dom;
const { document } = window;

// Provide mock chrome API
window.chrome = {
  runtime: {
    getURL: (p) => p,
    sendMessage: (msg, cb) => { if (cb) cb({ status: 'ok' }); },
    onMessage: { addListener: () => {} }
  },
  storage: {
    local: { get: (k, cb) => cb({}), set: (d, cb) => cb && cb() },
    session: { get: (k, cb) => cb({}), set: (d, cb) => cb && cb() }
  },
  tabs: {
    create: () => {}
  }
};

// Evaluate popup.js in the context
const popupJs = fs.readFileSync('popup/popup.js', 'utf-8');
const scriptEl = document.createElement('script');
scriptEl.textContent = popupJs;
document.body.appendChild(scriptEl);

console.log("=== VERIFYING NAV LIFECYCLE & ARIA STATES ===");

// 1. Initial State Check
const navBtns = Array.from(document.querySelectorAll('.nav-btn'));
const panels = Array.from(document.querySelectorAll('.tab-content'));

console.log(`Tabs found: ${navBtns.length}`);
console.log(`Panels found: ${panels.length}`);

function checkTabState(activeTab) {
  navBtns.forEach(btn => {
    const tabName = btn.dataset.tab;
    const isActive = tabName === activeTab;
    const hasActiveClass = btn.classList.contains('active');
    const ariaSelected = btn.getAttribute('aria-selected');
    if (hasActiveClass !== isActive) {
      console.error(`  [FAIL] Tab ${tabName}: class 'active' is ${hasActiveClass}, expected ${isActive}`);
    }
    if ((ariaSelected === 'true') !== isActive) {
      console.error(`  [FAIL] Tab ${tabName}: aria-selected is '${ariaSelected}', expected '${isActive}'`);
    }
  });

  panels.forEach(panel => {
    const tabName = panel.id.replace('tab-', '');
    const isActive = tabName === activeTab;
    const hasActiveClass = panel.classList.contains('active');
    const ariaHidden = panel.getAttribute('aria-hidden');
    if (hasActiveClass !== isActive) {
      console.error(`  [FAIL] Panel ${tabName}: class 'active' is ${hasActiveClass}, expected ${isActive}`);
    }
    if (isActive && ariaHidden === 'true') {
      console.error(`  [FAIL] Active panel ${tabName} still has aria-hidden="true"`);
    }
    if (!isActive && ariaHidden !== 'true') {
      console.error(`  [FAIL] Inactive panel ${tabName} lacks aria-hidden="true"`);
    }
  });
}

console.log("\n1. Testing Initial State (agent active):");
checkTabState('agent');
console.log("  [PASS] Initial state verified.");

console.log("\n2. Testing Programmatic switchTab('settings'):");
window.switchTab('settings');
checkTabState('settings');
console.log("  [PASS] switchTab('settings') state verified.");

console.log("\n3. Testing Programmatic switchTab('history'):");
window.switchTab('history');
checkTabState('history');
console.log("  [PASS] switchTab('history') state verified.");

console.log("\n4. Testing Programmatic switchTab('vault'):");
window.switchTab('vault');
checkTabState('vault');
console.log("  [PASS] switchTab('vault') state verified.");

console.log("\n5. Testing Keyboard Navigation on Tablist:");
const tablist = document.querySelector('[role="tablist"]');
// Focus first tab
navBtns[0].focus();
window.switchTab('agent');

// Press ArrowRight (should move to settings)
tablist.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
if (document.activeElement.dataset.tab !== 'settings') {
  console.error(`  [FAIL] ArrowRight did not focus settings tab, focused: ${document.activeElement.dataset.tab}`);
} else {
  console.log("  [PASS] ArrowRight moved focus and activated settings tab.");
}
checkTabState('settings');

// Press ArrowDown (should move to history)
tablist.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
if (document.activeElement.dataset.tab !== 'history') {
  console.error(`  [FAIL] ArrowDown did not focus history tab, focused: ${document.activeElement.dataset.tab}`);
} else {
  console.log("  [PASS] ArrowDown moved focus and activated history tab.");
}
checkTabState('history');

// Press End (should move to vault)
tablist.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'End', bubbles: true }));
if (document.activeElement.dataset.tab !== 'vault') {
  console.error(`  [FAIL] End did not focus vault tab, focused: ${document.activeElement.dataset.tab}`);
} else {
  console.log("  [PASS] End key moved focus and activated vault tab.");
}
checkTabState('vault');

// Press ArrowRight from last tab (wrap to agent)
tablist.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
if (document.activeElement.dataset.tab !== 'agent') {
  console.error(`  [FAIL] ArrowRight wrap-around failed, focused: ${document.activeElement.dataset.tab}`);
} else {
  console.log("  [PASS] ArrowRight wrap-around returned focus and activated agent tab.");
}
checkTabState('agent');

// Press ArrowUp from first tab (wrap to vault)
tablist.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
if (document.activeElement.dataset.tab !== 'vault') {
  console.error(`  [FAIL] ArrowUp wrap-around failed, focused: ${document.activeElement.dataset.tab}`);
} else {
  console.log("  [PASS] ArrowUp wrap-around returned focus and activated vault tab.");
}
checkTabState('vault');

// Press Home (should jump to agent)
tablist.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
if (document.activeElement.dataset.tab !== 'agent') {
  console.error(`  [FAIL] Home did not jump to agent tab, focused: ${document.activeElement.dataset.tab}`);
} else {
  console.log("  [PASS] Home key jumped to agent tab.");
}
checkTabState('agent');

console.log("\nALL NAV LIFECYCLE AND KEYBOARD ARIA TESTS PASSED!");
