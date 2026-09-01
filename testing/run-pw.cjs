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
  
  testPage.on('requestfailed', request => {
    console.log('[Network Error] ' + request.url() + ' - ' + request.failure().errorText);
  });
  
  testPage.on('console', msg => console.log('[Offscreen Console]', msg.type(), msg.text()));
  testPage.on('pageerror', error => console.log('[Offscreen Page Error]', error.message));
  
  await testPage.goto(`chrome-extension://${extId}/offscreen/offscreen.html`);
  
  // Wait for initialization
  await testPage.waitForTimeout(2000);
  
  // Simulate a process frame message
  await testPage.evaluate(async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 100; canvas.height = 100;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = 'white'; ctx.fillRect(0,0,100,100);
    const b64 = canvas.toDataURL('image/jpeg').split(',')[1];
    
    const { LocalVisionModel } = await import('../vision_model.js');
    const vm = new LocalVisionModel();
    try {
      const res = await vm.detect(b64);
      console.log('Detect result:', res);
    } catch (e) {
      console.error('Detect error:', e);
    }
  });

  await testPage.waitForTimeout(2000);
  console.log('Done.');
  await context.close();
})();
