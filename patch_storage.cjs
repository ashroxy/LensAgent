const fs = require('fs');
let content = fs.readFileSync('lib/storage.js', 'utf8');

// Replace function signatures to include tabId for ephemeral data
const replacements = [
  { from: /export async function saveSession\(\{ (.*?)\}\) \{/g, to: 'export async function saveSession(tabId, { }) {' },
  { from: /return sessionSet\(\{/g, to: 'return sessionSet({ [gentState_\]: state, [currentGoal_\]: goal, [stepCount_\]: stepCount, [dpr_\]: dpr, [	abUrl_\]: tabUrl }); // ' },
  { from: /export async function loadSession\(\) \{/g, to: 'export async function loadSession(tabId) {' },
  { from: /return \{\n    agentState: await sessionGet\("agentState", AgentState\.IDLE\),\n    currentGoal: await sessionGet\("currentGoal", ""\),\n    stepCount: await sessionGet\("stepCount", 0\),\n    tabId: await sessionGet\("activeTabId", null\),\n    dpr: await sessionGet\("dpr", 1\),\n    tabUrl: await sessionGet\("tabUrl", ""\),\n  \};/g, to: 'return { agentState: await sessionGet(gentState_, AgentState.IDLE), currentGoal: await sessionGet(currentGoal_, ""), stepCount: await sessionGet(stepCount_, 0), tabId: tabId, dpr: await sessionGet(dpr_, 1), tabUrl: await sessionGet(	abUrl_, "") };' },
  { from: /export async function loadMetrics\(\) \{/g, to: 'export async function loadMetrics(tabId) {' },
  { from: /return sessionGet\("perfMetrics", \{ \.\.\.EMPTY_METRICS \} \);/g, to: 'return sessionGet(perfMetrics_, { ...EMPTY_METRICS });' },
  { from: /export async function recordCycleLatency\(latencyMs\) \{/g, to: 'export async function recordCycleLatency(tabId, latencyMs) {' },
  { from: /const m = await loadMetrics\(\);/g, to: 'const m = await loadMetrics(tabId);' },
  { from: /return sessionSet\(\{ perfMetrics: m \}\);/g, to: 'return sessionSet({ [perfMetrics_]: m });' },
  { from: /export async function incrementMetric\(key, by = 1\) \{/g, to: 'export async function incrementMetric(tabId, key, by = 1) {' },
  { from: /export async function resetMetrics\(\) \{/g, to: 'export async function resetMetrics(tabId) {' },
  { from: /return sessionSet\(\{ perfMetrics: \{ \.\.\.EMPTY_METRICS \} \}\);/g, to: 'return sessionSet({ [perfMetrics_]: { ...EMPTY_METRICS } });' },
  { from: /export async function addHistoryEntry\(entry\) \{/g, to: 'export async function addHistoryEntry(tabId, entry) {' },
  { from: /const history = await localGet\("sessionHistory", \[\]\);/g, to: 'const history = await localGet(sessionHistory_, []);' },
  { from: /return localSet\(\{ sessionHistory: history \}\);/g, to: 'return localSet({ [sessionHistory_]: history });' },
  { from: /export async function loadHistory\(\) \{/g, to: 'export async function loadHistory(tabId) {' },
  { from: /return localGet\("sessionHistory", \[\]\);/g, to: 'return localGet(sessionHistory_, []);' },
  { from: /export async function clearHistory\(\) \{/g, to: 'export async function clearHistory(tabId) {' },
  { from: /return localSet\(\{ sessionHistory: \[\] \}\);/g, to: 'return localSet({ [sessionHistory_]: [] });' },
  { from: /export async function appendLog\(message, type = "info"\) \{/g, to: 'export async function appendLog(tabId, message, type = "info") {' },
  { from: /const logs = await sessionGet\("actionLogs", \[\]\);/g, to: 'const logs = await sessionGet(ctionLogs_, []);' },
  { from: /return sessionSet\(\{ actionLogs: logs \}\);/g, to: 'return sessionSet({ [ctionLogs_]: logs });' },
  { from: /export async function loadLogs\(\) \{/g, to: 'export async function loadLogs(tabId) {' },
  { from: /export async function exportLogsAsText\(\) \{/g, to: 'export async function exportLogsAsText(tabId) {' },
  { from: /const logs = await loadLogs\(\);/g, to: 'const logs = await loadLogs(tabId);' },
  { from: /const session = await loadSession\(\);/g, to: 'const session = await loadSession(tabId);' }
];

for (const r of replacements) {
  content = content.replace(r.from, r.to);
}

fs.writeFileSync('lib/storage.js', content);
