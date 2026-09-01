const fs = require('fs');
let code = fs.readFileSync('e:/SIH-171/popup/popup.js', 'utf8');

// Fix variable shadowing for fullscreen elements
code = code.replace(/const btnRawFullscreen = document\.getElementById\("btnRawFullscreen"\);/g, 'const myBtnRawFullscreen = document.getElementById("btnRawFullscreen");');
code = code.replace(/const btnSanitizedFullscreen = document\.getElementById\("btnSanitizedFullscreen"\);/g, 'const myBtnSanitizedFullscreen = document.getElementById("btnSanitizedFullscreen");');
code = code.replace(/const fullscreenModal = document\.getElementById\("fullscreenModal"\);/g, 'const myFullscreenModal = document.getElementById("fullscreenModal");');
code = code.replace(/const btnCloseModal = document\.getElementById\("btnCloseModal"\);/g, 'const myBtnCloseModal = document.getElementById("btnCloseModal");');
code = code.replace(/const modalFeed = document\.getElementById\("modalFeed"\);/g, '/* removed */\nconst myModalFeed = document.getElementById("modalFeed");');

// Fix event listeners for fullscreen elements
code = code.replace(/if \(btnRawFullscreen\) \{/g, 'if (myBtnRawFullscreen) {');
code = code.replace(/btnRawFullscreen\.addEventListener/g, 'myBtnRawFullscreen.addEventListener');
code = code.replace(/if \(btnSanitizedFullscreen\) \{/g, 'if (myBtnSanitizedFullscreen) {');
code = code.replace(/btnSanitizedFullscreen\.addEventListener/g, 'myBtnSanitizedFullscreen.addEventListener');
code = code.replace(/if \(btnCloseModal\) \{/g, 'if (myBtnCloseModal) {');
code = code.replace(/btnCloseModal\.addEventListener/g, 'myBtnCloseModal.addEventListener');
code = code.replace(/fullscreenModal\./g, 'myFullscreenModal.');
code = code.replace(/modalFeed\.src/g, 'myModalFeed.src');

// Fix modal headers
code = code.replace(/modalTitle\.innerHTML = "<span class=\\"material-symbols-outlined text-primary\\">visibility<\\/span> Raw Viewport - Fullscreen";/g, 'modalTitle.innerHTML = \'<span class="material-symbols-outlined text-primary text-[24px]">visibility</span> <span>Raw Viewport - Fullscreen</span>\';');
code = code.replace(/modalTitle\.innerHTML = "<span class=\\"material-symbols-outlined text-primary\\">security<\\/span> Sanitized Stream - Fullscreen";/g, 'modalTitle.innerHTML = \'<span class="material-symbols-outlined text-primary text-[24px]">security</span> <span>Sanitized Stream - Fullscreen</span>\';');

fs.writeFileSync('e:/SIH-171/popup/popup.js', code, 'utf8');
