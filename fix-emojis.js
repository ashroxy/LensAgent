-const fs = require('fs');
let js = fs.readFileSync('e:/SIH-171/popup/popup.js', 'utf8');
js = js.replace(/if \(settingsMsg\) settingsMsg\.textContent = "[^"]*Settings saved\.";/g, 'if (settingsMsg) settingsMsg.textContent = "\\u2705 Settings saved.";');
js = js.replace(/if \(settingsMsg\) settingsMsg\.textContent = "[^"]*Settings reset to defaults\.";/g, 'if (settingsMsg) settingsMsg.textContent = "\\u21A9\\uFE0F Settings reset to defaults.";');
fs.writeFileSync('e:/SIH-171/popup/popup.js', js, 'utf8');
console.log('Fixed emojis');
