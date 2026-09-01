const fs = require('fs');
let content = fs.readFileSync('lib/capture.js', 'utf8');
content = content.replace(/const res = await fetch\\(.*\\);/, 'const res = await fetch(\data:image/jpeg;base64,\\);');
fs.writeFileSync('lib/capture.js', content);
console.log('patched');
