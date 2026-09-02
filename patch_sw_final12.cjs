const fs = require('fs');
let content = fs.readFileSync('background/service-worker.js', 'utf8');

content = content.replace(/if\s*\(\s*activeAgent\s*&&\s*activeAgent\.state\s*===\s*AgentState\.RUNNING\s*\)\s*\{\s*activeAgent\.pause\(\);\s*\}/g, 'for (const agent of activeAgents.values()) { if (agent.state === AgentState.RUNNING) agent.pause(); }');

content = content.replace(/if\s*\(\s*activeAgent\s*&&\s*activeAgent\.state\s*===\s*AgentState\.RUNNING\s*\)\s*\{\s*return\s*\{\s*status:\s*"ERROR",\s*error:\s*"An agent session is already running\.\s*Stop it first\."\s*\};\s*\}/g, '');

content = content.replace(/if\s*\(\s*activeAgent\s*\)\s*activeAgent\.pause\(\);/g, '');

content = content.replace(/if\s*\(\s*activeAgent\s*\)\s*return\s*\{\s*status:\s*"OK",\s*activeTabId,\s*\.\.\.activeAgent\.getStatus\(\)\s*\};/g, 'if (activeAgent) return { status: "OK", activeTabId: tabId, ...activeAgent.getStatus() };');

content = content.replace(/if\s*\(\s*false\s*\)\s*\{\s*activeAgent\.pause\(\);\s*\}/g, '');

fs.writeFileSync('background/service-worker.js', content);
