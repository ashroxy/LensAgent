const fs = require('fs');
let content = fs.readFileSync('background/service-worker.js', 'utf8');

content = content.replace('let activeAgent = null;', 'const activeAgents = new Map();');
content = content.replace('let activeCaptureEngine = null;', 'const activeCaptureEngines = new Map();');

content = content.replace(
  'if (activeAgent && activeAgent.state === AgentState.RUNNING) {',
  'for (const agent of activeAgents.values()) { if (agent.state === AgentState.RUNNING) agent.pause(); } if (false) {'
);

content = content.replace(
  'if (activeAgent && activeAgent.state === AgentState.RUNNING && activeTabId) {',
  'if (activeAgents.has(activeInfo.tabId)) { activeTabId = activeInfo.tabId; } if (false) {'
);

content = content.replace(
  'if (tabId === activeTabId && activeAgent) {',
  'if (activeAgents.has(tabId)) {'
);
content = content.replace('handleStopAgent("TAB_CLOSED");', 'handleStopAgent("TAB_CLOSED", tabId);');

content = content.replace('sendResponse(getAgentStatus());', 'sendResponse(getAgentStatus(msg.targetTabId));');
content = content.replace('handleStopAgent("USER_STOPPED").then(sendResponse);', 'handleStopAgent("USER_STOPPED", msg.targetTabId).then(sendResponse);');
content = content.replace('storage.loadHistory().then(sendResponse);', 'storage.loadHistory(msg.targetTabId).then(sendResponse);');
content = content.replace('storage.exportLogsAsText().then((text) => sendResponse({ text }));', 'storage.exportLogsAsText(msg.targetTabId).then((text) => sendResponse({ text }));');
content = content.replace('if (activeAgent) activeAgent.handleHitlResponse(msg);', 'if (msg.targetTabId && activeAgents.has(msg.targetTabId)) activeAgents.get(msg.targetTabId).handleHitlResponse(msg);');
content = content.replace('if (activeAgent) activeAgent.handleApprovalResponse(msg);', 'if (msg.targetTabId && activeAgents.has(msg.targetTabId)) activeAgents.get(msg.targetTabId).handleApprovalResponse(msg);');
content = content.replace('storage.clearHistory().then(() => sendResponse({ status: "OK" }));', 'storage.clearHistory(msg.targetTabId).then(() => sendResponse({ status: "OK" }));');

content = content.replace(
  'if (activeAgent && activeAgent.state === AgentState.RUNNING) {\n      return { status: "ERROR", error: "An agent session is already running. Stop it first." };\n    }',
  ''
);

content = content.replace(
  'if (!tab?.id) return { status: "ERROR", error: "No automatable browser tab found. Please open a web page first." };',
  'if (!tab?.id) return { status: "ERROR", error: "No automatable browser tab found. Please open a web page first." };\n    if (activeAgents.has(tab.id) && activeAgents.get(tab.id).state === AgentState.RUNNING) return { status: "ERROR", error: "An agent is already running on this tab." };'
);

content = content.replace(
  'activeCaptureEngine = captureEngine;',
  'activeCaptureEngines.set(tab.id, captureEngine);'
);

content = content.replace(
  'activeAgent = new AgentLoop({',
  'const activeAgent = new AgentLoop({'
);

content = content.replace(
  'await activeAgent.start(goal.trim());',
  'activeAgents.set(tab.id, activeAgent);\n    await activeAgent.start(goal.trim());'
);

content = content.replace(
  'async function handleStopAgent(reason = "USER_STOPPED") {',
  'async function handleStopAgent(reason = "USER_STOPPED", tabId = null) {\n    if (!tabId && activeTabId) tabId = activeTabId;\n    const activeAgent = activeAgents.get(tabId);\n    const activeCaptureEngine = activeCaptureEngines.get(tabId);'
);

content = content.replace(
  '      activeAgent = null;\n    }',
  '      activeAgents.delete(tabId);\n    }'
);

content = content.replace(
  '      activeCaptureEngine = null;\n    }',
  '      activeCaptureEngines.delete(tabId);\n    }'
);

content = content.replace(
  '    activeTabId = null;\n\n    broadcastToPopup',
  '    if (activeTabId === tabId) activeTabId = null;\n\n    broadcastToPopup'
);

content = content.replace(
  'function getAgentStatus() {\n  if (activeAgent) return { status: "OK", ...activeAgent.getStatus() };',
  'function getAgentStatus(tabId) {\n  const activeAgent = activeAgents.get(tabId);\n  if (activeAgent) return { status: "OK", activeTabId: tabId, ...activeAgent.getStatus() };'
);

fs.writeFileSync('background/service-worker.js', content);
