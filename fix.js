-const fs = require('fs');

// 1. popup.html fixes
let html = fs.readFileSync('e:/SIH-171/popup/popup.html', 'utf8');
html = html.replace(/class="tab-content(.*?)"/g, 'class="tab-content$1 overflow-y-auto pr-2"');
const errorToast = '<div id="errorMsg" class="fixed top-4 left-1/2 -translate-x-1/2 bg-error text-on-error px-4 py-2 rounded-xl shadow-lg z-[100] text-sm font-bold opacity-0 transition-opacity pointer-events-none" hidden></div>\n<main';
html = html.replace('<main', errorToast);
const settingsMsg = '<span id="settingsMsg" class="text-[11px] text-tertiary font-bold self-end" hidden></span>\n                <div class="flex justify-end gap-4 mt-2">';
html = html.replace('<div class="flex justify-end gap-4 mt-2">', settingsMsg);
const vaultHeader = '<h2 class="font-headline-md text-[14px] text-on-surface flex items-center gap-2">\n<span class="material-symbols-outlined text-primary text-[20px]">encrypted</span> Identity Vault <span id="vaultFilledCount" class="text-[12px] bg-primary text-on-primary px-2 py-0.5 rounded-full">0</span>\n</h2>';
html = html.replace(/<h2 class="font-headline-md text-\[14px\] text-on-surface flex items-center gap-2\">[\s\S]*?Identity Vault\s*<\/h2>/, vaultHeader);
fs.writeFileSync('e:/SIH-171/popup/popup.html', html, 'utf8');

// 2. popup.js fixes
let js = fs.readFileSync('e:/SIH-171/popup/popup.js', 'utf8');
js = js.replace('latencyDisplayEl.textContent = `{p.metrics.latency}ms`;', 'latencyDisplayEl.textContent = `{p.metrics.latency}`;');
js = js.replace('function showError(t) { if (errorMsg) errorMsg.textContent = t; if (errorMsg) errorMsg.hidden = false; }', 'function showError(t) { if (errorMsg) { errorMsg.textContent = t; errorMsg.hidden = false; setTimeout(() => { errorMsg.classList.remove("opacity-0"); errorMsg.classList.add("opacity-100"); }, 10); } }');
js = js.replace('function hideError()   { if (errorMsg) errorMsg.hidden = true; }', 'function hideError() { if (errorMsg) { errorMsg.classList.remove("opacity-100"); errorMsg.classList.add("opacity-0"); setTimeout(() => { errorMsg.hidden = true; }, 300); } }');
js = js.replace('settingsMsg.textContent = "- Settings saved.";', 'if (settingsMsg) settingsMsg.textContent = "? Settings saved.";');
js = js.replace('settingsMsg.hidden = false;', 'if (settingsMsg) settingsMsg.hidden = false;');
js = js.replace('setTimeout(() => { settingsMsg.hidden = true; }, 2000);', 'setTimeout(() => { if (settingsMsg) settingsMsg.hidden = true; }, 2000);');
js = js.replace('settingsMsg.textContent = "-  Settings reset to defaults.";', 'if (settingsMsg) settingsMsg.textContent = "- Settings reset to defaults.";');

fs.writeFileSync('e:/SIH-171/popup/popup.js', js, 'utf8');

// 3. input.css fixes
let css = fs.readFileSync('e:/SIH-171/popup/input.css', 'utf8');
if (!css.includes('::-webkit-scrollbar')) {
  css += '\n/* Custom Scrollbar */\n::-webkit-scrollbar { width: 6px; }\n::-webkit-scrollbar-track { background: transparent; }\n::-webkit-scrollbar-thumb { background: #e0e2e6; border-radius: 10px; }\n::-webkit-scrollbar-thumb:hover { background: #c4c7c5; }\n.dark ::-webkit-scrollbar-thumb { background: #444746; }\n.dark ::-webkit-scrollbar-thumb:hover { background: #5e615f; }\n';
  fs.writeFileSync('e:/SIH-171/popup/input.css', css, 'utf8');
}
console.log("Done");
