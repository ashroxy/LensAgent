import fs from 'fs';
import { JSDOM } from 'jsdom';

const html = fs.readFileSync('popup/popup.html', 'utf-8');
const dom = new JSDOM(html);
const document = dom.window.document;

console.log("=== CHECKING FORM LABELS & ACCESSIBILITY IN popup.html ===");

// 1. Check all <label> elements
const labels = Array.from(document.querySelectorAll('label'));
console.log(`Found ${labels.length} <label> elements:`);

let labelErrors = 0;
labels.forEach((lbl, i) => {
  const forAttr = lbl.getAttribute('for');
  const text = lbl.textContent.trim();
  if (!forAttr) {
    console.error(`  [FAIL] Label #${i+1} ("${text}") has NO 'for' attribute!`);
    labelErrors++;
  } else {
    const target = document.getElementById(forAttr);
    if (!target) {
      console.error(`  [FAIL] Label #${i+1} for="${forAttr}" points to NON-EXISTENT element!`);
      labelErrors++;
    } else {
      console.log(`  [PASS] Label for="${forAttr}" -> found <${target.tagName.toLowerCase()} id="${target.id}">`);
    }
  }
});

// 2. Check all form controls: inputs, selects, textareas
const controls = Array.from(document.querySelectorAll('input, select, textarea'));
console.log(`\nFound ${controls.length} form controls (<input>, <select>, <textarea>):`);

let controlErrors = 0;
controls.forEach((ctrl, i) => {
  const id = ctrl.id || '[no-id]';
  const type = ctrl.getAttribute('type') || 'text';
  const ariaLabel = ctrl.getAttribute('aria-label');
  const ariaLabelledby = ctrl.getAttribute('aria-labelledby');
  
  // Find associated label
  let associatedLabel = null;
  if (ctrl.id) {
    associatedLabel = document.querySelector(`label[for="${ctrl.id}"]`);
  }
  // Or wrapping label
  if (!associatedLabel) {
    associatedLabel = ctrl.closest('label');
  }

  const hasAccessibleName = !!(associatedLabel || ariaLabel || ariaLabelledby);
  if (!hasAccessibleName) {
    console.error(`  [FAIL] Control #${i+1} <${ctrl.tagName.toLowerCase()} id="${id}" type="${type}"> has NO accessible name (no label, no aria-label, no aria-labelledby)!`);
    controlErrors++;
  } else {
    const method = associatedLabel ? `label[for="${ctrl.id}"]` : (ariaLabel ? `aria-label="${ariaLabel}"` : `aria-labelledby="${ariaLabelledby}"`);
    console.log(`  [PASS] Control #${i+1} <${ctrl.tagName.toLowerCase()} id="${id}"> -> accessible via ${method}`);
  }
});

// 3. Check all buttons for accessible name
const buttons = Array.from(document.querySelectorAll('button'));
console.log(`\nFound ${buttons.length} <button> elements:`);

let buttonErrors = 0;
buttons.forEach((btn, i) => {
  const id = btn.id || '[no-id]';
  const text = btn.textContent.trim();
  const ariaLabel = btn.getAttribute('aria-label');
  const title = btn.getAttribute('title');

  const hasName = (text.length > 0) || !!ariaLabel || !!title;
  if (!hasName) {
    console.error(`  [FAIL] Button #${i+1} <button id="${id}"> has NO text, NO aria-label, and NO title!`);
    buttonErrors++;
  } else {
    const summary = ariaLabel || title || text.replace(/\s+/g, ' ').slice(0, 30);
    console.log(`  [PASS] Button #${i+1} <button id="${id}"> -> "${summary}"`);
  }
});

console.log(`\nSummary: Label errors = ${labelErrors}, Control errors = ${controlErrors}, Button errors = ${buttonErrors}`);
