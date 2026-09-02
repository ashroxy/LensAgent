const fs = require('fs');
let content = fs.readFileSync('lib/agent-loop.js', 'utf8');

content = content.replace(
  'this.captureEngine   = config.captureEngine;',
  'this.captureEngine   = config.captureEngine;\n    this.tabId = config.tabId;'
);

fs.writeFileSync('lib/agent-loop.js', content);
