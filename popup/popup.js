let currentPopupTabId = null;

/**
 * popup.js - LensAgent Popup Controller (Enhanced)
 * ===================================================
 * Handles:
 *   1. Start/Stop agent with settings passthrough
 *   2. Dual-canvas rendering with bounding box overlays
 *   3. Real-time metrics (latency, FPS, redactions, quality, skipped frames)
 *   4. Latency sparkline mini-chart
 *   5. Tabbed UI navigation (Agent / Settings / History)
 *   6. Settings management (load/save/reset)
 *   7. Session history with cards
 *   8. Action log with color coding and export
 *   9. Connection quality badge
 *  10. State sync on popup open
 */

import {
  POPUP_START_AGENT, POPUP_STOP_AGENT, POPUP_GET_STATUS,
  POPUP_GET_SETTINGS, POPUP_UPDATE_SETTINGS,
  POPUP_GET_HISTORY, POPUP_EXPORT_LOG,
  POPUP_HITL_RESPONSE, POPUP_APPROVAL_RESPONSE,
  POPUP_VAULT_GET, POPUP_VAULT_SET, POPUP_VAULT_DELETE, POPUP_VAULT_FLUSH,
  POPUP_CLEAR_HISTORY,
  BG_AGENT_STATUS, BG_SETTINGS_UPDATED,
  BG_HITL_PROMPT, BG_APPROVAL_PROMPT, BG_VAULT_DATA,
  AUDIT_FRAME_UPDATE, AUDIT_ACTION_LOG,
  AgentState, DEFAULT_SETTINGS,
} from "../lib/message-types.js";

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// DOM REFS
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

const $ = (id) => document.getElementById(id);

const rawCanvas       = $("liveStream");
const rawCtx          = rawCanvas.getContext("2d");
const redactedCanvas  = $("annotatedStream");
const redactedCtx     = redactedCanvas.getContext("2d");
const sparkCanvas     = $("sparklineCanvas");
const sparkCtx = sparkCanvas ? sparkCanvas.getContext("2d") : null;

const startBtn        = $("startBtn");
const stopBtn         = $("stopBtn");
const goalInput       = $("goalInput");
const statusDot       = $("statusDot");
const stateLabel      = $("headerState");
const connBadge       = $("connectionBadge");
const errorMsg        = $("errorMsg");

const stepCountEl     = $("stepCount");
const maxStepsEl      = $("maxSteps");
const redactionCountEl = $("redactionCount");
const latencyDisplayEl = $("latencyMs");
const fpsDisplayEl    = $("fpsCount");
const frameCountEl    = $("frameCount");
const skippedCountEl  = $("skippedCount");
const qualityDisplayEl = $("qualityDisplay");
const dprDisplayEl    = $("dprDisplay");
const actionLogEl     = $("terminalBody");
const exportLogBtn    = $("exportLogBtn");

// Settings form
const settBackendUrl     = $("setting-serverUrl");
const settMaxSteps       = $("setting-maxSteps");
const settCaptureQuality = $("settCaptureQuality");
const settServerTimeout  = $("setting-timeout");
const settStabilizeDelay = $("settStabilizeDelay");
const settHumanize       = $("setting-jitter");
const settDeltaFrames    = $("setting-delta");
const settAuditStream    = $("setting-liveAudit");
const saveSettingsBtn    = $("saveSettingsBtn");
const resetSettingsBtn   = $("resetSettingsBtn");
const settingsMsg        = $("settingsMsg");

const historyList     = $("historyList");
const clearHistoryBtn = $("clearHistoryBtn");

// Vault
const vaultMsg = $("vaultMsg");

// HITL
const hitlOverlay   = $("hitlOverlay");
const hitlQuestion  = $("hitlQuestion");
const hitlInput     = $("hitlInput");
const hitlSendBtn   = $("hitlSendBtn");
const hitlSaveToVault = $("hitlSaveToVault");
const hitlVaultKeyLabel = $("hitlVaultKeyLabel");
const hitlVaultKey  = $("hitlVaultKey");

// Approval
const approvalOverlay   = $("approvalOverlay");
const approvalContext   = $("approvalContext");
const approvalDetail    = $("approvalDetail");
const approvalApproveBtn = $("approvalApproveBtn");
const approvalDenyBtn   = $("approvalDenyBtn");

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// STATE
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

let currentState   = AgentState.IDLE;
let latencyHistory = [];  // For sparkline
const MAX_SPARKLINE = 60;

let pendingHitlCorrelationId = null;
let pendingHitlVaultKey = null;
let pendingApprovalCorrelationId = null;

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// TAB NAVIGATION
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

document.querySelectorAll(".nav-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".nav-btn").forEach((t) => t.classList.remove("active"));
    document.querySelectorAll(".tab-content").forEach((c) => c.classList.remove("active"));
    btn.classList.add("active");
    const target = btn.dataset.tab;
    document.getElementById(`tab-${target}`).classList.add("active");

    const titles = { agent: "Agent Dashboard", settings: "System Settings", history: "Session History", vault: "Identity Vault" };
    const headerTitle = document.getElementById("headerTitle");
    if (headerTitle) headerTitle.textContent = titles[target] || "LensAgent";

    // Load data when switching to settings or history
    if (target === "settings") loadSettingsUI();
    if (target === "history") loadHistoryUI();
    if (target === "vault") loadVaultUI();
  });
});

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// POP-OUT MODE DETECTION
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

