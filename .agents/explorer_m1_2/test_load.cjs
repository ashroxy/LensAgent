const { chromium } = require('playwright');
const path = require('path');

(async () => {
  try {
    const extPath = path.resolve('e:/SIH-171');
    console.log('Loading extension from:', extPath);

    const context = await chromium.launchPersistentContext('', {
      headless: false,
      args: [
        '--headless=new',
        `--disable-extensions-except=${extPath}`,
        `--load-extension=${extPath}`,
        '--no-sandbox'
      ]
    });

    let sw = context.serviceWorkers()[0];
    if (!sw) {
      sw = await context.waitForEvent('serviceworker', { timeout: 10000 });
    }
    console.log('Service Worker loaded:', sw.url());

    const extId = sw.url().split('/')[2];
    console.log('Extension ID:', extId);

    const page = await context.newPage();
    const popupUrl = `chrome-extension://${extId}/popup/popup.html`;
    console.log('Navigating to popup:', popupUrl);
    
    // Capture page console messages and failed requests
    page.on('console', msg => console.log(`[Popup Console ${msg.type()}]:`, msg.text()));
    page.on('pageerror', err => console.error('[Popup Error]:', err));
    page.on('requestfailed', req => console.error(`[Popup Request Failed]: ${req.url()} - ${req.failure().errorText}`));

    await page.goto(popupUrl, { waitUntil: 'domcontentloaded' });
    console.log('Popup page title:', await page.title());

    // Check if liveStream and other elements exist
    const agentTab = await page.$('#agentTab');
    console.log('Agent tab found:', !!agentTab);

    await context.close();
    console.log('SUCCESS: Headless verification complete.');
  } catch (err) {
    console.error('FAILED:', err);
    process.exit(1);
  }
})();
