const fs = require('fs');
let content = fs.readFileSync('background/service-worker.js', 'utf8');

content = content.replace(/activeCaptureEngine\s*=\s*null;\s*activeTabId\s*=\s*null;/g, 'activeCaptureEngines.delete(tab.id); if (activeTabId === tab.id) activeTabId = null;');

content = content.replace(/await\s+activeCaptureEngine\.stopScreencast\(\);\s*activeCaptureEngine\s*=\s*null;/g, 'await activeCaptureEngine.stopScreencast(); activeCaptureEngines.delete(tabId);');

fs.writeFileSync('background/service-worker.js', content);
