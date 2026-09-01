const fs = require('fs');
const js = fs.readFileSync('popup/popup.js', 'utf8');
const ids = [...js.matchAll(/\$\(\"([a-zA-Z0-9_-]+)\"\)/g)].map(m => m[1]);
const html = fs.readFileSync('popup/popup.html', 'utf8');
const missing = ids.filter(id => !html.includes('id="' + id + '"'));
console.log('Missing IDs in HTML:', Array.from(new Set(missing)));
