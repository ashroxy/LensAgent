const fs = require('fs');
let content = fs.readFileSync('background/service-worker.js', 'utf8');

content = content.replace(/if \(activeAgent && activeAgent\.state === AgentState\.RUNNING\) \{\s+activeAgent\.pause\(\);\s+\}/g, 'for (const agent of activeAgents.values()) { if (agent.state === AgentState.RUNNING) agent.pause(); }');

content = content.replace(/for \(const agent of activeAgents\.values\(\)\) \{ if \(agent\.state === AgentState\.RUNNING\) agent\.pause\(\); \} if \(false\) \{\s+activeAgent\.pause\(\);\s+\}/g, 'for (const agent of activeAgents.values()) { if (agent.state === AgentState.RUNNING) agent.pause(); }');

content = content.replace(/if \(activeAgent\) return \{ status: "OK", activeTabId, \.\.\.activeAgent\.getStatus\(\) \};/g, 'if (activeAgent) return { status: "OK", activeTabId: tabId, ...activeAgent.getStatus() };');

content = content.replace(/if \(activeAgents\.has\(activeInfo\.tabId\)\) \{ activeTabId = activeInfo\.tabId; \} if \(false\) \{/g, 'if (activeAgents.has(activeInfo.tabId)) { activeTabId = activeInfo.tabId; } \n/* ');

content = content.replace(/console\.log\("\[SW\] User switched tabs during agent run\. Agent continues on original tab\."\);\s+\}\s+\}/g, '*/');

fs.writeFileSync('background/service-worker.js', content);
