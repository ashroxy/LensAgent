const fs = require('fs');
let js = fs.readFileSync('popup/popup.js', 'utf8');
js = js.replace("if (raw === null || raw === undefined || raw.trim() === '') return fallback;", 
  "if (raw === null || raw === undefined) return fallback; if (typeof raw === 'string' && raw.trim() === '') return fallback;");
fs.writeFileSync('popup/popup.js', js);
