const fs = require('fs');
let content = fs.readFileSync('lib/storage.js', 'utf8');

// We are converting storage.js to accept tabId.
content = content.replace(
  'export async function saveSession({ state, goal, stepCount, tabId, dpr, tabUrl }) {\n  return sessionSet({\n    agentState:   state,\n    currentGoal:  goal,\n    stepCount:    stepCount,\n    activeTabId:  tabId,\n    dpr:          dpr,\n    tabUrl:       tabUrl\n  });\n}',
  'export async function saveSession(tabId, { state, goal, stepCount, dpr, tabUrl }) {\n  return sessionSet({\n    [`agentState_${tabId}`]: state,\n    [`currentGoal_${tabId}`]: goal,\n    [`stepCount_${tabId}`]: stepCount,\n    [`activeTabId_${tabId}`]: tabId,\n    [`dpr_${tabId}`]: dpr,\n    [`tabUrl_${tabId}`]: tabUrl\n  });\n}'
);

content = content.replace(
  'export async function loadSession() {\n  return {\n    agentState: await sessionGet("agentState", AgentState.IDLE),\n    currentGoal: await sessionGet("currentGoal", ""),\n    stepCount: await sessionGet("stepCount", 0),\n    tabId: await sessionGet("activeTabId", null),\n    dpr: await sessionGet("dpr", 1),\n    tabUrl: await sessionGet("tabUrl", ""),\n  };\n}',
  'export async function loadSession(tabId) {\n  return {\n    agentState: await sessionGet(`agentState_${tabId}`, AgentState.IDLE),\n    currentGoal: await sessionGet(`currentGoal_${tabId}`, ""),\n    stepCount: await sessionGet(`stepCount_${tabId}`, 0),\n    tabId: await sessionGet(`activeTabId_${tabId}`, null),\n    dpr: await sessionGet(`dpr_${tabId}`, 1),\n    tabUrl: await sessionGet(`tabUrl_${tabId}`, ""),\n  };\n}'
);

content = content.replace('export async function loadMetrics() {', 'export async function loadMetrics(tabId) {');
content = content.replace('return sessionGet("perfMetrics", { ...EMPTY_METRICS });', 'return sessionGet(`perfMetrics_${tabId}`, { ...EMPTY_METRICS });');

content = content.replace('export async function recordCycleLatency(latencyMs) {', 'export async function recordCycleLatency(tabId, latencyMs) {');
content = content.replace('const m = await loadMetrics();', 'const m = await loadMetrics(tabId);');
content = content.replace('return sessionSet({ perfMetrics: m });', 'return sessionSet({ [`perfMetrics_${tabId}`]: m });');

content = content.replace('export async function incrementMetric(key, by = 1) {', 'export async function incrementMetric(tabId, key, by = 1) {');

content = content.replace('export async function resetMetrics() {', 'export async function resetMetrics(tabId) {');
content = content.replace('return sessionSet({ perfMetrics: { ...EMPTY_METRICS } });', 'return sessionSet({ [`perfMetrics_${tabId}`]: { ...EMPTY_METRICS } });');

content = content.replace('export async function addHistoryEntry(entry) {', 'export async function addHistoryEntry(tabId, entry) {');
content = content.replace('const history = await localGet("sessionHistory", []);', 'const history = await localGet(`sessionHistory_${tabId}`, []);');
content = content.replace('return localSet({ sessionHistory: history });', 'return localSet({ [`sessionHistory_${tabId}`]: history });');

content = content.replace('export async function loadHistory() {', 'export async function loadHistory(tabId) {');
content = content.replace('return localGet("sessionHistory", []);', 'return localGet(`sessionHistory_${tabId}`, []);');

content = content.replace('export async function clearHistory() {', 'export async function clearHistory(tabId) {');
content = content.replace('return localSet({ sessionHistory: [] });', 'return localSet({ [`sessionHistory_${tabId}`]: [] });');

content = content.replace('export async function appendLog(message, type = "info") {', 'export async function appendLog(tabId, message, type = "info") {');
content = content.replace('const logs = await sessionGet("actionLogs", []);', 'const logs = await sessionGet(`actionLogs_${tabId}`, []);');
content = content.replace('return sessionSet({ actionLogs: logs });', 'return sessionSet({ [`actionLogs_${tabId}`]: logs });');

content = content.replace('export async function loadLogs() {', 'export async function loadLogs(tabId) {');

content = content.replace('export async function exportLogsAsText() {', 'export async function exportLogsAsText(tabId) {');
content = content.replace('const logs = await loadLogs();', 'const logs = await loadLogs(tabId);');
content = content.replace('const session = await loadSession();', 'const session = await loadSession(tabId);');

fs.writeFileSync('lib/storage.js', content);
