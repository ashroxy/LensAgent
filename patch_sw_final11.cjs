const fs = require('fs');
let content = fs.readFileSync('background/service-worker.js', 'utf8');

content = content.replace(/if\s*\\(activeAgent\s*&&\s*activeAgent\\.state\s*===\s*AgentState\\.RUNNING\\)\s*\\{\\s*activeAgent\\.pause\\(\\);\\s*\\}/, 'for (const agent of activeAgents.values()) { if (agent.state === AgentState.RUNNING) agent.pause(); }');

content = content.replace(/if\s*\\(activeAgent\s*&&\s*activeAgent\\.state\s*===\s*AgentState\\.RUNNING\\)\s*\\{\\s*return\s*\\{\s*status:\s*"ERROR",\s*error:\s*"An agent session is already running\\.\s*Stop it first\\."\s*\\};\\s*\\}/, '');

fs.writeFileSync('background/service-worker.js', content);
