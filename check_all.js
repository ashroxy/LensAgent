const fs = require('fs');
const path = require('path');
function walk(dir) {
  for (const file of fs.readdirSync(dir)) {
    if (['node_modules', '.git'].includes(file)) continue;
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) walk(fullPath);
    else if (fullPath.endsWith('.js') || fullPath.endsWith('.html') || fullPath.endsWith('.md')) {
      const content = fs.readFileSync(fullPath, 'utf8');
      if (content.includes('-') || content.includes('-') || content.includes('A\ufffd,\ufffd??')) {
        console.log('CORRUPTED:', fullPath);
      }
    }
  }
}
walk('e:/SIH-171');
console.log('Done scanning.');
