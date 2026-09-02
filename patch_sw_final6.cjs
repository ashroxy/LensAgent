const fs = require('fs');
let content = fs.readFileSync('background/service-worker.js', 'utf8');

content = content.replace(
  'enableAuditStream: settings.enableAuditStream,',
  'enableAuditStream: settings.enableAuditStream,\n        tabId: tab.id,'
);

fs.writeFileSync('background/service-worker.js', content);
