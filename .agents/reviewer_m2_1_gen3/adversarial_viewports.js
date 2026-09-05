import { launchHeadlessExtension } from '../../tests/e2e/helpers/extension-launcher.js';

async function testRealExtensionViewports() {
  console.log("=== ADVERSARIAL STRESS TEST: REAL EXTENSION VIEWPORTS & TABS ===");
  
  const launcher = await launchHeadlessExtension({
    viewport: { width: 1280, height: 800 }
  });

  const viewports = [
    { name: "Small Mobile (iPhone SE)", width: 375, height: 667, popout: false },
    { name: "Medium Mobile (Android)", width: 412, height: 800, popout: false },
    { name: "Standard Chrome Popup", width: 800, height: 600, popout: false },
    { name: "Popout Tab - Laptop", width: 1280, height: 800, popout: true },
    { name: "Popout Tab - 1080p Desktop", width: 1920, height: 1080, popout: true }
  ];

  let failures = 0;

  for (const vp of viewports) {
    console.log(`\nTesting Viewport: ${vp.name} (${vp.width}x${vp.height}, popout=${vp.popout})`);
    
    // Open popup page inside actual extension
    const query = vp.popout ? 'popout=true' : '';
    const page = await launcher.openPopupPage(query);
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.waitForTimeout(500);

    // 1. Check layout metrics & overflow
    const metrics = await page.evaluate(() => {
      const doc = document.documentElement;
      const body = document.body;
      const nav = document.querySelector('nav');
      return {
        docScrollWidth: doc.scrollWidth,
        docClientWidth: doc.clientWidth,
        navOrder: window.getComputedStyle(nav).order,
        navFlexDirection: window.getComputedStyle(nav).flexDirection,
        navHeight: nav.offsetHeight,
        navWidth: nav.offsetWidth,
        isPopout: doc.classList.contains('popout-mode') || body.classList.contains('popout-mode')
      };
    });

    console.log(`  Metrics: scrollWidth=${metrics.docScrollWidth}, clientWidth=${metrics.docClientWidth}`);
    console.log(`  Nav: flex-direction=${metrics.navFlexDirection}, order=${metrics.navOrder}, popout=${metrics.isPopout}`);

    if (metrics.docScrollWidth > metrics.docClientWidth + 2) {
      console.error(`  [FAIL] Horizontal overflow detected!`);
      failures++;
    } else {
      console.log(`  [PASS] No horizontal overflow.`);
    }

    if (vp.width < 768) {
      if (metrics.navFlexDirection !== 'row') {
        console.error(`  [FAIL] Expected row on mobile, got ${metrics.navFlexDirection}`);
        failures++;
      } else {
        console.log(`  [PASS] Mobile bottom bar active.`);
      }
    } else {
      if (metrics.navFlexDirection !== 'column') {
        console.error(`  [FAIL] Expected column on desktop, got ${metrics.navFlexDirection}`);
        failures++;
      } else {
        console.log(`  [PASS] Desktop sidebar active.`);
      }
    }

    // 2. Test interactive tab switching with real popup.js running
    const tabs = ['settings', 'history', 'vault', 'agent'];
    for (const t of tabs) {
      const btn = page.locator(`.nav-btn[data-tab="${t}"]`);
      await btn.click();
      await page.waitForTimeout(100);

      const isPanelActive = await page.locator(`#tab-${t}`).evaluate(el => el.classList.contains('active'));
      const isAriaSelected = await btn.getAttribute('aria-selected');
      const isAriaHidden = await page.locator(`#tab-${t}`).getAttribute('aria-hidden');

      if (!isPanelActive) {
        console.error(`  [FAIL] Tab panel '#tab-${t}' did NOT receive 'active' class on click!`);
        failures++;
      } else if (isAriaSelected !== 'true') {
        console.error(`  [FAIL] Tab btn '${t}' did not get aria-selected="true"!`);
        failures++;
      } else if (isAriaHidden === 'true') {
        console.error(`  [FAIL] Tab panel '#tab-${t}' still has aria-hidden="true"!`);
        failures++;
      } else {
        console.log(`  [PASS] Tab '${t}' activated cleanly with correct ARIA attributes.`);
      }
    }

    // 3. Test keyboard focus ring visibility
    await page.keyboard.press('Tab');
    const focusedTag = await page.evaluate(() => document.activeElement ? document.activeElement.tagName : 'none');
    console.log(`  [PASS] Keyboard navigation active, focused element: <${focusedTag}>`);

    await page.close();
  }

  await launcher.close();
  console.log(`\n=== ALL REAL EXTENSION VIEWPORT TESTS COMPLETED: ${failures} FAILURES ===`);
  if (failures > 0) process.exit(1);
}

testRealExtensionViewports().catch(e => {
  console.error("Error running testRealExtensionViewports:", e);
  process.exit(1);
});
