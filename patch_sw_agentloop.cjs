const fs = require('fs');
let content = fs.readFileSync('background/service-worker.js', 'utf8');

content = content.replace(
  'activeAgent = new AgentLoop({',
  'activeAgents.set(tab.id, new AgentLoop({'
);

content = content.replace(
  'await activeAgent.start(goal.trim());',
  'await activeAgents.get(tab.id).start(goal.trim());'
);

content = content.replace(
  '      tabId: tab.id\n    });',
  '      tabId: tab.id\n    }));'
);

fs.writeFileSync('background/service-worker.js', content);
