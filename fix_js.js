const fs = require('fs');
const files = ['e:/SIH-171/lib/agent-loop.js', 'e:/SIH-171/popup/popup.js', 'e:/SIH-171/popup/popup.html', 'e:/SIH-171/background/service-worker.js'];
for (const file of files) {
  let c = fs.readFileSync(file, 'utf8');
  let original = c;
  c = c.replace(/A\ufffd,\ufffd\?\?/g, '-');
  c = c.replace(/-/g, '-');
  c = c.replace(/-/g, '-');
  c = c.replace(/-/g, '-');
  if (c !== original) {
    fs.writeFileSync(file, c, 'utf8');
    console.log('Fixed ' + file);
  }
}
console.log('Done');
