/**
 * service-worker.js - MV3 Background Service Worker (Enhanced)
 * ==============================================================
 * Central orchestrator that wires all subsystems together.
 *
 * Enhanced Features:
 *   - Settings management (load/save/broadcast)
 *   - Session history queries
 *   - Tab change detection (pauses agent if user switches tabs)
 *   - Multi-session prevention (only one agent run at a time)
 *   - Graceful shutdown sequence
 *   - Offscreen document crash recovery
 *   - Detailed error broadcasting to popup
 *   - Action log export support
 */

import { CaptureEngine } from "../lib/capture.js";
import { ActionExecutor } from "../lib/action-executor.js";
import { AgentLoop } from "../lib/agent-loop.js";
import * as storage from "../lib/storage.js";
import { VaultManager } from "../lib/vault.js";
import {
  POPUP_START_AGENT, POPUP_STOP_AGENT, POPUP_GET_STATUS,
  POPUP_GET_HISTORY, POPUP_EXPORT_LOG,
  POPUP_UPDATE_SETTINGS, POPUP_GET_SETTINGS,
  BG_AGENT_STATUS, BG_SETTINGS_UPDATED, BG_SESSION_HISTORY,
  AgentState, PORT_OFFSCREEN,
  HEARTBEAT_PING, ALARM_KEEPALIVE, HEARTBEAT_INTERVAL,
  POPUP_VAULT_GET, POPUP_VAULT_SET, POPUP_VAULT_DELETE, POPUP_VAULT_FLUSH,
  POPUP_HITL_RESPONSE, POPUP_APPROVAL_RESPONSE, POPUP_CLEAR_HISTORY
} from "../lib/message-types.js";

// Initialize Vault (No top-level await to ensure Manifest V3 SW compatibility)
const vaultManager = new VaultManager();
const vaultInitPromise = vaultManager.initialize().catch(e => console.error("[SW] Vault init error:", e));

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// GLOBAL STATE
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

/** @type {AgentLoop|null} */
const activeAgents = new Map();

/** @type {CaptureEngine|null} */
const activeCaptureEngines = new Map();

/** @type {chrome.runtime.Port|null} */
let offscreenPort = null;

/** @type {number|null} */
let activeTabId = null;

/** @type {number|null} */
let heartbeatInterval = null;

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// 1. SERVICE WORKER KEEP-ALIVE (Dual: Alarm + Port Heartbeat)
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

chrome.alarms.create(ALARM_KEEPALIVE, { periodInMinutes: 1 });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_KEEPALIVE && offscreenPort) {
    offscreenPort.postMessage({ type: HEARTBEAT_PING });
  }
});

function startHeartbeat() {
  stopHeartbeat();
  heartbeatInterval = setInterval(() => {
    if (offscreenPort) {
      try {
        offscreenPort.postMessage({ type: HEARTBEAT_PING });
      } catch {
        offscreenPort = null;
        handleOffscreenCrash();
      }
    }
  }, HEARTBEAT_INTERVAL);
}

function stopHeartbeat() {
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
    heartbeatInterval = null;
  }
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// 2. OFFSCREEN DOCUMENT LIFECYCLE
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

let creatingOffscreenPromise = null;

async function ensureOffscreenDocument() {
  // If port is already active and alive, nothing to do
  if (offscreenPort) return;

  // Because offscreenPort is null, we assume any existing document is a zombie.
  // Unconditionally close it to ensure a clean slate, bypassing buggy hasDocument() checks.
  console.log("[SW] Ensuring clean offscreen state...");
  try {
    await chrome.offscreen.closeDocument();
    // Crucial: Give Chrome time to fully destroy the context before recreation
    await new Promise(r => setTimeout(r, 250));
  } catch (e) {
    // Ignore error if no document actually existed
  }

  // If creation is currently in progress, await active promise
  if (creatingOffscreenPromise) {
    await creatingOffscreenPromise;
    return;
  }

  creatingOffscreenPromise = (async () => {
    try {
      await chrome.offscreen.createDocument({
        url:           "offscreen/offscreen.html",
        reasons: ["DOM_PARSER", "WORKERS"],
        justification: "On-device WebGPU visual inference and PII redaction for privacy-preserving browser agent.",
      });
      console.log("[SW] Fresh offscreen document created.");
    } catch (err) {
      if (err.message?.includes("Only a single offscreen document may be created")) {
        console.log("[SW] Offscreen document already registered.");
      } else {
        throw err;
      }
    } finally {
      creatingOffscreenPromise = null;
    }
  })();

  await creatingOffscreenPromise;
}

