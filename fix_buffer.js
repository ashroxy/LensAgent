const fs = require('fs');
const path = require('path');

function replaceBuffer(buf, search, replace) {
  let offset = 0;
  let result = Buffer.alloc(0);
  
  while (true) {
    let index = buf.indexOf(search, offset);
    if (index === -1) {
      result = Buffer.concat([result, buf.subarray(offset)]);
      break;
    }
    result = Buffer.concat([result, buf.subarray(offset, index), replace]);
    offset = index + search.length;
  }
  return result;
}

function walkAndFix(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    if (['node_modules', '.git', 'testing', 'assets'].includes(file)) continue;
    const fullPath = path.join(dir, file);
    
    if (fs.statSync(fullPath).isDirectory()) {
      walkAndFix(fullPath);
    } else {
      if (/\.(js|html|css|json|md)$/.test(file)) {
        const originalBuf = fs.readFileSync(fullPath);
        let buf = originalBuf;
        
        // Target 1: - (c3 a2 e2 82 ac e2 80 9d)
        buf = replaceBuffer(buf, Buffer.from('c3a2e282ace2809d', 'hex'), Buffer.from('-', 'utf8'));
        
        // Target 2: - (if it's c3 a2 e2 80 94)
        buf = replaceBuffer(buf, Buffer.from('c3a2e28094', 'hex'), Buffer.from('-', 'utf8'));

        // Target 3: - (c383c2a2e2809ae2809ac293e2809c) or whatever double encoding it is
        // Let's just match the UTF-8 bytes for the string "-"
        buf = replaceBuffer(buf, Buffer.from('-', 'utf8'), Buffer.from('-', 'utf8'));
        buf = replaceBuffer(buf, Buffer.from('-', 'utf8'), Buffer.from('-', 'utf8'));
        buf = replaceBuffer(buf, Buffer.from('-', 'utf8'), Buffer.from('-', 'utf8'));
        buf = replaceBuffer(buf, Buffer.from('-', 'utf8'), Buffer.from('-', 'utf8'));
        buf = replaceBuffer(buf, Buffer.from('-', 'utf8'), Buffer.from('-', 'utf8'));

        if (!buf.equals(originalBuf)) {
          fs.writeFileSync(fullPath, buf);
          console.log('Fixed bytes in: ' + fullPath);
        }
      }
    }
  }
}

walkAndFix('e:/SIH-171');
console.log('Global Byte-Level Fix Complete');
