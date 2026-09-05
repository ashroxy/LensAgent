import fs from 'node:fs';
import { JSDOM } from 'jsdom';

const html = fs.readFileSync('popup/popup.html', 'utf8');
const css = fs.readFileSync('popup/popup.css', 'utf8');

console.log('=== Checking CSS bundle size and validity ===');
console.log('popup.css bytes:', css.length);
if (css.length < 5000) {
  console.error('FAIL: popup.css is suspiciously small');
} else {
  console.log('PASS: popup.css has substantial compiled content');
}

// Verify critical CSS selectors exist in popup.css
const criticalSelectors = [
  ':focus-visible',
  '.nav-btn',
  '.nav-btn.active',
  '.nav-btn:focus-visible',
  '.nav-btn:active',
  '.nav-btn:disabled',
  'body.popout-mode',
  'html.popout-mode',
  '.neu-toggle-input:focus-visible',
  '.neu-recessed:has(#goalInput:focus-visible)',
  '#goalInput:focus-visible',
  'md:w-[800px]',
  'md:h-[600px]',
  'md:flex-row',
  'sm:grid-cols-2',
  'md:grid-cols-7'
];

criticalSelectors.forEach(sel => {
  // Escape for simple substring or regex search in minified CSS
  const cleanSel = sel.replace(/\[/g, '\\[').replace(/\]/g, '\\]').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
  const found = css.includes(sel) || new RegExp(cleanSel.replace(/\\/g, '\\\\')).test(css);
  if (found) {
    console.log(`PASS: Found selector in popup.css: ${sel}`);
  } else {
    // Check with class escaping (Tailwind escapes brackets and colons in CSS)
    const twEscaped = sel.replace(/:/g, '\\:').replace(/\[/g, '\\[').replace(/\]/g, '\\]');
    if (css.includes(twEscaped)) {
      console.log(`PASS: Found Tailwind-escaped selector in popup.css: ${twEscaped}`);
    } else {
      console.error(`FAIL: Selector not found in popup.css: ${sel}`);
    }
  }
});
