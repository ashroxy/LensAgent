const fs = require('fs');
let content = fs.readFileSync('lib/agent-loop.js', 'utf8');

content = content.replace(/storage\.saveSession\(\{/g, 'storage.saveSession(this.tabId, {');
content = content.replace(/storage\.resetMetrics\(\)/g, 'storage.resetMetrics(this.tabId)');
content = content.replace(/storage\.appendLog\(/g, 'storage.appendLog(this.tabId, ');
content = content.replace(/storage\.addHistoryEntry\(\{/g, 'storage.addHistoryEntry(this.tabId, {');
content = content.replace(/storage\.sessionSet\(\{ agentState: (.*?) \}\)/g, 'storage.sessionSet({ [`agentState_${this.tabId}`]: $1 })');
content = content.replace(/storage\.sessionSet\(\{ stepCount: (.*?) \}\)/g, 'storage.sessionSet({ [`stepCount_${this.tabId}`]: $1 })');
content = content.replace(/storage\.incrementMetric\(/g, 'storage.incrementMetric(this.tabId, ');
content = content.replace(/storage\.recordCycleLatency\(/g, 'storage.recordCycleLatency(this.tabId, ');

fs.writeFileSync('lib/agent-loop.js', content);
