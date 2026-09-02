const fs = require('fs');
let content = fs.readFileSync('background/service-worker.js', 'utf8');

// Fix 1: offscreenCrash
content = content.replace(
  'if (activeAgent && activeAgent.state === AgentState.RUNNING) {\n    activeAgent.pause();\n  }',
  'for (const agent of activeAgents.values()) { if (agent.state === AgentState.RUNNING) agent.pause(); }'
);

// Fix 2: port onDisconnect crash
content = content.replace(
  'if (activeAgent && activeAgent.state === AgentState.RUNNING) {\n          activeAgent.pause();\n        }',
  'for (const agent of activeAgents.values()) { if (agent.state === AgentState.RUNNING) agent.pause(); }'
);

// Fix 3: chrome.tabs.onActivated
content = content.replace(
  'if (activeAgent && activeAgent.state === AgentState.RUNNING && activeTabId) {\n    if (activeInfo.tabId !== activeTabId) {\n      // User switched to a different tab - don\'t auto-stop, just note it\n      console.log("[SW] User switched tabs during agent run. Agent continues on original tab.");\n    }\n  }',
  'if (activeAgents.has(activeInfo.tabId)) { activeTabId = activeInfo.tabId; }'
);

// Fix 4: chrome.tabs.onRemoved
content = content.replace(
  'if (tabId === activeTabId && activeAgent) {\n    console.warn("[SW] Active tab closed. Stopping agent.");\n    handleStopAgent("TAB_CLOSED");\n  }',
  'if (activeAgents.has(tabId)) { handleStopAgent("TAB_CLOSED", tabId); }'
);

// Fix 5: POPUP_GET_STATUS
content = content.replace(
  'sendResponse(getAgentStatus());',
  'sendResponse(getAgentStatus(msg.targetTabId));'
);

// Fix 6: POPUP_STOP_AGENT
content = content.replace(
  'handleStopAgent("USER_STOPPED").then(sendResponse);',
  'handleStopAgent("USER_STOPPED", msg.targetTabId).then(sendResponse);'
);

// Fix 7: POPUP_GET_HISTORY
content = content.replace(
  'storage.loadHistory().then(sendResponse);',
  'storage.loadHistory(msg.targetTabId).then(sendResponse);'
);

// Fix 8: POPUP_EXPORT_LOG
content = content.replace(
  'storage.exportLogsAsText().then((text) => sendResponse({ text }));',
  'storage.exportLogsAsText(msg.targetTabId).then((text) => sendResponse({ text }));'
);

// Fix 9: POPUP_HITL_RESPONSE
content = content.replace(
  'if (activeAgent) activeAgent.handleHitlResponse(msg);',
  'if (msg.targetTabId && activeAgents.has(msg.targetTabId)) activeAgents.get(msg.targetTabId).handleHitlResponse(msg);'
);

// Fix 10: POPUP_APPROVAL_RESPONSE
content = content.replace(
  'if (activeAgent) activeAgent.handleApprovalResponse(msg);',
  'if (msg.targetTabId && activeAgents.has(msg.targetTabId)) activeAgents.get(msg.targetTabId).handleApprovalResponse(msg);'
);

// Fix 11: POPUP_CLEAR_HISTORY
content = content.replace(
  'storage.clearHistory().then(() => sendResponse({ status: "OK" }));',
  'storage.clearHistory(msg.targetTabId).then(() => sendResponse({ status: "OK" }));'
);

// Fix 12: handleStartAgent multi-session
content = content.replace(
  'if (activeAgent && activeAgent.state === AgentState.RUNNING) {\n      return { status: "ERROR", error: "An agent session is already running. Stop it first." };\n    }',
  ''
);

// Fix 13: tab id validation
content = content.replace(
  'if (!tab?.id) return { status: "ERROR", error: "No automatable browser tab found. Please open a web page first." };',
  'if (!tab?.id) return { status: "ERROR", error: "No automatable browser tab found. Please open a web page first." };\n    if (activeAgents.has(tab.id) && activeAgents.get(tab.id).state === AgentState.RUNNING) return { status: "ERROR", error: "An agent is already running on this tab." };'
);

// Fix 14: ensureOffscreenDocument cleanup (where it paused the global agent before)
content = content.replace(
  'if (activeAgent) activeAgent.pause();',
  '/* removed activeAgent.pause() since handled individually now */'
);

// Fix 15: Start agent map assignment
content = content.replace(
  'activeCaptureEngine = captureEngine;',
  'activeCaptureEngines.set(tab.id, captureEngine);'
);

// Fix 16: handleStopAgent signature and lookup
content = content.replace(
  'async function handleStopAgent(reason = "USER_STOPPED") {',
  'async function handleStopAgent(reason = "USER_STOPPED", tabId = null) {\n  if (!tabId && activeTabId) tabId = activeTabId;\n  const activeAgent = activeAgents.get(tabId);\n  const activeCaptureEngine = activeCaptureEngines.get(tabId);'
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

// Fix 17: getAgentStatus signature and lookup
content = content.replace(
  'function getAgentStatus() {\n  if (activeAgent) return { status: "OK", ...activeAgent.getStatus() };',
  'function getAgentStatus(tabId) {\n  const activeAgent = activeAgents.get(tabId);\n  if (activeAgent) return { status: "OK", activeTabId: tabId, ...activeAgent.getStatus() };'
);

fs.writeFileSync('background/service-worker.js', content);
