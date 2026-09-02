const fs = require('fs');
let content = fs.readFileSync('background/service-worker.js', 'utf8');

content = content.replace(
  'await activeAgent.start(goal.trim());',
  'activeAgents.set(tab.id, activeAgent);\n    await activeAgent.start(goal.trim());'
);

fs.writeFileSync('background/service-worker.js', content);
