const fs = require('fs');
const file = 'e:/SIH-171/popup/popup.js';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(/const btnRawFullscreen = document.getElementById\("btnRawFullscreen"\);/g, 'const myBtnRawFullscreen = document.getElementById("btnRawFullscreen");');
content = content.replace(/const btnSanitizedFullscreen = document.getElementById\("btnSanitizedFullscreen"\);/g, 'const myBtnSanitizedFullscreen = document.getElementById("btnSanitizedFullscreen");');
content = content.replace(/const fullscreenModal = document.getElementById\("fullscreenModal"\);/g, 'const myFullscreenModal = document.getElementById("fullscreenModal");');
content = content.replace(/const btnCloseModal = document.getElementById\("btnCloseModal"\);/g, 'const myBtnCloseModal = document.getElementById("btnCloseModal");');
content = content.replace(/const modalTitle = document.getElementById\("modalTitle"\);/g, '/* removed */');
content = content.replace(/const modalFeed = document.getElementById\("modalFeed"\);/g, 'const myModalFeed = document.getElementById("modalFeed");');

content = content.replace(/if \(btnRawFullscreen\)/g, 'if (myBtnRawFullscreen)');
content = content.replace(/btnRawFullscreen\.addEventListener/g, 'myBtnRawFullscreen.addEventListener');

content = content.replace(/if \(btnSanitizedFullscreen\)/g, 'if (myBtnSanitizedFullscreen)');
content = content.replace(/btnSanitizedFullscreen\.addEventListener/g, 'myBtnSanitizedFullscreen.addEventListener');

content = content.replace(/if \(btnCloseModal\)/g, 'if (myBtnCloseModal)');
content = content.replace(/btnCloseModal\.addEventListener/g, 'myBtnCloseModal.addEventListener');

content = content.replace(/fullscreenModal\.classList/g, 'myFullscreenModal.classList');
content = content.replace(/modalFeed\.src/g, 'myModalFeed.src');

content = content.replace(/<span class=\\"material-symbols-outlined text-primary\\">visibility<\/span> Raw Viewport - Fullscreen/g, '<span class=\\"material-symbols-outlined text-primary text-[24px]\\">visibility</span> <span>Raw Viewport - Fullscreen</span>');
content = content.replace(/<span class=\\"material-symbols-outlined text-primary\\">security<\/span> Sanitized Stream - Fullscreen/g, '<span class=\\"material-symbols-outlined text-primary text-[24px]\\">security</span> <span>Sanitized Stream - Fullscreen</span>');
content = content.replace(/<span class="material-symbols-outlined text-sm">visibility<\/span> Raw Viewport - Fullscreen/g, '<span class="material-symbols-outlined text-[24px]">visibility</span> <span>Raw Viewport - Fullscreen</span>');
content = content.replace(/<span class="material-symbols-outlined text-sm">shield_locked<\/span> Sanitized Stream - Fullscreen/g, '<span class="material-symbols-outlined text-[24px]">shield_locked</span> <span>Sanitized Stream - Fullscreen</span>');

content = content.replace(/settingsMsg\.textContent = "[^"]*Settings reset to defaults\.";/g, 'settingsMsg.textContent = "\\u21BA Settings reset to defaults.";');

fs.writeFileSync(file, content, 'utf8');
console.log('Done');
