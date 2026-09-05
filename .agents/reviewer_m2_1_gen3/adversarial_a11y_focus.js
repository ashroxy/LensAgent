import { launchHeadlessExtension } from '../../tests/e2e/helpers/extension-launcher.js';

async function testFocusAndKeyboard() {
  console.log("=== ADVERSARIAL STRESS TEST: FOCUS RINGS & KEYBOARD ARIA ===");
  const launcher = await launchHeadlessExtension();
  const page = await launcher.openPopupPage();
  await page.setViewportSize({ width: 800, height: 600 });
  await page.waitForTimeout(500);

  let failures = 0;

  // 1. Verify WAI-ARIA tab navigation via Arrow keys, Home, End
  console.log("\n1. Testing Keyboard Arrow Navigation across Tabs:");
  const firstTab = page.locator('#tab-btn-agent');
  await firstTab.focus();

  // Test ArrowDown (should go to settings)
  await page.keyboard.press('ArrowDown');
  await page.waitForTimeout(100);
  let focusedId = await page.evaluate(() => document.activeElement?.id);
  if (focusedId !== 'tab-btn-settings') {
    console.error(`  [FAIL] ArrowDown from agent focused #${focusedId}, expected #tab-btn-settings`);
    failures++;
  } else {
    console.log(`  [PASS] ArrowDown focused #tab-btn-settings.`);
  }

  // Test ArrowRight (should go to history)
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(100);
  focusedId = await page.evaluate(() => document.activeElement?.id);
  if (focusedId !== 'tab-btn-history') {
    console.error(`  [FAIL] ArrowRight from settings focused #${focusedId}, expected #tab-btn-history`);
    failures++;
  } else {
    console.log(`  [PASS] ArrowRight focused #tab-btn-history.`);
  }

  // Test End (should go to vault)
  await page.keyboard.press('End');
  await page.waitForTimeout(100);
  focusedId = await page.evaluate(() => document.activeElement?.id);
  if (focusedId !== 'tab-btn-vault') {
    console.error(`  [FAIL] End from history focused #${focusedId}, expected #tab-btn-vault`);
    failures++;
  } else {
    console.log(`  [PASS] End key focused #tab-btn-vault.`);
  }

  // Test ArrowDown wrap-around (should go to agent)
  await page.keyboard.press('ArrowDown');
  await page.waitForTimeout(100);
  focusedId = await page.evaluate(() => document.activeElement?.id);
  if (focusedId !== 'tab-btn-agent') {
    console.error(`  [FAIL] ArrowDown wrap from vault focused #${focusedId}, expected #tab-btn-agent`);
    failures++;
  } else {
    console.log(`  [PASS] ArrowDown wrap-around focused #tab-btn-agent.`);
  }

  // Test ArrowUp wrap-around (should go to vault)
  await page.keyboard.press('ArrowUp');
  await page.waitForTimeout(100);
  focusedId = await page.evaluate(() => document.activeElement?.id);
  if (focusedId !== 'tab-btn-vault') {
    console.error(`  [FAIL] ArrowUp wrap from agent focused #${focusedId}, expected #tab-btn-vault`);
    failures++;
  } else {
    console.log(`  [PASS] ArrowUp wrap-around focused #tab-btn-vault.`);
  }

  // Test Home (should go to agent)
  await page.keyboard.press('Home');
  await page.waitForTimeout(100);
  focusedId = await page.evaluate(() => document.activeElement?.id);
  if (focusedId !== 'tab-btn-agent') {
    console.error(`  [FAIL] Home key focused #${focusedId}, expected #tab-btn-agent`);
    failures++;
  } else {
    console.log(`  [PASS] Home key jumped to #tab-btn-agent.`);
  }

  // 2. Test Focus Ring computed style on form inputs and buttons
  console.log("\n2. Testing Focus Ring Outline styles:");
  
  // Test Goal Input focus-within on container
  const goalInput = page.locator('#goalInput');
  await goalInput.focus();
  const goalOutline = await page.evaluate(() => {
    const inp = document.getElementById('goalInput');
    const container = inp.closest('.neu-recessed');
    return {
      inputOutline: window.getComputedStyle(inp).outline,
      containerOutline: window.getComputedStyle(container).outline,
      containerOutlineColor: window.getComputedStyle(container).outlineColor
    };
  });
  console.log(`  Goal Input Container Outline: ${goalOutline.containerOutline} (Color: ${goalOutline.containerOutlineColor})`);
  if (!goalOutline.containerOutlineColor.includes('48, 95, 159')) { // #305f9f is rgb(48, 95, 159)
    console.error(`  [FAIL] Goal input parent container did not show #305f9f focus ring!`);
    failures++;
  } else {
    console.log(`  [PASS] Goal input search bar has high-contrast container focus ring.`);
  }

  // Switch to Settings tab and test input focus
  await page.click('#tab-btn-settings');
  await page.waitForTimeout(100);
  
  const serverInput = page.locator('#setting-serverUrl');
  await serverInput.focus();
  const serverOutline = await page.evaluate(() => {
    const inp = document.getElementById('setting-serverUrl');
    return {
      outline: window.getComputedStyle(inp).outline,
      outlineColor: window.getComputedStyle(inp).outlineColor
    };
  });
  console.log(`  Server URL Input Outline: ${serverOutline.outline}`);
  if (!serverOutline.outlineColor.includes('48, 95, 159')) {
    console.error(`  [FAIL] Setting input did not show #305f9f focus ring!`);
    failures++;
  } else {
    console.log(`  [PASS] Setting input has WCAG 2.1 AA focus outline.`);
  }

  // Test Start Button focus outline
  await page.click('#tab-btn-agent');
  await page.waitForTimeout(100);
  const startBtn = page.locator('#startBtn');
  await startBtn.focus();
  const btnOutline = await page.evaluate(() => {
    const b = document.getElementById('startBtn');
    return {
      outline: window.getComputedStyle(b).outline,
      outlineColor: window.getComputedStyle(b).outlineColor
    };
  });
  console.log(`  Start Button Outline: ${btnOutline.outline}`);
  if (!btnOutline.outlineColor.includes('48, 95, 159')) {
    console.error(`  [FAIL] Start button did not show #305f9f focus ring!`);
    failures++;
  } else {
    console.log(`  [PASS] Start button has WCAG 2.1 AA focus outline.`);
  }

  await page.close();
  await launcher.close();

  console.log(`\n=== ADVERSARIAL FOCUS & KEYBOARD TESTS COMPLETED: ${failures} FAILURES ===`);
  if (failures > 0) process.exit(1);
}

testFocusAndKeyboard().catch(e => {
  console.error("Error in testFocusAndKeyboard:", e);
  process.exit(1);
});
