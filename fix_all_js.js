const fs = require('fs');
const path = require('path');
function walk(dir) {
  for (const file of fs.readdirSync(dir)) {
    if (['node_modules', '.git'].includes(file)) continue;
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) walk(fullPath);
    else if (fullPath.endsWith('.js') || fullPath.endsWith('.html') || fullPath.endsWith('.md') || fullPath.endsWith('.json')) {
      let content = fs.readFileSync(fullPath, 'utf8');
      let original = content;
      content = content.replace(/A\ufffd,\ufffd\?\?/g, '-');
      content = content.replace(/-/g, '-');
      content = content.replace(/-/g, '-');
      content = content.replace(/-/g, '-');
      content = content.replace(/A\ufffd\?\?\ufffd,\ufffd.*/g, ''); // decorative comments
      if (content !== original) {
        fs.writeFileSync(fullPath, content, 'utf8');
        console.log('Fixed', fullPath);
      }
    }
  }
}
walk('e:/SIH-171');
console.log('Done fixing.');
