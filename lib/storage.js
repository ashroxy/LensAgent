/**
 * storage.js - Session Storage Manager
 * ======================================
 * Async wrappers around chrome.storage.session (ephemeral per browser session)
 * and chrome.storage.local (persistent across sessions).
 *
 * Manages:
 *   - Agent session state (ephemeral)
 *   - User settings (persistent)
 *   - Session history / run log (persistent, capped)
 *   - Performance metrics accumulation
 *   - Action log buffer for export
 */

import { DEFAULT_SETTINGS, AgentState, MAX_HISTORY_ENTRIES } from "./message-types.js";

const SESSION = chrome.storage.session;
const LOCAL   = chrome.storage.local;

export async function sessionGet(key, fallback = null) {
  const r = await SESSION.get(key);
  return r[key] ?? fallback;
}

export async function sessionSet(data) {
  return SESSION.set(data);
}

export async function localGet(key, fallback = null) {
  const r = await LOCAL.get(key);
  return r[key] ?? fallback;
}

export async function localSet(data) {
  return LOCAL.set(data);
}

// -----------------------------------------------------------------------------
// SESSION STATE (Ephemeral)
// -----------------------------------------------------------------------------

export async function saveSession(tabId, { state, goal, stepCount, dpr, tabUrl }) {
  const startKey = `sessionStart_${tabId}`;
  return sessionSet({
    [`agentState_${tabId}`]:   state,
    [`currentGoal_${tabId}`]:  goal,
    [`stepCount_${tabId}`]:    stepCount,
    [`sessionTabId_${tabId}`]: tabId,
    [`sessionDpr_${tabId}`]:   dpr,
    [`sessionUrl_${tabId}`]:   tabUrl || "",
    [startKey]:                await sessionGet(startKey, Date.now()),
  });
}

export async function loadSession(tabId) {
  const keys = [
    `agentState_${tabId}`, `currentGoal_${tabId}`, `stepCount_${tabId}`,
    `sessionTabId_${tabId}`, `sessionDpr_${tabId}`, `sessionUrl_${tabId}`, `sessionStart_${tabId}`
  ];
  const r = await SESSION.get(keys);
  return {
    agentState:   r[`agentState_${tabId}`],
    currentGoal:  r[`currentGoal_${tabId}`],
    stepCount:    r[`stepCount_${tabId}`],
    sessionTabId: r[`sessionTabId_${tabId}`],
    sessionDpr:   r[`sessionDpr_${tabId}`],
    sessionUrl:   r[`sessionUrl_${tabId}`],
    sessionStart: r[`sessionStart_${tabId}`],
  };
}

export async function resetSession(tabId) {
  return sessionSet({
    [`agentState_${tabId}`]: AgentState.IDLE,
    [`stepCount_${tabId}`]:  0,
  });
}

// -----------------------------------------------------------------------------
// SETTINGS (Persistent)
// -----------------------------------------------------------------------------

export async function loadSettings() {
  const result = await localGet("userSettings");
  const saved = result || {};
  const finalSettings = { ...DEFAULT_SETTINGS };
  for (const k in saved) {
    if (saved[k] !== "" && saved[k] !== null && saved[k] !== undefined) {
      finalSettings[k] = saved[k];
    }
  }
  if (finalSettings.backendUrl === "http://localhost:8000") {
    finalSettings.backendUrl = "http://127.0.0.1:8000";
    await localSet({ userSettings: finalSettings });
  }
  return finalSettings;
}

export async function saveSettings(partial) {
  const current = await loadSettings();
  const merged  = { ...current, ...partial };
  return localSet({ userSettings: merged });
}

export async function resetSettings() {
  return localSet({ userSettings: { ...DEFAULT_SETTINGS } });
}

// -----------------------------------------------------------------------------
// PERFORMANCE METRICS
// -----------------------------------------------------------------------------

const EMPTY_METRICS = Object.freeze({
  totalFrames:     0,
  skippedFrames:   0,
  processedFrames: 0,
  totalCycles:     0,
  avgLatencyMs:    0,
  minLatencyMs:    Infinity,
  maxLatencyMs:    0,
  serverErrors:    0,
  perceptionErrors: 0,
  actionsExecuted: 0,
  actionsFailed:   0,
});

export async function loadMetrics(tabId) {
  return sessionGet(`perfMetrics_${tabId}`, { ...EMPTY_METRICS });
}

export async function recordCycleLatency(tabId, latencyMs) {
  const m = await loadMetrics(tabId);
  m.totalCycles++;
  m.minLatencyMs = Math.min(m.minLatencyMs, latencyMs);
  m.maxLatencyMs = Math.max(m.maxLatencyMs, latencyMs);
  m.avgLatencyMs = Math.round(
    ((m.avgLatencyMs * (m.totalCycles - 1)) + latencyMs) / m.totalCycles
  );
  return sessionSet({ [`perfMetrics_${tabId}`]: m });
}

export async function incrementMetric(tabId, key, by = 1) {
  const m = await loadMetrics(tabId);
  if (key in m) {
    m[key] += by;
    return sessionSet({ [`perfMetrics_${tabId}`]: m });
  }
}

export async function resetMetrics(tabId) {
  return sessionSet({ [`perfMetrics_${tabId}`]: { ...EMPTY_METRICS } });
}

// -----------------------------------------------------------------------------
// SESSION HISTORY
// -----------------------------------------------------------------------------

export async function addHistoryEntry(tabId, entry) {
  const history = await localGet(`sessionHistory_${tabId}`, []);
  history.unshift({
    ...entry,
    id:        `run_${Date.now()}`,
    timestamp: Date.now(),
    date:      new Date().toLocaleString(),
  });
  if (history.length > MAX_HISTORY_ENTRIES) {
    history.length = MAX_HISTORY_ENTRIES;
  }
  return localSet({ [`sessionHistory_${tabId}`]: history });
}

export async function loadHistory(tabId) {
  return localGet(`sessionHistory_${tabId}`, []);
}

export async function clearHistory(tabId) {
  return localSet({ [`sessionHistory_${tabId}`]: [] });
}

// -----------------------------------------------------------------------------
// ACTION LOG BUFFER
// -----------------------------------------------------------------------------

export async function appendLog(tabId, message, type = "info") {
  const logs = await sessionGet(`actionLogs_${tabId}`, []);
  logs.push({
    message,
    type,
    timestamp: Date.now(),
    time:      new Date().toLocaleTimeString(),
  });
  if (logs.length > 500) logs.splice(0, logs.length - 500);
  return sessionSet({ [`actionLogs_${tabId}`]: logs });
}

export async function loadLogs(tabId) {
  return sessionGet(`actionLogs_${tabId}`, []);
}

export async function exportLogsAsText(tabId) {
  const logs = await loadLogs(tabId);
  const session = await loadSession(tabId);

  let output = `===============================================\n`;
  output += `LensAgent Session Log\n`;
  output += `Goal: ${session.currentGoal || "N/A"}\n`;
  output += `Date: ${new Date().toLocaleString()}\n`;
  output += `Steps: ${session.stepCount || 0}\n`;
  output += `===============================================\n\n`;

  for (const log of logs) {
    output += `[${log.time}] [${log.type.toUpperCase()}] ${log.message}\n`;
  }

  return output;
}
