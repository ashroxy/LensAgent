const fs = require('fs');
let content = fs.readFileSync('background/service-worker.js', 'utf8');

content = content.replace(
  'for (const agent of activeAgents.values()) { if (agent.state === AgentState.RUNNING) agent.pause(); } if (false) {\\n    activeAgent.pause();\\n  }',
  'for (const agent of activeAgents.values()) { if (agent.state === AgentState.RUNNING) agent.pause(); }'
);

content = content.replace(
  '        if (activeAgent && activeAgent.state === AgentState.RUNNING) {\\n          activeAgent.pause();\\n        }',
  '        for (const agent of activeAgents.values()) { if (agent.state === AgentState.RUNNING) agent.pause(); }'
);

fs.writeFileSync('background/service-worker.js', content);
