const fs = require('fs');
let content = fs.readFileSync('background/service-worker.js', 'utf8');
content = content.replace('function broadcastToPopup(type, payload) {', 'function broadcastToPopup(type, payload) {\n  payload = payload || {};\n  if (activeTabId) payload.activeTabId = activeTabId;');
fs.writeFileSync('background/service-worker.js', content);
