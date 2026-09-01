const fs = require('fs');
const path = require('path');

function walk(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    if (file === 'node_modules' || file === '.git' || file.startsWith('.')) continue;
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      walk(fullPath);
    } else {
      if (fullPath.endsWith('.md') || fullPath.endsWith('.json')) {
        let content = fs.readFileSync(fullPath, 'utf8');
        let changed = false;
        
        const c1 = content.replace(/A\ufffd,\ufffd\?\?/g, '-');
        if (c1 !== content) { content = c1; changed = true; }
        
        const c2 = content.replace(/-/g, '-');
        if (c2 !== content) { content = c2; changed = true; }
        
        const c3 = content.replace(/-/g, '-');
        if (c3 !== content) { content = c3; changed = true; }
        
        const c4 = content.replace(/-/g, '-');
        if (c4 !== content) { content = c4; changed = true; }
        
        // Also fix the box drawing characters in README if any
        const c5 = content.replace(/-/g, '-');
        if (c5 !== content) { content = c5; changed = true; }
        
        const c6 = content.replace(/-/g, '');
        if (c6 !== content) { content = c6; changed = true; }
        
        if (changed) {
          fs.writeFileSync(fullPath, content, 'utf8');
          console.log('Fixed', fullPath);
        }
      }
    }
  }
}
walk('e:/SIH-171');
console.log('Done');
