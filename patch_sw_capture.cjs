const fs = require('fs');
let content = fs.readFileSync('background/service-worker.js', 'utf8');

content = content.replace(
  'activeCaptureEngine = null;\\r\\n        activeTabId = null;',
  'activeCaptureEngines.delete(tab.id);\\r\\n        if (activeTabId === tab.id) activeTabId = null;'
);
content = content.replace(
  'activeCaptureEngine = null;\\n        activeTabId = null;',
  'activeCaptureEngines.delete(tab.id);\\n        if (activeTabId === tab.id) activeTabId = null;'
);

content = content.replace(
  'await activeCaptureEngine.stopScreencast();\\r\\n      activeCaptureEngine = null;',
  'await activeCaptureEngine.stopScreencast();\\r\\n      activeCaptureEngines.delete(tabId);'
);
content = content.replace(
  'await activeCaptureEngine.stopScreencast();\\n      activeCaptureEngine = null;',
  'await activeCaptureEngine.stopScreencast();\\n      activeCaptureEngines.delete(tabId);'
);

fs.writeFileSync('background/service-worker.js', content);
