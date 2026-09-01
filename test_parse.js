const fs = require('fs');
let js = fs.readFileSync('popup/popup.js', 'utf8');
js = js.replace(/import\s+\{[\s\S]*?\}\s+from\s+['"].*?['"];/g, '');
try {
  new (require('vm').Script)(js);
  console.log('OK');
} catch(e) {
  console.log(e);
}
