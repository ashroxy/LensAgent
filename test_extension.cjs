const puppeteer = require('puppeteer');
const path = require('path');

(async () => {
  const extensionPath = path.resolve(__dirname);
  console.log("Extension path:", extensionPath);

  try {
    const browser = await puppeteer.launch({
      headless: "new",
      args: [
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`
      ]
    });
    console.log("Launched browser");
    
    // Wait for the background worker target to appear
    await new Promise(r => setTimeout(r, 3000));
    const targets = await browser.targets();
    const bgTarget = targets.find(t => t.type() === 'service_worker');
    
    if (bgTarget) {
      console.log("Service worker found:", bgTarget.url());
    } else {
      console.log("No service worker target found. Extension likely failed to load.");
    }
    
    await browser.close();
  } catch (err) {
    console.error("Puppeteer Error:", err);
  }
})();
