const fs = require('fs');
let content = fs.readFileSync('lib/capture.js', 'utf8');
content = content.replace('_onScreencastFrame(params) {', 'async _onScreencastFrame(params) {');
content = content.replace('const buffer = this._base64ToArrayBuffer(data);', 'const res = await fetch(data:image/jpeg;base64,\);\n    const buffer = await res.arrayBuffer();');
fs.writeFileSync('lib/capture.js', content);
console.log('patched');
