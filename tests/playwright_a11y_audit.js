import { chromium } from 'playwright';
import path from 'node:path';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  const fileUrl = 'file:///' + path.resolve('popup/popup.html').replace(/\\/g, '/');
  await page.goto(fileUrl);
  await page.waitForLoadState('domcontentloaded');

  console.log('=== PLAYWRIGHT REAL CHROMIUM A11Y AUDIT ===');

  // 1. Focus #goalInput and check computed outline on parent and input
  await page.focus('#goalInput');
  const goalInputOutline = await page.evaluate(() => {
    const input = document.getElementById('goalInput');
    const container = input.closest('.neu-recessed');
    const inputStyle = window.getComputedStyle(input);
    const containerStyle = container ? window.getComputedStyle(container) : null;
    return {
      inputOutlineStyle: inputStyle.outlineStyle,
      inputOutlineWidth: inputStyle.outlineWidth,
      containerOutlineStyle: containerStyle ? containerStyle.outlineStyle : null,
      containerOutlineColor: containerStyle ? containerStyle.outlineColor : null,
      containerOutlineWidth: containerStyle ? containerStyle.outlineWidth : null,
    };
  });
  console.log('1. #goalInput Focus Computed Styles:', JSON.stringify(goalInputOutline, null, 2));

  // 2. Real keyboard Tab sequence from initial load
  await page.evaluate(() => document.body.focus());
  const tabSequence = [];
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press('Tab');
    const activeEl = await page.evaluate(() => {
      const el = document.activeElement;
      return el ? (el.id ? '#' + el.id : el.tagName + (el.className ? '.' + el.className.split(' ')[0] : '')) : 'none';
    });
    tabSequence.push(activeEl);
  }
  console.log('2. Real Keyboard Tab Sequence (first 12 steps):', tabSequence);

  // 3. Arrow navigation in tablist
  await page.focus('#tab-btn-agent');
  await page.keyboard.press('ArrowRight');
  const afterRight = await page.evaluate(() => ({
    activeElement: document.activeElement.id,
    selectedTab: document.querySelector('.nav-btn.active')?.id
  }));
  console.log('3. ArrowRight on tablist:', afterRight);

  // 4. Modal focus trap test in real browser
  await page.evaluate(() => {
    const overlay = document.getElementById('hitlOverlay');
    overlay.hidden = false;
    document.getElementById('hitlInput').focus();
  });
  
  const modalStartFocus = await page.evaluate(() => document.activeElement.id);
  // Press Shift+Tab from hitlInput
  await page.keyboard.press('Shift+Tab');
  const focusAfterShiftTab = await page.evaluate(() => {
    const el = document.activeElement;
    return el ? (el.id ? '#' + el.id : el.tagName) : 'none';
  });
  console.log(`4. Modal Focus Escape Test: Initial=${modalStartFocus}, After Shift+Tab=${focusAfterShiftTab}`);

  // Press Tab multiple times from within modal
  await page.focus('#hitlSendBtn');
  await page.keyboard.press('Tab');
  const focusAfterSendBtnTab = await page.evaluate(() => {
    const el = document.activeElement;
    return el ? (el.id ? '#' + el.id : el.tagName) : 'none';
  });
  console.log(`4b. Modal Focus Escape Test: From #hitlSendBtn Tab -> ${focusAfterSendBtnTab}`);

  // 5. Test button accessible names in real browser
  const buttonA11yData = await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button, [role="button"]'));
    return buttons.map(b => ({
      id: b.id || '<no-id>',
      text: b.innerText.replace(/\s+/g, ' ').trim(),
      ariaLabel: b.getAttribute('aria-label'),
      title: b.getAttribute('title')
    }));
  });
  console.log('5. Button accessible data count:', buttonA11yData.length);

  await browser.close();
  console.log('=== REAL CHROMIUM AUDIT COMPLETE ===');
})();