// If this page is opened as a full tab (not a popup), we are in "pop-out" mode.
// In pop-out mode, Start Agent must target a real webpage tab, not this extension tab.
let targetTabId = null;
const isPopoutMode = window.location.href.startsWith("chrome-extension://") 
  && (window.innerWidth > 800 || document.referrer === "");

const btnPopout = document.getElementById("btnPopout");

(async () => {
  if (isPopoutMode || window.matchMedia("(min-width: 801px)").matches) {
    // We're likely in a full tab - resolve the target tab now
    const allTabs = await chrome.tabs.query({ currentWindow: true });
    const webTab = allTabs.find(t => !t.active && !t.url?.startsWith("chrome-extension://") && !t.url?.startsWith("chrome://"))
      || allTabs.find(t => !t.url?.startsWith("chrome-extension://") && !t.url?.startsWith("chrome://"));
    if (webTab) {
      targetTabId = webTab.id;
      addLog(`Pop-out mode: targeting tab "${webTab.title || webTab.url}"`, "info");
    }
    // Hide the pop-out button since we're already in full tab
    if (btnPopout) btnPopout.style.display = "none";
  }
})();

if (btnPopout) {
  btnPopout.addEventListener("click", () => {
    chrome.tabs.create({ url: chrome.runtime.getURL("popup/popup.html") });
  });
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// CONTROLS
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

startBtn.addEventListener("click", async () => {
  const goal = goalInput.value.trim();
  if (!goal) { showError("Please enter a goal."); return; }
  hideError();
  startBtn.disabled = true;

  const payload = { type: POPUP_START_AGENT, goal };
  if (targetTabId) payload.targetTabId = targetTabId;

  const resp = await msg(payload);

  if (resp?.status === "STARTED") {
    stopBtn.disabled = false;
    goalInput.disabled = true;
    setState(AgentState.RUNNING);
    addLog(`Agent started - Goal: "${goal}"`, "action");
    if (resp.dpr) if (dprDisplayEl) dprDisplayEl.textContent = `DPR: ${resp.dpr}`;
    latencyHistory = [];
  } else {
    startBtn.disabled = false;
    showError(resp?.error || "Failed to start agent.");
    addLog(`Start failed: ${resp?.error}`, "error");
  }
});

stopBtn.addEventListener("click", async () => {
  stopBtn.disabled = true;
  await msg({ type: POPUP_STOP_AGENT, targetTabId: currentPopupTabId });
  resetToIdle();
  addLog("Agent stopped.", "warning");
});

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// EXPORT LOG
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

exportLogBtn.addEventListener("click", async () => {
  const resp = await msg({ type: POPUP_EXPORT_LOG, targetTabId: currentPopupTabId });
  if (resp?.text) {
    const blob = new Blob([resp.text], { type: "text/plain" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = `lensagent-log-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    addLog("Log exported.", "info");
  }
});

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// INCOMING MESSAGES
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

chrome.runtime.onMessage.addListener((message) => {
    if (message.payload && message.payload.activeTabId && currentPopupTabId && message.payload.activeTabId !== currentPopupTabId) {
      return; // Ignore broadcasts from other tabs
    }
  switch (message.type) {
    case AUDIT_FRAME_UPDATE:
      renderAuditFrame(message.payload);
      break;
    case AUDIT_ACTION_LOG:
      handleActionLog(message.payload);
      break;
    case BG_AGENT_STATUS:
      handleStatusUpdate(message.payload);
      break;
    case BG_HITL_PROMPT:
      showHitlPrompt(message.payload);
      break;
    case BG_APPROVAL_PROMPT:
      showApprovalPrompt(message.payload);
      break;
    case BG_VAULT_DATA:
      populateVaultUI(message.payload);
      break;
  }
});

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// AUDIT FRAME RENDERER
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

function renderAuditFrame(p) {
  redactionCountEl.textContent = p.redactedCount;

  if (p.rawFrame) {
    const img = new Image();
    img.onload = () => {
      // Dynamically match canvas internal resolution to incoming frame
      if (rawCanvas.width !== img.naturalWidth || rawCanvas.height !== img.naturalHeight) {
        rawCanvas.width  = img.naturalWidth;
        rawCanvas.height = img.naturalHeight;
      }
      rawCtx.drawImage(img, 0, 0, rawCanvas.width, rawCanvas.height);
      drawBBoxes(rawCtx, p.boundingBoxes || [], rawCanvas.width, rawCanvas.height);
    };
    img.src = `data:image/jpeg;base64,${p.rawFrame}`;
  }

  if (p.redactedFrame) {
    const img2 = new Image();
    img2.onload = () => {
      if (redactedCanvas.width !== img2.naturalWidth || redactedCanvas.height !== img2.naturalHeight) {
        redactedCanvas.width  = img2.naturalWidth;
        redactedCanvas.height = img2.naturalHeight;
      }
      redactedCtx.drawImage(img2, 0, 0, redactedCanvas.width, redactedCanvas.height);
    };
    img2.src = `data:image/jpeg;base64,${p.redactedFrame}`;
  }
}

function drawBBoxes(ctx, elements, canvasW, canvasH) {
  // Elements report bboxes in their original coordinate space.
  // Scale to the actual canvas dimensions.
  const sourceW = canvasW || 1280;
  const sourceH = canvasH || 720;

  for (const el of elements) {
    const bbox = el.bbox || el.boundingBox;
    if (!bbox) continue;

    let x, y, w, h;
    if (Array.isArray(bbox)) {
      [x, y, w, h] = bbox;
    } else {
      x = bbox.x; y = bbox.y; w = bbox.width; h = bbox.height;
    }
    if (!w || !h || isNaN(x) || isNaN(y)) continue;

    // Bounding box
    ctx.strokeStyle = "rgba(14, 165, 233, 0.8)";
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, w, h);

    // ID label background
    const label = el.id != null ? `#${el.id}` : (el.redactionLabel || "");
    if (label) {
      const fontSize = Math.max(10, Math.min(14, canvasW / 80));
      ctx.font = `bold ${fontSize}px monospace`;
      const textW = ctx.measureText(label).width + 6;
      ctx.fillStyle = "rgba(14, 165, 233, 0.85)";
      ctx.fillRect(x, y - fontSize - 4, textW, fontSize + 4);
      ctx.fillStyle = "#FFFFFF";
      ctx.fillText(label, x + 3, y - 4);
    }
  }
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// SPARKLINE CHART
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

function updateSparkline(latency) {
  latencyHistory.push(latency);
  if (latencyHistory.length > MAX_SPARKLINE) latencyHistory.shift();

  if (!sparkCanvas || !sparkCtx) return;
  const w = sparkCanvas.width; const h = sparkCanvas.height;
  const max = Math.max(50, ...latencyHistory);

  if (sparkCtx) sparkCtx.clearRect(0, 0, w, h);

  // Grid line at 500ms
  if (sparkCtx) sparkCtx.strokeStyle = "#c3c6d2";
  if (sparkCtx) sparkCtx.lineWidth = 0.5;
  const gridY = h - (500 / max) * (h - 8);
  if (sparkCtx) sparkCtx.beginPath();
  if (sparkCtx) sparkCtx.moveTo(0, gridY);
  if (sparkCtx) sparkCtx.lineTo(w, gridY);
  if (sparkCtx) sparkCtx.stroke();

  if (latencyHistory.length < 2) return;

  // Gradient fill
  const grad = sparkCtx ? sparkCtx.createLinearGradient(0, 0, 0, h) : null;
  grad.addColorStop(0, "rgba(48, 95, 159, 0.2)");
  grad.addColorStop(1, "rgba(48, 95, 159, 0.0)");

  const step = w / (MAX_SPARKLINE - 1);

  // Fill area
  if (sparkCtx) sparkCtx.beginPath();
  if (sparkCtx) sparkCtx.moveTo(0, h);
  for (let i = 0; i < latencyHistory.length; i++) {
    const x = i * step;
    const y = h - (latencyHistory[i] / max) * (h - 8);
    if (sparkCtx) sparkCtx.lineTo(x, y);
  }
  if (sparkCtx) sparkCtx.lineTo((latencyHistory.length - 1) * step, h);
  if (sparkCtx) sparkCtx.closePath();
  if (sparkCtx) sparkCtx.fillStyle = grad;
  if (sparkCtx) sparkCtx.fill();

  // Line
  if (sparkCtx) sparkCtx.beginPath();
  for (let i = 0; i < latencyHistory.length; i++) {
    const x = i * step;
    const y = h - (latencyHistory[i] / max) * (h - 8);
    if(sparkCtx) { i === 0 ? sparkCtx.moveTo(x, y) : sparkCtx.lineTo(x, y); }
  }
  if (sparkCtx) sparkCtx.strokeStyle = "#305f9f";
  if (sparkCtx) sparkCtx.lineWidth = 1.5;
  if (sparkCtx) sparkCtx.stroke();

  // Current value dot
  const lastX = (latencyHistory.length - 1) * step;
  const lastY = h - (latencyHistory[latencyHistory.length - 1] / max) * (h - 8);
  if (sparkCtx) sparkCtx.beginPath();
  if (sparkCtx) sparkCtx.arc(lastX, lastY, 2.5, 0, 2 * Math.PI);
  if (sparkCtx) sparkCtx.fillStyle = "#305f9f";
  if (sparkCtx) sparkCtx.fill();
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// STATUS & LOG
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

function handleStatusUpdate(p) {
  setState(p.state);
  if (p.stepCount != null) if (stepCountEl) stepCountEl.textContent = p.stepCount;
  if (p.maxSteps != null)  if (maxStepsEl) maxStepsEl.textContent  = p.maxSteps;
  if (p.avgLatency != null) {
    latencyDisplayEl.textContent = `${p.avgLatency}`;
    updateSparkline(p.avgLatency);
  }
  if (p.metrics) {
    if (p.metrics.currentFps != null)      if (fpsDisplayEl) fpsDisplayEl.textContent     = p.metrics.currentFps;
    if (p.metrics.totalFrames != null)     if (frameCountEl) frameCountEl.textContent     = p.metrics.totalFrames;
    if (p.metrics.skippedFrames != null)   if (skippedCountEl) skippedCountEl.textContent   = p.metrics.skippedFrames;
    if (p.metrics.currentQuality != null)  if (qualityDisplayEl) qualityDisplayEl.textContent = `${p.metrics.currentQuality}%`;
  }
  if (p.connection) setConnectionBadge(p.connection);
  if (p.message) addLog(p.message, p.state === AgentState.ERROR ? "error" : "warning");
  if (p.state === AgentState.IDLE || p.state === AgentState.FINISHED) resetToIdle();
}

function handleActionLog(p) {
  const m = p.message.toLowerCase();
  let cls = "action";
  if (m.includes("fail") || m.includes("error")) cls = "error";
  else if (m.includes("warn") || m.includes("timeout") || m.includes("pause") || m.includes("stop")) cls = "warning";
  else if (m.includes("success") || m.includes("completed") || m.includes("ok")) cls = "success";
  else if (m.includes("thought:") || m.includes("navigat") || m.includes("stale")) cls = "info";
  addLog(p.message, cls);
}

function addLog(text, type = "info") {
  const placeholder = actionLogEl.querySelector(".opacity-40");
  if (placeholder && placeholder.textContent.includes("Waiting")) placeholder.remove();

  const time = new Date().toLocaleTimeString('en-US', { hour12: false });
  let typeHtml = "";
  if (type === "info") typeHtml = `<span class="text-primary font-bold shrink-0 w-14">[INFO]</span>`;
  else if (type === "act")  typeHtml = `<span class="text-primary-fixed-dim font-bold shrink-0 w-14">[ACT]</span>`;
  else if (type === "error" || type === "err")  typeHtml = `<span class="text-error font-bold shrink-0 w-14">[ERR]</span>`;
  else if (type === "warning" || type === "warn")  typeHtml = `<span class="text-secondary font-bold shrink-0 w-14">[WARN]</span>`;
  else if (type === "success")  typeHtml = `<span class="text-tertiary font-bold shrink-0 w-14">[OK]</span>`;
  else typeHtml = `<span class="text-primary font-bold shrink-0 w-14">[SYS]</span>`;

  const el = document.createElement("div");
  el.className = "flex gap-4 items-start";
  el.innerHTML = `<span class="text-outline/50 shrink-0 tabular-nums">${time}</span>${typeHtml}<span class="text-on-surface">${text}</span>`;
  
  actionLogEl.appendChild(el);
    while (actionLogEl.childElementCount > 50) {
      actionLogEl.removeChild(actionLogEl.firstElementChild);
    }
    actionLogEl.scrollTop = actionLogEl.scrollHeight;
  while (actionLogEl.childElementCount > 150) actionLogEl.removeChild(actionLogEl.firstChild);
}

function setState(state) {
  currentState = state;
  if (stateLabel) stateLabel.textContent = state;
  if (!statusDot) return;

  statusDot.className = "w-2 h-2 rounded-full";
  
  const map = {
    [AgentState.RUNNING]:  "bg-tertiary animate-pulse",
    [AgentState.PAUSED]:   "bg-secondary",
    [AgentState.ERROR]:    "bg-error animate-bounce",
    [AgentState.FINISHED]: "bg-primary",
    [AgentState.WAITING_FOR_USER]: "bg-secondary animate-pulse",
    [AgentState.WAITING_FOR_APPROVAL]: "bg-error animate-pulse",
  };
  
  const dotClasses = map[state] || "bg-outline";
  statusDot.className = `w-2 h-2 rounded-full ${dotClasses}`;
}


function setConnectionBadge(quality) {
  if (!connBadge) return; connBadge.textContent = quality;
  if (connBadge) connBadge.className = "conn-badge";
  const q = quality.toLowerCase();
  if (["excellent","good","fair","poor"].includes(q)) connBadge.classList.add(q);
}

function resetToIdle() {
  startBtn.disabled = false; stopBtn.disabled = true; goalInput.disabled = false;
  if (hitlOverlay) hitlOverlay.hidden = true;
  if (approvalOverlay) approvalOverlay.hidden = true;
}
function showError(t) { if (errorMsg) { errorMsg.textContent = t; errorMsg.hidden = false; setTimeout(() => { errorMsg.classList.remove("opacity-0"); errorMsg.classList.add("opacity-100"); }, 10); } }
function hideError() { if (errorMsg) { errorMsg.classList.remove("opacity-100"); errorMsg.classList.add("opacity-0"); setTimeout(() => { errorMsg.hidden = true; }, 300); } }

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// SETTINGS
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

async function loadSettingsUI() {
  const s = await msg({ type: POPUP_GET_SETTINGS });
  if (!s) return;
  settBackendUrl.value     = s.backendUrl;
  settMaxSteps.value       = s.maxSteps;
  if (settCaptureQuality) settCaptureQuality.value = s.captureQuality;
  settServerTimeout.value  = s.serverTimeoutMs;
  if (settStabilizeDelay) settStabilizeDelay.value = s.stabilizeDelayMs;
  settHumanize.checked     = s.humanizeInputs;
  settDeltaFrames.checked  = s.enableDeltaFrames;
  settAuditStream.checked  = s.enableAuditStream;
}

saveSettingsBtn.addEventListener("click", async () => {
  // Helper: parse a numeric field into a finite clamped integer within [min,max].
  // Returns fallback if raw is empty/blank; otherwise clamps to [min,max].
  const clampInt = (raw, min, max, fallback) => {
    if (raw === null || raw === undefined) return fallback; if (typeof raw === 'string' && raw.trim() === '') return fallback;
    const n = Math.round(Number(raw));
    if (!Number.isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, n));
  };

  const settings = {
    backendUrl:        settBackendUrl.value.trim(),
    maxSteps:          clampInt(settMaxSteps.value, 5, 100, DEFAULT_SETTINGS.maxSteps),
    captureQuality:    clampInt((settCaptureQuality ? settCaptureQuality.value : DEFAULT_SETTINGS.captureQuality), 30, 100, DEFAULT_SETTINGS.captureQuality),
    serverTimeoutMs:   clampInt(settServerTimeout.value, 2000, 30000, DEFAULT_SETTINGS.serverTimeoutMs),
    stabilizeDelayMs:  clampInt((settStabilizeDelay ? settStabilizeDelay.value : DEFAULT_SETTINGS.stabilizeDelayMs), 50, 2000, DEFAULT_SETTINGS.stabilizeDelayMs),
    humanizeInputs:    settHumanize.checked,
    enableDeltaFrames: settDeltaFrames.checked,
    enableAuditStream: settAuditStream.checked,
  };
  await msg({ type: POPUP_UPDATE_SETTINGS, settings });
  // Reflect clamped values back into the form so the user sees the saved state.
  settMaxSteps.value       = settings.maxSteps;
  if (settCaptureQuality) settCaptureQuality.value = settings.captureQuality;
  settServerTimeout.value  = settings.serverTimeoutMs;
  if (settStabilizeDelay) settStabilizeDelay.value = settings.stabilizeDelayMs;
  if (settingsMsg) settingsMsg.textContent = "\u2705 Settings saved.";
  if (settingsMsg) settingsMsg.hidden = false;
  setTimeout(() => { if (settingsMsg) settingsMsg.hidden = true; }, 2000);
});

resetSettingsBtn.addEventListener("click", async () => {
  await msg({ type: POPUP_UPDATE_SETTINGS, settings: { ...DEFAULT_SETTINGS } });
  await loadSettingsUI();
  settingsMsg.textContent = "â†©ï¸ Settings reset to defaults.";
  settingsMsg.hidden = false;
  setTimeout(() => { settingsMsg.hidden = true; }, 2000);
});

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// HISTORY
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

async function loadHistoryUI() {
  const history = await msg({ type: POPUP_GET_HISTORY, targetTabId: currentPopupTabId });
  historyList.innerHTML = "";

  if (!history || history.length === 0) {
    historyList.innerHTML = `
      <div id="historyEmpty" class="m-auto text-center flex flex-col items-center opacity-60"><span class="material-symbols-outlined text-[32px] mb-2 text-outline">history</span><span class="text-[12px] text-on-surface-variant">No past sessions yet.</span></div>`;
    return;
  }

  for (const entry of history) {
    const card = document.createElement("div");
    card.className = "neu-extruded bg-surface rounded-2xl p-4 flex flex-col gap-3 transition-transform hover:scale-[1.01]";

    const dur = entry.durationMs
      ? formatDuration(entry.durationMs)
      : "--";

    const result = entry.result || "UNKNOWN";

    const dateStr = entry.date || new Date(entry.timestamp || Date.now()).toLocaleString("en-IN", {
      day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit", hour12: false,
    });

    card.innerHTML = `
      <div class="font-headline-md text-[14px] text-on-surface font-bold whitespace-nowrap overflow-hidden text-ellipsis">${escapeHtml(entry.goal || "Untitled Task")}</div>
      <div class="flex items-center gap-3 flex-wrap font-mono text-[10px] text-on-surface-variant font-bold uppercase tracking-wider">
        <span class="px-2 py-1 rounded neu-recessed ${result === 'ERROR' ? 'text-error' : 'text-primary'}">${result}</span>
        <span class="flex items-center gap-1"><span class="material-symbols-outlined text-[14px]">footprint</span> ${entry.steps || 0} steps</span>
        <span class="flex items-center gap-1"><span class="material-symbols-outlined text-[14px]">timer</span> ${dur}</span>
        <span class="flex items-center gap-1"><span class="material-symbols-outlined text-[14px]">schedule</span> ${dateStr}</span>
      </div>
    `;
    historyList.appendChild(card);
  }
}

function formatDuration(ms) {
  if (ms < 1000) return `${ms}ms`;
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}m ${rem}s`;
}

clearHistoryBtn.addEventListener("click", async () => {
  await msg({ type: POPUP_CLEAR_HISTORY, targetTabId: currentPopupTabId });
  historyList.innerHTML = `
    <div id="historyEmpty" class="m-auto text-center flex flex-col items-center opacity-60"><span class="material-symbols-outlined text-[32px] mb-2 text-outline">history</span><span class="text-[12px] text-on-surface-variant">No past sessions yet.</span></div>`;
});

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// HELPERS
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

function msg(data) {
  return new Promise((r) => chrome.runtime.sendMessage(data, r));
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// FULLSCREEN VIDEO MODAL
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

const videoModal    = $("videoModal");
const modalCanvas   = $("modalCanvas");
const modalCtx = modalCanvas ? modalCanvas.getContext("2d") : null;
const modalTitle    = $("modalTitle");
const modalCloseBtn = $("modalClose");
let activeModalStream = null;
let modalAnimFrame    = null;

document.querySelectorAll(".expand-btn").forEach((btn) => {
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    const target = btn.dataset.target;
    activeModalStream = target;

    if (target === "raw") {
      modalTitle.innerHTML = '<span class="material-symbols-outlined text-[18px] text-primary">visibility</span> Raw Viewport - Fullscreen';
    } else {
      modalTitle.innerHTML = '<span class="material-symbols-outlined text-[18px] text-tertiary">shield_locked</span> Sanitized Stream - Fullscreen';
    }

    if (videoModal) videoModal.hidden = false;
    mirrorToModal();
  });
});

function mirrorToModal() {
  if (!activeModalStream || videoModal.hidden) {
    modalAnimFrame = null;
    return;
  }

  const src = activeModalStream === "raw" ? document.getElementById("liveStream") : document.getElementById("annotatedStream");

  // Match modal canvas resolution to source
  if (modalCanvas.width !== src.width || modalCanvas.height !== src.height) {
    modalCanvas.width  = src.width;
    modalCanvas.height = src.height;
  }

  modalCtx.drawImage(src, 0, 0);
  modalAnimFrame = requestAnimationFrame(mirrorToModal);
}

function closeModal() {
  if (videoModal) videoModal.hidden = true;
  activeModalStream = null;
  if (modalAnimFrame) {
    cancelAnimationFrame(modalAnimFrame);
    modalAnimFrame = null;
  }
}

if(modalCloseBtn) modalCloseBtn.addEventListener("click", closeModal);
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && (videoModal && !videoModal.hidden)) closeModal();
});

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// INIT: Sync state on popup open
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

(async () => {
  const status = await msg({ type: POPUP_GET_STATUS, targetTabId: currentPopupTabId });
    if (status && status.activeTabId && currentPopupTabId && status.activeTabId !== currentPopupTabId && status.state !== AgentState.IDLE) {
      addLog("Agent is running on another tab. Please stop it first.", "warning");
      status.state = AgentState.IDLE;
    }
  if (status) {
    handleStatusUpdate(status);
    if (status.state === AgentState.RUNNING) {
      startBtn.disabled = true; stopBtn.disabled = false; goalInput.disabled = true;
      if (status.goal) goalInput.value = status.goal;
    }
  }
})();

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// VAULT MANAGEMENT
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

const VAULT_FIELDS = [
  { key: 'full_name', label: 'Full Name',  placeholder: 'John Doe', type: 'text' },
  { key: 'email',     label: 'Email',      placeholder: 'john@example.com', type: 'email' },
  { key: 'phone',     label: 'Phone',      placeholder: '+91 98765 43210', type: 'tel' },
  { key: 'address',   label: 'Address',    placeholder: '123 Main Street', type: 'text' },
  { key: 'city',      label: 'City',       placeholder: 'Mumbai', type: 'text' },
  { key: 'state',     label: 'State',      placeholder: 'Maharashtra', type: 'text' },
  { key: 'pincode', label: 'Pincode', placeholder: '400001', type: 'number' },
  { key: 'dob',       label: 'Date of Birth', placeholder: '', type: 'date' },
  { key: 'gender',    label: 'Gender',     placeholder: 'Select Gender', type: 'select' },
];

async function loadVaultUI() {
  const data = await msg({ type: POPUP_VAULT_GET });
  const vaultForm = document.getElementById("vaultForm");
  if (vaultForm) {
    vaultForm.innerHTML = "";
    for (const field of VAULT_FIELDS) {
      const wrapper = document.createElement("div");
      wrapper.className = "flex flex-col gap-xs w-full mb-3";
      
      const label = document.createElement("label");
      label.className = "font-label-md text-label-md text-on-surface-variant ml-2";
      label.textContent = field.label;
      
      const inner = document.createElement("div");
      inner.className = "relative flex items-center w-full";
      
      let input;
      if (field.type === "select") {
        input = document.createElement("select");
        input.className = "neu-recessed w-full rounded-xl px-4 py-3 text-body-md text-primary font-bold border-none outline-none appearance-none bg-transparent cursor-pointer";
        const opt1 = document.createElement("option"); opt1.value = ""; opt1.textContent = field.placeholder;
        const opt2 = document.createElement("option"); opt2.value = "Male"; opt2.textContent = "Male";
        const opt3 = document.createElement("option"); opt3.value = "Female"; opt3.textContent = "Female";
        const opt4 = document.createElement("option"); opt4.value = "Other"; opt4.textContent = "Other";
        input.appendChild(opt1); input.appendChild(opt2); input.appendChild(opt3); input.appendChild(opt4);
        input.id = `vault_${field.key}`;
        // icon logic appended below
      } else {
        input = document.createElement("input");
        input.type = field.type;
        input.placeholder = field.placeholder;
        input.id = `vault_${field.key}`;
        input.className = "neu-recessed w-full rounded-xl px-4 py-3 text-body-md text-primary font-bold border-none outline-none";
      }
      if (field.type === "select") {
        input.style.appearance = "none";
        input.style.webkitAppearance = "none";
        input.style.mozAppearance = "none";
      }

      inner.appendChild(input);

      if (field.type === "select") {
        const icon = document.createElement("span");
        icon.className = "material-symbols-outlined text-on-surface-variant";
        icon.style.cssText = "position: absolute; right: 12px; pointer-events: none;";
        icon.textContent = "expand_more";
        inner.appendChild(icon);
      }
      
      if (field.key === 'pincode' || field.type === 'tel') {
        input.addEventListener('input', function() {
          this.value = this.value.replace(/[^0-9+\-\s]/g, '');
        });
      }
      
      wrapper.appendChild(label);
      wrapper.appendChild(inner);
      vaultForm.appendChild(wrapper);
    }
  }
  populateVaultUI(data || {});
}


function populateVaultUI(vaultData) {
  for (const field of VAULT_FIELDS) {
    const input = document.getElementById(`vault_${field.key}`);
    if (input && vaultData[field.key]) {
      input.value = vaultData[field.key];
    }
  }
  // Update count (based on visible fields)
  updateVaultCountLocally();
}

function updateVaultCountLocally() {
  const filled = VAULT_FIELDS.filter((f) => {
    const input = document.getElementById(`vault_${f.key}`);
    return input && input.value && input.value.trim() !== '';
  }).length;
  const countEl = document.getElementById('vaultFilledCount');
  if (countEl) countEl.textContent = filled;
}

async function saveVault() {
  for (const field of VAULT_FIELDS) {
    const input = document.getElementById(`vault_${field.key}`);
    if (!input) continue;
    const raw = input.value;
    if (raw && raw.trim()) {
      await msg({ type: POPUP_VAULT_SET, key: field.key, value: raw.trim() });
    } else {
      await msg({ type: POPUP_VAULT_DELETE, key: field.key });
    }
  }
  updateVaultCountLocally();
  showVaultMsg('Vault saved securely.', 'success');
  addLog('[Vault] Identity data saved locally.', 'info');
}

async function deleteVaultField(key) {
  await msg({ type: POPUP_VAULT_DELETE, key });
  const input = document.getElementById(`vault_${key}`);
  if (input) input.value = '';
  updateVaultCountLocally();
  showVaultMsg(`Removed ${key} from vault.`, 'info');
}

async function flushVault() {
  if (!confirm('Clear ALL vault data? This cannot be undone.')) return;
  await msg({ type: POPUP_VAULT_FLUSH });
  for (const field of VAULT_FIELDS) {
    const input = document.getElementById(`vault_${field.key}`);
    if (input) input.value = '';
  }
  updateVaultCountLocally();
  showVaultMsg('Vault cleared.', 'warning');
  addLog('[Vault] All identity data cleared.', 'warning');
}

function showVaultMsg(text, type = 'info') {
  if (!vaultMsg) return;
  vaultMsg.textContent = text;
  
  // Tailwind color classes based on type
  vaultMsg.classList.remove("text-primary", "text-error", "text-warning", "text-tertiary", "text-secondary");
  if (type === 'success') vaultMsg.classList.add("text-tertiary");
  else if (type === 'warning') vaultMsg.classList.add("text-error");
  else vaultMsg.classList.add("text-primary");

  vaultMsg.classList.remove("opacity-0");
  vaultMsg.classList.add("opacity-100");
  setTimeout(() => { 
    vaultMsg.classList.remove("opacity-100");
    vaultMsg.classList.add("opacity-0"); 
  }, 3000);

}

  
  // Wire individual delete buttons
  for (const field of VAULT_FIELDS) {
    const delBtn = document.getElementById(`vaultDel_${field.key}`);
    if (delBtn) delBtn.addEventListener('click', () => deleteVaultField(field.key));
  }


// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// HITL (HUMAN-IN-THE-LOOP) CHAT
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

function showHitlPrompt(payload) {
  pendingHitlCorrelationId = payload.correlationId;
  pendingHitlVaultKey = payload.suggestedVaultKey || null;
  
  hitlQuestion.textContent = payload.question;
  hitlInput.value = '';
  hitlOverlay.hidden = false;
  hitlInput.focus();
  
  if (pendingHitlVaultKey) {
    hitlVaultKeyLabel.hidden = false;
    hitlVaultKey.textContent = pendingHitlVaultKey;
  } else {
    hitlVaultKeyLabel.hidden = true;
  }
  
  setState(AgentState.WAITING_FOR_USER);
  addLog(`[HITL] Agent asks: "${payload.question}"`, 'warning');
}

async function sendHitlResponse() {
  const answer = hitlInput.value.trim();
  if (!answer) return;
  
  const saveToVault = hitlSaveToVault.checked && pendingHitlVaultKey;
  
  if (pendingHitlCorrelationId !== null) {
    await msg({
      type: POPUP_HITL_RESPONSE,
      correlationId: pendingHitlCorrelationId,
      answer,
      saveToVault,
      vaultKey: pendingHitlVaultKey,
    });
  }
  
  hitlOverlay.hidden = true;
  pendingHitlCorrelationId = null;
  pendingHitlVaultKey = null;
  addLog(`[HITL] User responded (answer saved: ${saveToVault ? 'yes' : 'no'})`, 'action');
}

if (hitlSendBtn) hitlSendBtn.addEventListener('click', sendHitlResponse);
if (hitlInput) hitlInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') sendHitlResponse();
});

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// JIT ACTION APPROVAL
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

function showApprovalPrompt(payload) {
  pendingApprovalCorrelationId = payload.correlationId;
  approvalContext.textContent = payload.context || 'The agent wants to perform a sensitive action.';
  approvalDetail.textContent = payload.detail || '';
  approvalOverlay.hidden = false;
  
  setState(AgentState.WAITING_FOR_APPROVAL);
  addLog(`[APPROVAL] Sensitive action: "${payload.context}"`, 'warning');
}

async function sendApprovalResponse(approved) {
  if (pendingApprovalCorrelationId !== null) {
    await msg({
      type: POPUP_APPROVAL_RESPONSE,
      correlationId: pendingApprovalCorrelationId,
      approved,
    });
  }
  
  approvalOverlay.hidden = true;
  pendingApprovalCorrelationId = null;
  addLog(`[APPROVAL] User ${approved ? 'APPROVED' : 'DENIED'} the action.`, approved ? 'action' : 'error');
}

if (approvalApproveBtn) approvalApproveBtn.addEventListener('click', () => sendApprovalResponse(true));
if (approvalDenyBtn) approvalDenyBtn.addEventListener('click', () => sendApprovalResponse(false));



























// Wire vault buttons
const saveVaultBtn = document.getElementById('saveVaultBtn');
const flushVaultBtn = document.getElementById('clearVaultBtn');
if (saveVaultBtn) saveVaultBtn.addEventListener('click', saveVault);
if (flushVaultBtn) flushVaultBtn.addEventListener('click', flushVault);
loadVaultUI();










// FULLSCREEN MODALS
const btnRawFullscreen = document.getElementById("btnRawFullscreen");
const btnSanitizedFullscreen = document.getElementById("btnSanitizedFullscreen");
const fullscreenModal = document.getElementById("fullscreenModal");
const btnCloseModal = document.getElementById("btnCloseModal");
// modalTitle already declared
const modalFeed = document.getElementById("modalFeed");

let activeFullscreenInterval = null;

if (btnRawFullscreen) {
  btnRawFullscreen.addEventListener("click", () => {
    modalTitle.innerHTML = "<span class=\"material-symbols-outlined text-primary\">visibility</span> Raw Viewport - Fullscreen";
    fullscreenModal.classList.remove("opacity-0", "pointer-events-none");
    fullscreenModal.classList.add("opacity-100");
    if (activeFullscreenInterval) clearInterval(activeFullscreenInterval);
    activeFullscreenInterval = setInterval(() => {
      const rawFeed = document.getElementById("rawFeed");
      if (rawFeed && rawFeed.src) modalFeed.src = rawFeed.src;
    }, 100);
  });
}

if (btnSanitizedFullscreen) {
  btnSanitizedFullscreen.addEventListener("click", () => {
    modalTitle.innerHTML = "<span class=\"material-symbols-outlined text-primary\">security</span> Sanitized Stream - Fullscreen";
    fullscreenModal.classList.remove("opacity-0", "pointer-events-none");
    fullscreenModal.classList.add("opacity-100");
    if (activeFullscreenInterval) clearInterval(activeFullscreenInterval);
    activeFullscreenInterval = setInterval(() => {
      const redactedFeed = document.getElementById("redactedFeed");
      if (redactedFeed && redactedFeed.src) modalFeed.src = redactedFeed.src;
    }, 100);
  });
}

if (btnCloseModal) {
  btnCloseModal.addEventListener("click", () => {
    fullscreenModal.classList.remove("opacity-100");
    fullscreenModal.classList.add("opacity-0", "pointer-events-none");
    if (activeFullscreenInterval) {
      clearInterval(activeFullscreenInterval);
      activeFullscreenInterval = null;
    }
  });
}
