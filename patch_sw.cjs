const fs = require('fs');
let content = fs.readFileSync('background/service-worker.js', 'utf8');

// Replace scalar with Map
content = content.replace('let activeAgent = null;', 'const activeAgents = new Map();');
content = content.replace('let activeCaptureEngine = null;', 'const activeCaptureEngines = new Map();');

// getAgentStatus now checks the map
content = content.replace(
  'function getAgentStatus() {\n  if (activeAgent) return { status: "OK", activeTabId, ...activeAgent.getStatus() };',
  'function getAgentStatus(tabId) {\n  const agent = activeAgents.get(tabId);\n  if (agent) return { status: "OK", activeTabId: tabId, ...agent.getStatus() };'
);

// handleStartAgent
content = content.replace(
  'if (activeAgent && activeAgent.state === AgentState.RUNNING) {\n      return { status: "ERROR", error: "An agent session is already running. Stop it first." };\n    }',
  '// Removed global multi-session check to allow per-tab sessions'
);

content = content.replace(
  'if (!tab?.id) return { status: "ERROR", error: "No automatable browser tab found. Please open a web page first." };',
  `if (!tab?.id) return { status: "ERROR", error: "No automatable browser tab found. Please open a web page first." };
    if (activeAgents.has(tab.id) && activeAgents.get(tab.id).state === AgentState.RUNNING) {
      return { status: "ERROR", error: "An agent session is already running on this tab." };
    }`
);

content = content.replace(
  'const captureEngine = new CaptureEngine(tab.id);\n    activeCaptureEngine = captureEngine;\n    activeAgent = new AgentLoop(tab.id, goal, captureEngine, settings, vaultManager, offscreenPort);\n    activeTabId = tab.id;\n\n    await activeAgent.start();',
  'const captureEngine = new CaptureEngine(tab.id);\n    activeCaptureEngines.set(tab.id, captureEngine);\n    const agent = new AgentLoop(tab.id, goal, captureEngine, settings, vaultManager, offscreenPort);\n    activeAgents.set(tab.id, agent);\n    activeTabId = tab.id;\n\n    await agent.start();'
);

// handleStopAgent
content = content.replace(
  'async function handleStopAgent(reason) {',
  'async function handleStopAgent(reason, tabId = null) {'
);

content = content.replace(
  'if (!activeAgent || activeAgent.state === AgentState.IDLE) return { status: "OK", state: AgentState.IDLE };',
  `if (!tabId && activeTabId) tabId = activeTabId;
    const agent = activeAgents.get(tabId);
    if (!agent || agent.state === AgentState.IDLE) return { status: "OK", state: AgentState.IDLE };`
);

content = content.replace(
  'await activeAgent.stop(reason);\n    activeAgent = null;\n    activeCaptureEngine = null;\n    activeTabId = null;',
  'await agent.stop(reason);\n    activeAgents.delete(tabId);\n    activeCaptureEngines.delete(tabId);\n    if (activeTabId === tabId) activeTabId = null;'
);

// chrome.tabs.onRemoved
content = content.replace(
  'if (tabId === activeTabId && activeAgent) {\n    console.warn("[SW] Active tab closed. Stopping agent.");\n    handleStopAgent("TAB_CLOSED");\n  }',
  'if (activeAgents.has(tabId)) {\n    console.warn(`[SW] Tab ${tabId} closed. Stopping its agent.`);\n    handleStopAgent("TAB_CLOSED", tabId);\n  }'
);

// chrome.tabs.onActivated
content = content.replace(
  'if (activeAgent && activeAgent.state === AgentState.RUNNING && activeTabId) {\n    if (activeInfo.tabId !== activeTabId) {',
  'if (activeAgents.has(activeInfo.tabId)) {\n    activeTabId = activeInfo.tabId;\n  }\n  /* Removed warning */\n  if (false) {'
);

// POPUP message handlers
content = content.replace(
  'case POPUP_GET_STATUS:\n      sendResponse(getAgentStatus());',
  'case POPUP_GET_STATUS:\n      sendResponse(getAgentStatus(msg.targetTabId));'
);

content = content.replace(
  'case POPUP_STOP_AGENT:\n      handleStopAgent("USER_STOPPED").then(sendResponse);',
  'case POPUP_STOP_AGENT:\n      handleStopAgent("USER_STOPPED", msg.targetTabId).then(sendResponse);'
);

content = content.replace(
  'case POPUP_GET_HISTORY:\n      storage.loadHistory().then(sendResponse);',
  'case POPUP_GET_HISTORY:\n      storage.loadHistory(msg.targetTabId).then(sendResponse);'
);

content = content.replace(
  'case POPUP_EXPORT_LOG:\n      storage.exportLogsAsText().then((text) => sendResponse({ text }));',
  'case POPUP_EXPORT_LOG:\n      storage.exportLogsAsText(msg.targetTabId).then((text) => sendResponse({ text }));'
);

content = content.replace(
  'case POPUP_HITL_RESPONSE:\n      if (activeAgent) activeAgent.handleHitlResponse(msg);',
  'case POPUP_HITL_RESPONSE:\n      if (msg.targetTabId && activeAgents.has(msg.targetTabId)) activeAgents.get(msg.targetTabId).handleHitlResponse(msg);'
);

content = content.replace(
  'case POPUP_APPROVAL_RESPONSE:\n      if (activeAgent) activeAgent.handleApprovalResponse(msg);',
  'case POPUP_APPROVAL_RESPONSE:\n      if (msg.targetTabId && activeAgents.has(msg.targetTabId)) activeAgents.get(msg.targetTabId).handleApprovalResponse(msg);'
);

content = content.replace(
  'case POPUP_CLEAR_HISTORY:\n      storage.clearHistory().then(() => sendResponse({ status: "OK" }));',
  'case POPUP_CLEAR_HISTORY:\n      storage.clearHistory(msg.targetTabId).then(() => sendResponse({ status: "OK" }));'
);

// Handle crash
content = content.replace(
  'if (activeAgent && activeAgent.state === AgentState.RUNNING) {\n    activeAgent.pause();\n  }',
  'for (const agent of activeAgents.values()) {\n    if (agent.state === AgentState.RUNNING) agent.pause();\n  }'
);

content = content.replace(
  'if (activeAgent && activeAgent.state === AgentState.RUNNING) {\n        activeAgent.pause();\n      }',
  'for (const agent of activeAgents.values()) {\n        if (agent.state === AgentState.RUNNING) agent.pause();\n      }'
);

fs.writeFileSync('background/service-worker.js', content);
