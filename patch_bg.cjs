const fs = require('fs');
let content = fs.readFileSync('background/service-worker.js', 'utf8');
content = content.replace('function getAgentStatus() {', 'function getAgentStatus() {\n  if (activeAgent) return { status: "OK", activeTabId, ...activeAgent.getStatus() };');
content = content.replace('if (activeAgent) return { status: "OK", ...activeAgent.getStatus() };', '');
fs.writeFileSync('background/service-worker.js', content);
