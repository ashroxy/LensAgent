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

  const extId = background.url().split('/')[2];

  const testPage = await context.newPage();
  
  // Navigate to popup to click start!
  await testPage.goto(`chrome-extension://${extId}/popup/popup.html`);
  
  // Wait for it
  await testPage.waitForTimeout(2000);
  
  // Click start agent
  await testPage.fill('#goalInput', 'test goal');
  await testPage.click('#startBtn');

  await testPage.waitForTimeout(5000);

  const logs = await testPage.evaluate(async () => {
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
