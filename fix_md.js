const fs = require('fs');
const files = ['e:/SIH-171/README.md', 'e:/SIH-171/rubrics/SIH_EVALUATION_TRACKER.md'];
for (const file of files) {
  let c = fs.readFileSync(file, 'utf8');
  let original = c;
  c = c.replace(/LensAgent.*Privacy/, 'LensAgent - Privacy');
  c = c.replace(/A\ufffd,\ufffd\?\?/g, '-');
  c = c.replace(/-/g, '-');
  c = c.replace(/-/g, '-');
  c = c.replace(/-/g, '-');
  c = c.replace(/-/g, '=');
  c = c.replace(/-/g, '');
  if (c !== original) {
    fs.writeFileSync(file, c, 'utf8');
    console.log('Fixed ' + file);
  }
}
console.log('Done');
