const fs = require('fs');
let code = fs.readFileSync('background/service-worker.js', 'utf8');
code = code.replace(/import\s+\{[\s\S]*?\}\s+from\s+['"].*?['"];/g, '');
try {
  new (require('vm').Script)(code);
  console.log('OK');
} catch (e) {
  console.log('Error:', e);
}
