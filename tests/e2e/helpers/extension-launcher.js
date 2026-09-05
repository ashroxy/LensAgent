/**
 * Headless Playwright MV3 Chrome Extension Launcher
 * Uses Chromium New Headless mode (--headless=new) to run MV3 extensions headlessly.
 */
import { chromium } from 'playwright';
import path from 'node:path';

export async function launchHeadlessExtension(options = {}) {
  const extPath = path.resolve(options.extPath || '.');
  const context = await chromium.launchPersistentContext('', {
    headless: false, // Prevents Playwright from forcing legacy --headless
    args: [
      '--headless=new', // Chromium modern headless mode that supports extensions
      '--disable-extensions-except=' + extPath,
      '--load-extension=' + extPath,
      '--no-sandbox',
      '--disable-gpu',
      '--disable-dev-shm-usage',
    ],
    viewport: options.viewport || { width: 1280, height: 800 }
  });

  // MV3 service worker discovery
  let serviceWorker = context.serviceWorkers()[0];
  if (!serviceWorker) {
    serviceWorker = await context.waitForEvent('serviceworker', { timeout: 12000 }).catch(() => null);
  }

  let extensionId = null;
  if (serviceWorker) {
    const swUrl = serviceWorker.url();
    const parts = swUrl.split('/');
    extensionId = parts[2];
  } else {
    // Fallback: examine context pages or wait for worker
    const workers = context.serviceWorkers();
    if (workers.length > 0) {
      extensionId = workers[0].url().split('/')[2];
      serviceWorker = workers[0];
    }
  }

  return {
    context,
    serviceWorker,
    extensionId,
    async openPopupPage(extraParams = '') {
      if (!extensionId) throw new Error('Cannot open popup: Extension ID not resolved.');
      const page = await context.newPage();
      const query = extraParams ? '?' + extraParams : '';
      const popupUrl = 'chrome-extension://' + extensionId + '/popup/popup.html' + query;
      await page.goto(popupUrl, { waitUntil: 'domcontentloaded' });
      return page;
    },
    async close() {
      try {
        await context.close();
      } catch (_) {
        // Ignore already closed errors
      }
    }
  };
}
