const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const extensionPath = path.resolve('e:/SIH-171');
  const context = await chromium.launchPersistentContext('', {
    headless: false,
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`
    ]
  });
  
  let [background] = context.serviceWorkers();
  if (!background) {
    try { background = await context.waitForEvent('serviceworker', { timeout: 3000 }); } catch(e) {}
  }

  background.on('console', msg => console.log('[SW Console]', msg.type(), msg.text()));

  const testPage = await context.newPage();
  await testPage.goto('https://example.com');
  
  // Wait for the extension to initialize
  await testPage.waitForTimeout(2000);
  
  // Run agent start!
  await background.evaluate(async () => {
    // There is a handleStartAgent function in service-worker, but it's not exported.
    // However, we can send a message to it!
    chrome.runtime.sendMessage({
      type: 'POPUP_START_AGENT',
      goal: 'test',
      settings: {},
      targetTabId: null
    });
  });

  await testPage.waitForTimeout(5000);
  
  const logs = await background.evaluate(async () => {
    return new Promise(resolve => {
      chrome.runtime.sendMessage({ type: 'POPUP_EXPORT_LOG' }, (res) => {
        resolve(res ? res.text : 'No logs');
      });
    });
  });
  console.log("=== LOGS ===");
  console.log(logs);

  console.log('Done.');
  await context.close();
})();
