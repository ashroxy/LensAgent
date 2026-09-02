const fs = require('fs');
let content = fs.readFileSync('background/service-worker.js', 'utf8');

// 1. Replace globals
content = content.replace(
  'let activeAgent = null;',
  'const activeAgents = new Map();'
);
content = content.replace(
  'let activeCaptureEngine = null;',
  'const activeCaptureEngines = new Map();'
);

// 2. Fix Offscreen Crash recovery
content = content.replace(
  /if \(activeAgent && activeAgent\.state === AgentState\.RUNNING\) \{\s+activeAgent\.pause\(\);\s+\}/g,
  'for (const agent of activeAgents.values()) { if (agent.state === AgentState.RUNNING) agent.pause(); }'
);

// 3. Fix Tab change detection
content = content.replace(
  /chrome\.tabs\.onActivated\.addListener\(\(activeInfo\) => \{\s+if \(activeAgent && activeAgent\.state === AgentState\.RUNNING && activeTabId\) \{\s+if \(activeInfo\.tabId !== activeTabId\) \{\s+\/\/ User switched to a different tab - don't auto-stop, just note it\s+console\.log\("\[SW\] User switched tabs during agent run\. Agent continues on original tab\."\);\s+\}\s+\}\s+\}\);/g,
  'chrome.tabs.onActivated.addListener((activeInfo) => { if (activeAgents.has(activeInfo.tabId)) activeTabId = activeInfo.tabId; });'
);

content = content.replace(
  /chrome\.tabs\.onRemoved\.addListener\(\(tabId\) => \{\s+if \(tabId === activeTabId && activeAgent\) \{\s+console\.warn\("\[SW\] Active tab closed\. Stopping agent\."\);\s+handleStopAgent\("TAB_CLOSED"\);\s+\}\s+\}\);/g,
  'chrome.tabs.onRemoved.addListener((tabId) => { if (activeAgents.has(tabId)) { console.warn("[SW] Tab closed. Stopping agent."); handleStopAgent("TAB_CLOSED", tabId); } });'
);

// 4. Message handlers
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
  /case POPUP_HITL_RESPONSE:\s+if \(activeAgent\) activeAgent\.handleHitlResponse\(msg\);/g,
  'case POPUP_HITL_RESPONSE:\n      if (msg.targetTabId && activeAgents.has(msg.targetTabId)) activeAgents.get(msg.targetTabId).handleHitlResponse(msg);'
);
content = content.replace(
  /case POPUP_APPROVAL_RESPONSE:\s+if \(activeAgent\) activeAgent\.handleApprovalResponse\(msg\);/g,
  'case POPUP_APPROVAL_RESPONSE:\n      if (msg.targetTabId && activeAgents.has(msg.targetTabId)) activeAgents.get(msg.targetTabId).handleApprovalResponse(msg);'
);
content = content.replace(
  'case POPUP_CLEAR_HISTORY:\n      storage.clearHistory().then(() => sendResponse({ status: "OK" }));',
  'case POPUP_CLEAR_HISTORY:\n      storage.clearHistory(msg.targetTabId).then(() => sendResponse({ status: "OK" }));'
);

// 5. handleStartAgent
content = content.replace(
  /if \(activeAgent && activeAgent\.state === AgentState\.RUNNING\) \{\s+return \{ status: "ERROR", error: "An agent session is already running\. Stop it first\." \};\s+\}/g,
  ''
);
content = content.replace(
  'if (!tab?.id) return { status: "ERROR", error: "No automatable browser tab found. Please open a web page first." };',
  'if (!tab?.id) return { status: "ERROR", error: "No automatable browser tab found. Please open a web page first." };\n    if (activeAgents.has(tab.id) && activeAgents.get(tab.id).state === AgentState.RUNNING) return { status: "ERROR", error: "An agent is already running on this tab." };'
);
content = content.replace(
  /const captureEngine = new CaptureEngine\(tab\.id\);\s+activeCaptureEngine = captureEngine;\s+const actionExecutor = new ActionExecutor\(tab\.id\);\s+activeAgent = new AgentLoop\(\{\s+captureEngine,\s+actionExecutor,\s+settings,\s+vaultManager,\s+offscreenPort,\s+tabId: tab\.id\s+\}\);\s+activeTabId = tab\.id;\s+await activeAgent\.start\(goal\.trim\(\)\);/g,
  'const captureEngine = new CaptureEngine(tab.id);\n    activeCaptureEngines.set(tab.id, captureEngine);\n    const actionExecutor = new ActionExecutor(tab.id);\n    const agent = new AgentLoop({\n      captureEngine,\n      actionExecutor,\n      settings,\n      vaultManager,\n      offscreenPort,\n      tabId: tab.id\n    });\n    activeAgents.set(tab.id, agent);\n    activeTabId = tab.id;\n    await agent.start(goal.trim());'
);

// 6. handleStopAgent
content = content.replace(
  'async function handleStopAgent(reason = "USER_STOPPED") {',
  'async function handleStopAgent(reason = "USER_STOPPED", tabId = null) {\n  if (!tabId && activeTabId) tabId = activeTabId;\n  const agent = activeAgents.get(tabId);\n  const captureEngine = activeCaptureEngines.get(tabId);'
);
content = content.replace(
  /if \(!activeAgent \|\| activeAgent\.state === AgentState\.IDLE\) return \{ status: "OK", state: AgentState\.IDLE \};/g,
  'if (!agent || agent.state === AgentState.IDLE) return { status: "OK", state: AgentState.IDLE };'
);
content = content.replace(
  /if \(activeAgent\) \{\s+await activeAgent\.stop\(reason\);\s+activeAgent = null;\s+\}/g,
  'if (agent) {\n      await agent.stop(reason);\n      activeAgents.delete(tabId);\n    }'
);
content = content.replace(
  /if \(activeCaptureEngine\) \{\s+await activeCaptureEngine\.stopScreencast\(\);\s+activeCaptureEngine = null;\s+\}/g,
  'if (captureEngine) {\n      await captureEngine.stopScreencast();\n      activeCaptureEngines.delete(tabId);\n    }'
);
content = content.replace(
  'activeTabId = null;',
  'if (activeTabId === tabId) activeTabId = null;'
);

// 7. getAgentStatus
content = content.replace(
  /function getAgentStatus\(\) \{\s+if \(activeAgent\) return \{ status: "OK", \.\.\.activeAgent\.getStatus\(\) \};/g,
  'function getAgentStatus(tabId) {\n  const agent = activeAgents.get(tabId);\n  if (agent) return { status: "OK", activeTabId: tabId, ...agent.getStatus() };'
);

fs.writeFileSync('background/service-worker.js', content);