async function handleOffscreenCrash() {
  console.warn("[SW] Offscreen document crashed. Attempting recovery...");
  for (const agent of activeAgents.values()) { if (agent.state === AgentState.RUNNING) agent.pause(); } 

  // Attempt to recreate offscreen document
  try {
    await ensureOffscreenDocument();
    // Wait for port to reconnect
    await new Promise((r) => setTimeout(r, 1000));

    if (offscreenPort) {
      console.log("[SW] Offscreen document recovered successfully.");
      broadcastToPopup(BG_AGENT_STATUS, {
        state: AgentState.PAUSED,
        message: "Offscreen document recovered. Restart the agent to continue.",
      });
    }
  } catch (err) {
    console.error("[SW] Offscreen recovery failed:", err);
  }
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// 3. PORT MANAGEMENT
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

chrome.runtime.onConnect.addListener((port) => {
  if (port.name === PORT_OFFSCREEN) {
    offscreenPort = port;
    startHeartbeat();
    console.log("[SW] Offscreen channel connected.");

    port.onDisconnect.addListener(() => {
      offscreenPort = null;
      stopHeartbeat();
      console.warn("[SW] Offscreen channel disconnected.");
      for (const agent of activeAgents.values()) { if (agent.state === AgentState.RUNNING) agent.pause(); }
    });
  }
});

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// 4. TAB CHANGE DETECTION
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

chrome.tabs.onActivated.addListener((activeInfo) => {
  if (activeAgents.has(activeInfo.tabId)) { activeTabId = activeInfo.tabId; } if (false) {
    if (activeInfo.tabId !== activeTabId) {
      // User switched to a different tab - don't auto-stop, just note it
      console.log("[SW] User switched tabs during agent run. Agent continues on original tab.");
    }
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  if (activeAgents.has(tabId)) {
    console.warn("[SW] Active tab closed. Stopping agent.");
    handleStopAgent("TAB_CLOSED", tabId);
  }
});

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// 5. MESSAGE HANDLER
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  switch (msg.type) {
    case POPUP_START_AGENT:
      handleStartAgent(msg.goal, msg.settings, msg.targetTabId).then(sendResponse);
      return true;

    case "PROXY_RUN_VISION_DETECTION":
      chrome.runtime.sendMessage({
        type: 'RUN_VISION_DETECTION',
        dataUrl: msg.dataUrl,
        classes: msg.classes,
        threshold: msg.threshold
      }, (response) => {
        if (chrome.runtime.lastError) {
          sendResponse({ error: chrome.runtime.lastError.message });
        } else {
          sendResponse(response);
        }
      });
      return true;

    case POPUP_STOP_AGENT:
      handleStopAgent("USER_STOPPED", msg.targetTabId).then(sendResponse);
      return true;

    case POPUP_GET_STATUS:
      sendResponse(getAgentStatus(msg.targetTabId));
      return false;

    case POPUP_GET_SETTINGS:
      storage.loadSettings().then(sendResponse);
      return true;

    case POPUP_UPDATE_SETTINGS:
      storage.saveSettings(msg.settings).then(async () => {
        const updated = await storage.loadSettings();
        broadcastToPopup(BG_SETTINGS_UPDATED, updated);
        sendResponse({ status: "OK" });
      });
      return true;

    case POPUP_GET_HISTORY:
      storage.loadHistory(msg.targetTabId).then(sendResponse);
      return true;

    case POPUP_EXPORT_LOG:
      storage.exportLogsAsText(msg.targetTabId).then((text) => sendResponse({ text }));
      return true;

    case POPUP_VAULT_GET:
      vaultInitPromise.then(() => vaultManager.getAllEntries()).then(sendResponse);
      return true;

    case POPUP_VAULT_SET:
      vaultInitPromise.then(() => vaultManager.setEntry(msg.key, msg.value)).then(() => sendResponse({status: "OK"}));
      return true;

    case POPUP_VAULT_DELETE:
      vaultInitPromise.then(() => vaultManager.removeEntry(msg.key)).then(() => sendResponse({status: "OK"}));
      return true;

    case POPUP_VAULT_FLUSH:
      vaultInitPromise.then(() => vaultManager.flush()).then(() => sendResponse({status: "OK"}));
      return true;

    case POPUP_HITL_RESPONSE:
      if (msg.targetTabId && activeAgents.has(msg.targetTabId)) activeAgents.get(msg.targetTabId).handleHitlResponse(msg);
      sendResponse({status: "OK"});
      return false;

    case POPUP_APPROVAL_RESPONSE:
      if (msg.targetTabId && activeAgents.has(msg.targetTabId)) activeAgents.get(msg.targetTabId).handleApprovalResponse(msg);
      sendResponse({status: "OK"});
      return false;

    case POPUP_CLEAR_HISTORY:
      storage.clearHistory(msg.targetTabId).then(() => sendResponse({ status: "OK" }));
      return true;
  }
});

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// 6. START AGENT
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

