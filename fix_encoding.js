const fs = require('fs');
const files = [
  'e:/SIH-171/popup/popup.js', 
  'e:/SIH-171/background/service-worker.js', 
  'e:/SIH-171/offscreen/offscreen.js',
  'e:/SIH-171/lib/agent-loop.js'
];
for (const file of files) {
  let content = fs.readFileSync(file, 'utf8');
  content = content.replace(/A\ufffd,\ufffd\?\?/g, '-');
  content = content.replace(/-/g, '-');
  content = content.replace(/-/g, '-');
  content = content.replace(/-/g, '');
  content = content.replace(/-/g, '-');
  fs.writeFileSync(file, content, 'utf8');
}
console.log('Done');
