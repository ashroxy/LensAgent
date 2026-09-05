import fs from 'node:fs';
import { JSDOM } from 'jsdom';

const html = fs.readFileSync('popup/popup.html', 'utf8');
const dom = new JSDOM(html);
const doc = dom.window.document;

console.log('=== Verifying Labels & Form Controls ===');
const labels = doc.querySelectorAll('label');
console.log('Total labels found:', labels.length);

let missingFor = 0;
let brokenFor = 0;

labels.forEach(l => {
  const f = l.getAttribute('for');
  if (!f) {
    console.error('FAIL: Label missing for attribute:', l.outerHTML);
    missingFor++;
  } else {
    const el = doc.getElementById(f);
    if (!el) {
      console.error('FAIL: Label references non-existent ID:', f);
      brokenFor++;
    } else {
      console.log(`PASS: Label for="${f}" matches <${el.tagName.toLowerCase()} id="${el.id}">`);
    }
  }
});

const inputs = doc.querySelectorAll('input, select, textarea');
console.log('\nTotal form inputs found:', inputs.length);
let unlabeled = 0;

inputs.forEach(inp => {
  const id = inp.id;
  const hasForLabel = id && doc.querySelector(`label[for="${id}"]`);
  const hasEnclosingLabel = inp.closest('label');
  const hasAriaLabel = inp.getAttribute('aria-label');
  const hasAriaLabelledBy = inp.getAttribute('aria-labelledby');

  if (!hasForLabel && !hasEnclosingLabel && !hasAriaLabel && !hasAriaLabelledBy) {
    console.error('FAIL: Input missing accessible label:', inp.outerHTML);
    unlabeled++;
  } else {
    console.log(`PASS: Input id="${id || 'none'}" has accessible label (for: ${!!hasForLabel}, enclosing: ${!!hasEnclosingLabel}, aria-label: ${!!hasAriaLabel})`);
  }
});

console.log('\n=== Verifying WAI-ARIA Tabs & Roles ===');
const tablist = doc.querySelector('[role="tablist"]');
console.log('tablist exists:', !!tablist);

const tabs = doc.querySelectorAll('[role="tab"]');
console.log('Total tabs:', tabs.length);
tabs.forEach(t => {
  const controls = t.getAttribute('aria-controls');
  const panel = controls ? doc.getElementById(controls) : null;
  console.log(`Tab id="${t.id}" data-tab="${t.getAttribute('data-tab')}" controls="${controls}" panel exists: ${!!panel} aria-selected="${t.getAttribute('aria-selected')}"`);
});

const panels = doc.querySelectorAll('[role="tabpanel"]');
console.log('Total tabpanels:', panels.length);
panels.forEach(p => {
  const labelledBy = p.getAttribute('aria-labelledby');
  const tab = labelledBy ? doc.getElementById(labelledBy) : null;
  console.log(`Panel id="${p.id}" labelledBy="${labelledBy}" tab exists: ${!!tab}`);
});

console.log('\n=== Verifying Icon-Only Buttons ===');
const buttons = doc.querySelectorAll('button');
let missingButtonLabel = 0;
buttons.forEach(b => {
  const hasText = b.textContent.trim().replace(/[\s\n\r]+/g, ' ').length > 0 && !b.querySelector('.material-symbols-outlined:only-child');
  const ariaLabel = b.getAttribute('aria-label');
  const title = b.getAttribute('title');
  if (!ariaLabel && !hasText && !title) {
    console.error('FAIL: Icon button missing accessible label:', b.outerHTML);
    missingButtonLabel++;
  } else {
    console.log(`Button id="${b.id || 'class=' + b.className.slice(0, 20)}" accessible name: "${ariaLabel || title || b.textContent.trim()}"`);
  }
});

console.log('\n=== Summary ===');
console.log('Missing for:', missingFor);
console.log('Broken for:', brokenFor);
console.log('Unlabeled inputs:', unlabeled);
console.log('Unlabeled buttons:', missingButtonLabel);