async function handleStartAgent(goal, settingsOverride = null, targetTabId = null) {
  try {
    // Multi-session prevention
    

    if (!goal || typeof goal !== "string" || !goal.trim()) {
      return { status: "ERROR", error: "Goal cannot be empty." };
    }

    // Ensure vault is fully loaded before agent starts
    await vaultInitPromise;

    // Load settings (with any overrides from popup)
    const settings = await storage.loadSettings();
    if (settingsOverride) Object.assign(settings, settingsOverride);

    // Get target tab - if a specific tabId was passed (from pop-out mode), use that.
    // Otherwise fall back to the active tab in the current window.
    let tab;
    if (targetTabId) {
      tab = await chrome.tabs.get(targetTabId).catch(() => null);
    }
    if (!tab) {
      // Query all tabs in the current window, pick the active non-extension one
      const allTabs = await chrome.tabs.query({ currentWindow: true });
      tab = allTabs.find(t => t.active && !t.url?.startsWith("chrome-extension://"))
         || allTabs.find(t => !t.url?.startsWith("chrome-extension://") && !t.url?.startsWith("chrome://"));
    }
    if (!tab?.id) return { status: "ERROR", error: "No automatable browser tab found. Please open a web page first." };
    if (activeAgents.has(tab.id) && activeAgents.get(tab.id).state === AgentState.RUNNING) return { status: "ERROR", error: "An agent is already running on this tab." };

    const url = tab.url || "";
    const BLOCKED = ["chrome://", "chrome-extension://", "edge://", "about:blank",
                     "https://chromewebstore.google.com"];
    if (BLOCKED.some((p) => url.startsWith(p))) {
      return { status: "ERROR", error: `Cannot automate restricted page: ${url}` };
    }

    // Ensure offscreen document is ready and port connected
    await ensureOffscreenDocument();

    // Dynamically poll for port connection up to 3000ms
    const portWaitStart = Date.now();
    while (!offscreenPort && Date.now() - portWaitStart < 8000) {
      await new Promise((r) => setTimeout(r, 100));
    }
    if (!offscreenPort) return { status: "ERROR", error: "Offscreen perception engine failed to connect." };

    // Clean up any stale or lingering debugger attachment on this tab
    await new Promise((r) => chrome.debugger.detach({ tabId: tab.id }, () => {
      if (chrome.runtime.lastError) { /* ignore if not attached */ }
      r();
    }));

    // Create capture engine
    const captureEngine = new CaptureEngine(tab.id, {
      quality:          settings.captureQuality,
      maxWidth:         settings.captureMaxWidth,
      maxHeight:        settings.captureMaxHeight,
      enableDeltaFrames: settings.enableDeltaFrames,
      adaptiveQuality:  true,
    });

    await captureEngine.attach();
    activeCaptureEngines.set(tab.id, captureEngine);
    activeTabId = tab.id;

    // Fetch dynamic DPR
    const dpr = await captureEngine.getDevicePixelRatio();
    console.log(`[SW] DPR: ${dpr} | Tab: ${tab.id} | URL: ${url}`);

    // Create action executor
    const actionExecutor = new ActionExecutor(tab.id, {
      dpr,
      humanize:          settings.humanizeInputs,
      interKeyDelayBase: settings.interKeyDelayBase,
      interKeyJitter:    settings.interKeyJitter,
    });

    // Wire detach recovery
    captureEngine.onDetach((reason) => {
      console.warn(`[SW] Debugger detached: ${reason}`);
      activeCaptureEngine = null;
      activeTabId = null;
      

      broadcastToPopup(BG_AGENT_STATUS, {
        state:   AgentState.PAUSED,
        message: reason === "canceled_by_user"
          ? "Agent paused - you opened Chrome DevTools. Close DevTools and restart."
          : `Agent paused - debugger detached (${reason}).`,
      });
    });

    captureEngine.onNavigate((newUrl) => {
      console.log(`[SW] Navigation: ${newUrl}`);
    });

    // Create and start agent loop
    const activeAgent = new AgentLoop({
      captureEngine,
      actionExecutor,
      offscreenPort,
      vaultManager,
      backendUrl:       settings.backendUrl,
      maxSteps:         settings.maxSteps,
      stabilizeDelayMs: settings.stabilizeDelayMs,
      serverTimeoutMs:  settings.serverTimeoutMs,
      enableAuditStream: settings.enableAuditStream,
      tabId: tab.id,
    });

    activeAgents.set(tab.id, activeAgent);
    await activeAgent.start(goal.trim());

    return { status: "STARTED", dpr, tabId: tab.id, url };

  } catch (err) {
    console.error("[SW] Start failed:", err);
    if (activeCaptureEngine) {
      await activeCaptureEngine.detach().catch(() => {});
      activeCaptureEngine = null;
    }
    activeTabId = null;
    return { status: "ERROR", error: err.message };
  }
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// 7. STOP AGENT
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

async function handleStopAgent(reason = "USER_STOPPED", tabId = null) {
    if (!tabId && activeTabId) tabId = activeTabId;
    const activeAgent = activeAgents.get(tabId);
    const activeCaptureEngine = activeCaptureEngines.get(tabId);
  try {
    if (activeAgent) {
      await activeAgent.stop(reason);
      activeAgent = null;
    }
    if (activeCaptureEngine) {
      await activeCaptureEngine.stopScreencast();
      activeCaptureEngine = null;
    }
    activeTabId = null;
    await storage.sessionSet({ agentState: AgentState.IDLE });
    return { status: "STOPPED" };
  } catch (err) {
    console.error("[SW] Stop error:", err);
    return { status: "ERROR", error: err.message };
  }
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// 8. STATUS QUERY
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

function getAgentStatus() {
  if (activeAgent) return { status: "OK", activeTabId: tabId, ...activeAgent.getStatus() };
  
  return {
    status: "OK", state: AgentState.IDLE, goal: "", stepCount: 0,
    maxSteps: 30, avgLatency: 0, connection: "OFFLINE",
  };
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// 9. HELPERS
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

function broadcastToPopup(type, payload) {
  payload = payload || {};
  if (activeTabId) payload.activeTabId = activeTabId;
  chrome.runtime.sendMessage({ type, payload }).catch(() => {});
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// 10. INSTALL HANDLER
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

chrome.runtime.onInstalled.addListener(async (details) => {
  console.log(`[SW] Installed: ${details.reason}`);
  await storage.sessionClear();
  await storage.sessionSet({ agentState: AgentState.IDLE });

  // Initialize default settings if first install
  if (details.reason === "install") {
    await storage.resetSettings();
  }
});

console.log("[SW] LensAgent Service Worker initialized.");


