const fs = require('fs');
let content = fs.readFileSync('background/service-worker.js', 'utf8');

// Fix the offscreen channel disconnect crash
content = content.replace(
  'if (activeAgent && activeAgent.state === AgentState.RUNNING) {\\r\\n          activeAgent.pause();\\r\\n        }',
  'for (const agent of activeAgents.values()) { if (agent.state === AgentState.RUNNING) agent.pause(); }'
);
content = content.replace(
  'if (activeAgent && activeAgent.state === AgentState.RUNNING) {\\n          activeAgent.pause();\\n        }',
  'for (const agent of activeAgents.values()) { if (agent.state === AgentState.RUNNING) agent.pause(); }'
);

// Fix the handleStartAgent crash
content = content.replace(
  'if (activeAgent && activeAgent.state === AgentState.RUNNING) {\\r\\n        return { status: "ERROR", error: "An agent session is already running. Stop it first." };\\r\\n      }',
  ''
);
content = content.replace(
  'if (activeAgent && activeAgent.state === AgentState.RUNNING) {\\n        return { status: "ERROR", error: "An agent session is already running. Stop it first." };\\n      }',
  ''
);

fs.writeFileSync('background/service-worker.js', content);
