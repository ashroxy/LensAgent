const fs = require('fs');

let html = fs.readFileSync('popup/popup.html', 'utf8');

// 1. Add expand buttons for Fullscreen
html = html.replace(
  '<span class="font-label-md text-[10px] text-on-surface-variant mb-3 uppercase tracking-wider">Raw Viewport</span>',
  '<div class="flex justify-between items-center mb-3"><span class="font-label-md text-[10px] text-on-surface-variant uppercase tracking-wider">Raw Viewport</span><button class="expand-btn w-6 h-6 rounded neu-btn-secondary flex items-center justify-center text-primary" data-target="raw"><span class="material-symbols-outlined text-[14px]">fullscreen</span></button></div>'
);

html = html.replace(
  '<div class="flex justify-between items-center mb-3">\n                            <span class="font-label-md text-[10px] text-on-surface-variant uppercase tracking-wider">Sanitized Stream</span>\n                            <div class="flex items-center gap-2 px-2 py-1 rounded bg-tertiary/10">',
  '<div class="flex justify-between items-center mb-3"><span class="font-label-md text-[10px] text-on-surface-variant uppercase tracking-wider">Sanitized Stream</span><div class="flex items-center gap-2"><button class="expand-btn w-6 h-6 rounded neu-btn-secondary flex items-center justify-center text-tertiary" data-target="redacted"><span class="material-symbols-outlined text-[14px]">fullscreen</span></button><div class="flex items-center gap-2 px-2 py-1 rounded bg-tertiary/10">'
);

// 2. Metrics - change to grid-cols-6 and add Steps & Quality, plus sparkline
const metricsHTML = `
                    <div class="grid grid-cols-6 gap-2">
                        <div class="neu-recessed rounded-xl p-2 flex flex-col justify-center items-center gap-1">
                            <span class="font-label-md text-[8px] text-outline uppercase tracking-wider">Steps</span>
                            <span class="font-mono text-[12px] font-bold text-primary"><span id="stepCount">0</span>/<span id="maxSteps">?</span></span>
                        </div>
                        <div class="neu-recessed rounded-xl p-2 flex flex-col justify-center items-center gap-1 relative overflow-hidden">
                            <canvas id="sparklineCanvas" width="100" height="50" class="absolute bottom-0 left-0 w-full h-[50px] opacity-20 pointer-events-none"></canvas>
                            <span class="font-label-md text-[8px] text-outline uppercase tracking-wider z-10">Latency</span>
                            <span class="font-mono text-[12px] font-bold text-primary z-10"><span id="latencyMs">0</span>ms</span>
                        </div>
                        <div class="neu-recessed rounded-xl p-2 flex flex-col justify-center items-center gap-1">
                            <span class="font-label-md text-[8px] text-outline uppercase tracking-wider">Redacted</span>
                            <span id="redactionCount" class="font-mono text-[12px] font-bold text-tertiary">0</span>
                        </div>
                        <div class="neu-recessed rounded-xl p-2 flex flex-col justify-center items-center gap-1">
                            <span class="font-label-md text-[8px] text-outline uppercase tracking-wider">FPS</span>
                            <span id="fpsCount" class="font-mono text-[12px] font-bold text-primary">-</span>
                        </div>
                        <div class="neu-recessed rounded-xl p-2 flex flex-col justify-center items-center gap-1">
                            <span class="font-label-md text-[8px] text-outline uppercase tracking-wider">Dropped</span>
                            <span id="skippedCount" class="font-mono text-[12px] font-bold text-error">0</span>
                        </div>
                        <div class="neu-recessed rounded-xl p-2 flex flex-col justify-center items-center gap-1">
                            <span class="font-label-md text-[8px] text-outline uppercase tracking-wider">Quality</span>
                            <span class="font-mono text-[11px] font-bold text-on-surface-variant"><span id="qualityDisplay">100%</span> <span id="dprDisplay"></span></span>
                        </div>
                    </div>
`;
html = html.replace(/<div class="grid grid-cols-4 gap-3">[\s\S]*?<\/div>\s*<\/div>/, metricsHTML.trim() + '\n                </div>');

// 3. Overflow and missing items on other tabs
html = html.replace('<section id="tab-settings" class="tab-content flex-col gap-6">', '<section id="tab-settings" class="tab-content flex-col gap-6 overflow-y-auto pr-2">');
html = html.replace('<section id="tab-history" class="tab-content flex-col h-full">', '<section id="tab-history" class="tab-content flex-col h-full overflow-y-auto pr-2">');
html = html.replace('<section id="tab-vault" class="tab-content flex-col gap-6">', '<section id="tab-vault" class="tab-content flex-col gap-6 overflow-y-auto pr-2">');

html = html.replace('<div class="flex justify-end gap-4 mt-2">', '<span id="settingsMsg" class="text-[11px] text-tertiary font-bold self-end" hidden></span>\n                <div class="flex justify-end gap-4 mt-2">');
html = html.replace('<span class="material-symbols-outlined text-primary text-[20px]">encrypted</span> Identity Vault\n                            </h2>', '<span class="material-symbols-outlined text-primary text-[20px]">encrypted</span> Identity Vault <span id="vaultFilledCount" class="text-[12px] bg-primary text-on-primary px-2 py-0.5 rounded-full">0</span>\n                            </h2>');

// 4. Video Modal at the end before script
const modalHTML = `
    <div id="videoModal" hidden class="fixed inset-0 bg-surface/90 backdrop-blur-md z-[200] flex flex-col p-6 transition-all">
        <div class="flex justify-between items-center mb-4">
            <h2 id="modalTitle" class="text-[18px] font-bold text-on-surface flex items-center gap-2"></h2>
            <button id="modalClose" class="w-10 h-10 rounded-full neu-btn text-on-surface flex items-center justify-center">
                <span class="material-symbols-outlined">close</span>
            </button>
        </div>
        <div class="flex-1 neu-recessed rounded-2xl relative overflow-hidden bg-[#000] p-2">
            <canvas id="modalCanvas" class="w-full h-full object-contain"></canvas>
        </div>
    </div>
`;
html = html.replace('<!-- MAIN SCRIPT -->', modalHTML + '\n    <!-- MAIN SCRIPT -->');

fs.writeFileSync('popup/popup.html', html);
console.log('Patched popup.html perfectly.');
