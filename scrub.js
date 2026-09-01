const fs = require('fs');
const path = require('path');
function walk(dir) {
  for (const file of fs.readdirSync(dir)) {
    if (['node_modules', '.git'].includes(file)) continue;
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) walk(fullPath);
    else if (fullPath.endsWith('.js') || fullPath.endsWith('.html') || fullPath.endsWith('.md')) {
      let content = fs.readFileSync(fullPath, 'utf8');
      let original = content;
      
      // Remove any lines that are just huge corrupted comment blocks
      content = content.replace(/^\/\/ [A-Z\-\?]+[\s\S]*?\n/gm, '');
      content = content.replace(/^\/\/.*A-A\?.*/gm, '');
      
      // Clean ANY non-ascii characters (except our emojis)
      // We will replace non-ascii sequences with a space or dash
      let newStr = '';
      let i = 0;
      while (i < content.length) {
        let code = content.charCodeAt(i);
        if (code > 127 && !['?', '??', '?'].includes(content[i])) {
           // check if it's part of a surrogate pair
           if (code >= 0xD800 && code <= 0xDBFF) {
             i++; // skip next char too
           }
           newStr += '-';
        } else {
           newStr += content[i];
        }
        i++;
      }
      
      // Replace consecutive dashes resulting from non-ascii stripping with a single dash
      newStr = newStr.replace(/-+/g, '-');
      
      if (newStr !== original) {
        fs.writeFileSync(fullPath, newStr, 'utf8');
        console.log('Fixed non-ascii in', fullPath);
      }
    }
  }
}
walk('e:/SIH-171');
