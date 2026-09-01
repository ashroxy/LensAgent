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

// ═══════════════════════════════════════════════════════════════════════════════
// GENERIC HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

export async function sessionGet(key, fallback = null) {
  const r = await SESSION.get(key);
  return r[key] ?? fallback;
}

export async function sessionSet(data) {
  return SESSION.set(data);
}

export async function sessionRemove(keys) {
  return SESSION.remove(keys);
}

export async function sessionClear() {
  return SESSION.clear();
}

export async function localGet(key, fallback = null) {
  const r = await LOCAL.get(key);
  return r[key] ?? fallback;
}

export async function localSet(data) {
  return LOCAL.set(data);
}

// ═══════════════════════════════════════════════════════════════════════════════
// AGENT SESSION (Ephemeral)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Save the current agent session snapshot.
 */
export async function saveSession({ state, goal, stepCount, tabId, dpr, tabUrl }) {
  return sessionSet({
    agentState:   state,
    currentGoal:  goal,
    stepCount,
    sessionTabId: tabId,
    sessionDpr:   dpr,
    sessionUrl:   tabUrl || "",
    sessionStart: await sessionGet("sessionStart", Date.now()),
  });
}

/**
 * Load the current agent session snapshot.
 */
export async function loadSession() {
  return SESSION.get([
    "agentState", "currentGoal", "stepCount",
    "sessionTabId", "sessionDpr", "sessionUrl", "sessionStart",
  ]);
}

/**
 * Reset agent state to idle.
 */
export async function resetSession() {
  return sessionSet({
    agentState:  AgentState.IDLE,
    currentGoal: "",
    stepCount:   0,
    sessionTabId: null,
    sessionDpr:  1,
    sessionUrl:  "",
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// SETTINGS (Persistent)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Load user settings, merged with defaults for any missing keys.
 * @returns {Promise<Object>}
 */
export async function loadSettings() {
  const result = await localGet("userSettings");
  const saved = result || {};
  const finalSettings = { ...DEFAULT_SETTINGS };
  for (const k in saved) {
    if (saved[k] !== "" && saved[k] !== null && saved[k] !== undefined) {
      finalSettings[k] = saved[k];
    }
  }
  // Auto-migrate localhost to 127.0.0.1 to avoid Node v17+ IPv6 ECONNREFUSED issues
  if (finalSettings.backendUrl === "http://localhost:8000") {
    finalSettings.backendUrl = "http://127.0.0.1:8000";
    await localSet({ userSettings: finalSettings });
  }
  return finalSettings;
}

/**
 * Save user settings (partial update - merged with existing).
 * @param {Object} partial - Settings keys to update
 */
export async function saveSettings(partial) {
  const current = await loadSettings();
  const merged  = { ...current, ...partial };
  return localSet({ userSettings: merged });
}

/**
 * Reset settings to defaults.
 */
export async function resetSettings() {
  return localSet({ userSettings: { ...DEFAULT_SETTINGS } });
}

// ═══════════════════════════════════════════════════════════════════════════════
// PERFORMANCE METRICS (Ephemeral - per session)
// ═══════════════════════════════════════════════════════════════════════════════

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

/**
 * Load current metrics.
 */
export async function loadMetrics() {
  return sessionGet("perfMetrics", { ...EMPTY_METRICS });
}

/**
 * Record a completed agent cycle's latency.
 * @param {number} latencyMs
 */
export async function recordCycleLatency(latencyMs) {
  const m = await loadMetrics();
  m.totalCycles++;
  m.minLatencyMs = Math.min(m.minLatencyMs, latencyMs);
  m.maxLatencyMs = Math.max(m.maxLatencyMs, latencyMs);
  // Running average
  m.avgLatencyMs = Math.round(
    ((m.avgLatencyMs * (m.totalCycles - 1)) + latencyMs) / m.totalCycles
  );
  return sessionSet({ perfMetrics: m });
}

/**
 * Increment a specific metric counter.
 * @param {string} key - Metric key (e.g., "serverErrors", "actionsExecuted")
 * @param {number} [by=1]
 */
export async function incrementMetric(key, by = 1) {
  const m = await loadMetrics();
  if (key in m) {
    m[key] += by;
    return sessionSet({ perfMetrics: m });
  }
}

/**
 * Reset all metrics.
 */
export async function resetMetrics() {
  return sessionSet({ perfMetrics: { ...EMPTY_METRICS } });
}

// ═══════════════════════════════════════════════════════════════════════════════
// SESSION HISTORY (Persistent - across browser restarts)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Record a completed (or failed) agent session to history.
 * @param {Object} entry
 * @param {string} entry.goal
 * @param {number} entry.steps
 * @param {string} entry.result - "FINISHED" | "STOPPED" | "ERROR"
 * @param {number} entry.durationMs
 * @param {string} entry.url
 */
export async function addHistoryEntry(entry) {
  const history = await localGet("sessionHistory", []);

  history.unshift({
    ...entry,
    id:        `run_${Date.now()}`,
    timestamp: Date.now(),
    date:      new Date().toLocaleString(),
  });

  // Cap history length
  if (history.length > MAX_HISTORY_ENTRIES) {
    history.length = MAX_HISTORY_ENTRIES;
  }

  return localSet({ sessionHistory: history });
}

/**
 * Load session history.
 * @returns {Promise<Array>}
 */
export async function loadHistory() {
  return localGet("sessionHistory", []);
}

/**
 * Clear session history.
 */
export async function clearHistory() {
  return localSet({ sessionHistory: [] });
}

// ═══════════════════════════════════════════════════════════════════════════════
// ACTION LOG BUFFER (Ephemeral - for current session export)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Append an action log entry.
 * @param {string} message
 * @param {string} [type="info"]
 */
export async function appendLog(message, type = "info") {
  const logs = await sessionGet("actionLogs", []);
  logs.push({
    message,
    type,
    timestamp: Date.now(),
    time:      new Date().toLocaleTimeString(),
  });

  // Cap at 500 entries in storage
  if (logs.length > 500) logs.splice(0, logs.length - 500);

  return sessionSet({ actionLogs: logs });
}

/**
 * Get all action logs for the current session.
 */
export async function loadLogs() {
  return sessionGet("actionLogs", []);
}

/**
 * Export logs as a formatted text string.
 * @returns {Promise<string>}
 */
export async function exportLogsAsText() {
  const logs = await loadLogs();
  const session = await loadSession();

  let output = `═══════════════════════════════════════════════\n`;
  output += `LensAgent Session Log\n`;
  output += `Goal: ${session.currentGoal || "N/A"}\n`;
  output += `Date: ${new Date().toLocaleString()}\n`;
  output += `Steps: ${session.stepCount || 0}\n`;
  output += `═══════════════════════════════════════════════\n\n`;

  for (const log of logs) {
    output += `[${log.time}] [${log.type.toUpperCase()}] ${log.message}\n`;
  }

  return output;
}
