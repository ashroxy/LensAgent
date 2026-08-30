/**
 * popup.js — LensAgent Popup Controller (Enhanced)
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
  BG_AGENT_STATUS, BG_SETTINGS_UPDATED,
  BG_HITL_PROMPT, BG_APPROVAL_PROMPT, BG_VAULT_DATA,
  AUDIT_FRAME_UPDATE, AUDIT_ACTION_LOG,
  AgentState, DEFAULT_SETTINGS,
} from "../lib/message-types.js";

// ═══════════════════════════════════════════════════════════════════════════════
// DOM REFS
// ═══════════════════════════════════════════════════════════════════════════════

const $ = (id) => document.getElementById(id);

const rawCanvas       = $("rawCanvas");
const rawCtx          = rawCanvas.getContext("2d");
const redactedCanvas  = $("redactedCanvas");
const redactedCtx     = redactedCanvas.getContext("2d");
const sparkCanvas     = $("sparklineCanvas");
const sparkCtx        = sparkCanvas.getContext("2d");

const startBtn        = $("startBtn");
const stopBtn         = $("stopBtn");
const goalInput       = $("goalInput");
const statusDot       = $("statusDot");
const stateLabel      = $("stateLabel");
const connBadge       = $("connectionBadge");
const errorMsg        = $("errorMsg");

const stepCountEl     = $("stepCount");
const maxStepsEl      = $("maxSteps");
const redactionCountEl = $("redactionCount");
const latencyDisplayEl = $("latencyDisplay");
const fpsDisplayEl    = $("fpsDisplay");
const frameCountEl    = $("frameCount");
const skippedCountEl  = $("skippedCount");
const qualityDisplayEl = $("qualityDisplay");
const dprDisplayEl    = $("dprDisplay");
const actionLogEl     = $("actionLog");
const exportLogBtn    = $("exportLogBtn");

// Settings form
const settBackendUrl     = $("settBackendUrl");
const settMaxSteps       = $("settMaxSteps");
const settCaptureQuality = $("settCaptureQuality");
const settServerTimeout  = $("settServerTimeout");
const settStabilizeDelay = $("settStabilizeDelay");
const settHumanize       = $("settHumanize");
const settDeltaFrames    = $("settDeltaFrames");
const settAuditStream    = $("settAuditStream");
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

// ═══════════════════════════════════════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════════════════════════════════════

let currentState   = AgentState.IDLE;
let latencyHistory = [];  // For sparkline
const MAX_SPARKLINE = 60;

let pendingHitlCorrelationId = null;
let pendingHitlVaultKey = null;
let pendingApprovalCorrelationId = null;

// ═══════════════════════════════════════════════════════════════════════════════
// TAB NAVIGATION
// ═══════════════════════════════════════════════════════════════════════════════

document.querySelectorAll(".nav-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".nav-btn").forEach((t) => t.classList.remove("active"));
    document.querySelectorAll(".tab-content").forEach((c) => c.classList.remove("active"));
    btn.classList.add("active");
    const target = btn.dataset.tab;
    document.getElementById(`tab-${target}`).classList.add("active");

    // Load data when switching to settings or history
    if (target === "settings") loadSettingsUI();
    if (target === "history") loadHistoryUI();
    if (target === "vault") loadVaultUI();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// POP-OUT MODE DETECTION
// ═══════════════════════════════════════════════════════════════════════════════

// If this page is opened as a full tab (not a popup), we are in "pop-out" mode.
// In pop-out mode, Start Agent must target a real webpage tab, not this extension tab.
let targetTabId = null;
const isPopoutMode = window.location.href.startsWith("chrome-extension://") 
  && (window.innerWidth > 800 || document.referrer === "");

const btnPopout = document.getElementById("btnPopout");

(async () => {
  if (isPopoutMode || window.matchMedia("(min-width: 801px)").matches) {
    // We're likely in a full tab — resolve the target tab now
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

// ═══════════════════════════════════════════════════════════════════════════════
// CONTROLS
// ═══════════════════════════════════════════════════════════════════════════════

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
    addLog(`Agent started — Goal: "${goal}"`, "action");
    if (resp.dpr) dprDisplayEl.textContent = `DPR: ${resp.dpr}`;
    latencyHistory = [];
  } else {
    startBtn.disabled = false;
    showError(resp?.error || "Failed to start agent.");
    addLog(`Start failed: ${resp?.error}`, "error");
  }
});

stopBtn.addEventListener("click", async () => {
  stopBtn.disabled = true;
  await msg({ type: POPUP_STOP_AGENT });
  resetToIdle();
  addLog("Agent stopped.", "warning");
});

// ═══════════════════════════════════════════════════════════════════════════════
// EXPORT LOG
// ═══════════════════════════════════════════════════════════════════════════════

exportLogBtn.addEventListener("click", async () => {
  const resp = await msg({ type: POPUP_EXPORT_LOG });
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

// ═══════════════════════════════════════════════════════════════════════════════
// INCOMING MESSAGES
// ═══════════════════════════════════════════════════════════════════════════════

chrome.runtime.onMessage.addListener((message) => {
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

// ═══════════════════════════════════════════════════════════════════════════════
// AUDIT FRAME RENDERER
// ═══════════════════════════════════════════════════════════════════════════════

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

// ═══════════════════════════════════════════════════════════════════════════════
// SPARKLINE CHART
// ═══════════════════════════════════════════════════════════════════════════════

function updateSparkline(latency) {
  latencyHistory.push(latency);
  if (latencyHistory.length > MAX_SPARKLINE) latencyHistory.shift();

  const w = sparkCanvas.width;
  const h = sparkCanvas.height;
  const max = Math.max(50, ...latencyHistory);

  sparkCtx.clearRect(0, 0, w, h);

  // Grid line at 500ms
  sparkCtx.strokeStyle = "#222222";
  sparkCtx.lineWidth = 0.5;
  const gridY = h - (500 / max) * (h - 8);
  sparkCtx.beginPath();
  sparkCtx.moveTo(0, gridY);
  sparkCtx.lineTo(w, gridY);
  sparkCtx.stroke();

  if (latencyHistory.length < 2) return;

  // Gradient fill
  const grad = sparkCtx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, "rgba(237, 237, 237, 0.1)");
  grad.addColorStop(1, "rgba(237, 237, 237, 0.0)");

  const step = w / (MAX_SPARKLINE - 1);

  // Fill area
  sparkCtx.beginPath();
  sparkCtx.moveTo(0, h);
  for (let i = 0; i < latencyHistory.length; i++) {
    const x = i * step;
    const y = h - (latencyHistory[i] / max) * (h - 8);
    sparkCtx.lineTo(x, y);
  }
  sparkCtx.lineTo((latencyHistory.length - 1) * step, h);
  sparkCtx.closePath();
  sparkCtx.fillStyle = grad;
  sparkCtx.fill();

  // Line
  sparkCtx.beginPath();
  for (let i = 0; i < latencyHistory.length; i++) {
    const x = i * step;
    const y = h - (latencyHistory[i] / max) * (h - 8);
    i === 0 ? sparkCtx.moveTo(x, y) : sparkCtx.lineTo(x, y);
  }
  sparkCtx.strokeStyle = "#ededed";
  sparkCtx.lineWidth = 1.5;
  sparkCtx.stroke();

  // Current value dot
  const lastX = (latencyHistory.length - 1) * step;
  const lastY = h - (latencyHistory[latencyHistory.length - 1] / max) * (h - 8);
  sparkCtx.beginPath();
  sparkCtx.arc(lastX, lastY, 2.5, 0, 2 * Math.PI);
  sparkCtx.fillStyle = "#ededed";
  sparkCtx.fill();
}

// ═══════════════════════════════════════════════════════════════════════════════
// STATUS & LOG
// ═══════════════════════════════════════════════════════════════════════════════

function handleStatusUpdate(p) {
  setState(p.state);
  if (p.stepCount != null) stepCountEl.textContent = p.stepCount;
  if (p.maxSteps != null)  maxStepsEl.textContent  = p.maxSteps;
  if (p.avgLatency != null) {
    latencyDisplayEl.textContent = `${p.avgLatency}ms`;
    updateSparkline(p.avgLatency);
  }
  if (p.metrics) {
    if (p.metrics.currentFps != null)      fpsDisplayEl.textContent     = p.metrics.currentFps;
    if (p.metrics.totalFrames != null)     frameCountEl.textContent     = p.metrics.totalFrames;
    if (p.metrics.skippedFrames != null)   skippedCountEl.textContent   = p.metrics.skippedFrames;
    if (p.metrics.currentQuality != null)  qualityDisplayEl.textContent = `${p.metrics.currentQuality}%`;
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
  const placeholder = actionLogEl.querySelector(".log-info");
  if (placeholder?.textContent.includes("Waiting")) placeholder.remove();

  const el = document.createElement("div");
  el.className = `log-entry log-${type}`;
  el.textContent = `[${new Date().toLocaleTimeString()}] ${text}`;
  actionLogEl.appendChild(el);
  actionLogEl.scrollTop = actionLogEl.scrollHeight;
  while (actionLogEl.childElementCount > 150) actionLogEl.removeChild(actionLogEl.firstChild);
}

function setState(state) {
  currentState = state;
  stateLabel.textContent = state;
  stateLabel.className = "state-label";
  statusDot.className  = "status-dot";

  const map = {
    [AgentState.RUNNING]:  ["running", "active"],
    [AgentState.PAUSED]:   ["paused",  "paused"],
    [AgentState.ERROR]:    ["error",   "error"],
    [AgentState.FINISHED]: ["finished", ""],
    [AgentState.WAITING_FOR_USER]: ["paused", "paused"],
    [AgentState.WAITING_FOR_APPROVAL]: ["paused", "paused"],
  };
  const [lbl, dot] = map[state] || ["", ""];
  if (lbl) stateLabel.classList.add(lbl);
  if (dot) statusDot.classList.add(dot);
}

function setConnectionBadge(quality) {
  connBadge.textContent = quality;
  connBadge.className = "conn-badge";
  const q = quality.toLowerCase();
  if (["excellent","good","fair","poor"].includes(q)) connBadge.classList.add(q);
}

function resetToIdle() {
  startBtn.disabled = false; stopBtn.disabled = true; goalInput.disabled = false;
  if (hitlOverlay) hitlOverlay.hidden = true;
  if (approvalOverlay) approvalOverlay.hidden = true;
}
function showError(t) { errorMsg.textContent = t; errorMsg.hidden = false; }
function hideError()   { errorMsg.hidden = true; }

// ═══════════════════════════════════════════════════════════════════════════════
// SETTINGS
// ═══════════════════════════════════════════════════════════════════════════════

async function loadSettingsUI() {
  const s = await msg({ type: POPUP_GET_SETTINGS });
  if (!s) return;
  settBackendUrl.value     = s.backendUrl;
  settMaxSteps.value       = s.maxSteps;
  settCaptureQuality.value = s.captureQuality;
  settServerTimeout.value  = s.serverTimeoutMs;
  settStabilizeDelay.value = s.stabilizeDelayMs;
  settHumanize.checked     = s.humanizeInputs;
  settDeltaFrames.checked  = s.enableDeltaFrames;
  settAuditStream.checked  = s.enableAuditStream;
}

saveSettingsBtn.addEventListener("click", async () => {
  const settings = {
    backendUrl:        settBackendUrl.value.trim(),
    maxSteps:          parseInt(settMaxSteps.value, 10),
    captureQuality:    parseInt(settCaptureQuality.value, 10),
    serverTimeoutMs:   parseInt(settServerTimeout.value, 10),
    stabilizeDelayMs:  parseInt(settStabilizeDelay.value, 10),
    humanizeInputs:    settHumanize.checked,
    enableDeltaFrames: settDeltaFrames.checked,
    enableAuditStream: settAuditStream.checked,
  };
  await msg({ type: POPUP_UPDATE_SETTINGS, settings });
  settingsMsg.textContent = "✅ Settings saved.";
  settingsMsg.hidden = false;
  setTimeout(() => { settingsMsg.hidden = true; }, 2000);
});

resetSettingsBtn.addEventListener("click", async () => {
  await msg({ type: POPUP_UPDATE_SETTINGS, settings: { ...DEFAULT_SETTINGS } });
  await loadSettingsUI();
  settingsMsg.textContent = "↩️ Settings reset to defaults.";
  settingsMsg.hidden = false;
  setTimeout(() => { settingsMsg.hidden = true; }, 2000);
});

// ═══════════════════════════════════════════════════════════════════════════════
// HISTORY
// ═══════════════════════════════════════════════════════════════════════════════

async function loadHistoryUI() {
  const history = await msg({ type: POPUP_GET_HISTORY });
  historyList.innerHTML = "";

  if (!history || history.length === 0) {
    historyList.innerHTML = `
      <div class="history-empty">
        <span class="material-symbols-outlined">inbox</span>
        No past sessions yet. Start your first agent task.
      </div>`;
    return;
  }

  for (const entry of history) {
    const card = document.createElement("div");
    card.className = "history-card";

    const dur = entry.durationMs
      ? formatDuration(entry.durationMs)
      : "--";

    const result = entry.result || "UNKNOWN";
    const resultIcon = result.includes("FINISHED") || result.includes("ACHIEVED") ? "check_circle"
                     : result.includes("STOP") ? "pause_circle"
                     : "error";

    const dateStr = entry.date || new Date(entry.timestamp || Date.now()).toLocaleString("en-IN", {
      day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit", hour12: false,
    });

    card.innerHTML = `
      <div class="hc-goal">${escapeHtml(entry.goal || "Untitled Task")}</div>
      <div class="hc-meta">
        <span class="hc-result ${result}">${result}</span>
        <span><span class="material-symbols-outlined">footprint</span> ${entry.steps || 0} steps</span>
        <span><span class="material-symbols-outlined">timer</span> ${dur}</span>
        <span><span class="material-symbols-outlined">schedule</span> ${dateStr}</span>
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
  await msg({ type: POPUP_UPDATE_SETTINGS, settings: {} });
  historyList.innerHTML = `
    <div class="history-empty">
      <span class="material-symbols-outlined">inbox</span>
      History cleared.
    </div>`;
});

// ═══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

function msg(data) {
  return new Promise((r) => chrome.runtime.sendMessage(data, r));
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

// ═══════════════════════════════════════════════════════════════════════════════
// FULLSCREEN VIDEO MODAL
// ═══════════════════════════════════════════════════════════════════════════════

const videoModal    = $("videoModal");
const modalCanvas   = $("modalCanvas");
const modalCtx      = modalCanvas.getContext("2d");
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
      modalTitle.innerHTML = '<span class="material-symbols-outlined text-sm">visibility</span> Raw Viewport — Fullscreen';
      modalTitle.className = "panel-title";
    } else {
      modalTitle.innerHTML = '<span class="material-symbols-outlined text-sm">shield_locked</span> Sanitized Stream — Fullscreen';
      modalTitle.className = "panel-title text-green";
    }

    videoModal.hidden = false;
    mirrorToModal();
  });
});

function mirrorToModal() {
  if (!activeModalStream || videoModal.hidden) {
    modalAnimFrame = null;
    return;
  }

  const src = activeModalStream === "raw" ? rawCanvas : redactedCanvas;

  // Match modal canvas resolution to source
  if (modalCanvas.width !== src.width || modalCanvas.height !== src.height) {
    modalCanvas.width  = src.width;
    modalCanvas.height = src.height;
  }

  modalCtx.drawImage(src, 0, 0);
  modalAnimFrame = requestAnimationFrame(mirrorToModal);
}

function closeModal() {
  videoModal.hidden = true;
  activeModalStream = null;
  if (modalAnimFrame) {
    cancelAnimationFrame(modalAnimFrame);
    modalAnimFrame = null;
  }
}

modalCloseBtn.addEventListener("click", closeModal);
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !videoModal.hidden) closeModal();
});

// ═══════════════════════════════════════════════════════════════════════════════
// INIT: Sync state on popup open
// ═══════════════════════════════════════════════════════════════════════════════

(async () => {
  const status = await msg({ type: POPUP_GET_STATUS });
  if (status) {
    handleStatusUpdate(status);
    if (status.state === AgentState.RUNNING) {
      startBtn.disabled = true; stopBtn.disabled = false; goalInput.disabled = true;
      if (status.goal) goalInput.value = status.goal;
    }
  }
})();

// ═══════════════════════════════════════════════════════════════════════════════
// VAULT MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════════

const VAULT_FIELDS = [
  { key: 'full_name',  label: 'Full Name',  placeholder: 'John Doe' },
  { key: 'first_name', label: 'First Name', placeholder: 'John' },
  { key: 'last_name',  label: 'Last Name',  placeholder: 'Doe' },
  { key: 'email',      label: 'Email',      placeholder: 'john@example.com', type: 'email' },
  { key: 'phone',      label: 'Phone',      placeholder: '+91 98765 43210', type: 'tel' },
  { key: 'address',    label: 'Address',    placeholder: '123 Main Street' },
  { key: 'city',       label: 'City',       placeholder: 'Mumbai' },
  { key: 'state',      label: 'State',      placeholder: 'Maharashtra' },
  { key: 'pincode',    label: 'Pincode',    placeholder: '400001' },
  { key: 'dob',        label: 'Date of Birth', placeholder: '', type: 'date' },
  { key: 'gender',     label: 'Gender',     placeholder: 'Male / Female / Other' },
];

async function loadVaultUI() {
  const data = await msg({ type: POPUP_VAULT_GET });
  populateVaultUI(data || {});
}

function populateVaultUI(vaultData) {
  for (const field of VAULT_FIELDS) {
    const input = document.getElementById(`vault_${field.key}`);
    if (input && vaultData[field.key]) {
      input.value = vaultData[field.key];
    }
  }
  // Update count
  const filledCount = Object.keys(vaultData || {}).filter(k => vaultData[k]).length;
  const countEl = document.getElementById('vaultFilledCount');
  if (countEl) countEl.textContent = filledCount;
}

async function saveVault() {
  for (const field of VAULT_FIELDS) {
    const input = document.getElementById(`vault_${field.key}`);
    if (input && input.value.trim()) {
      await msg({ type: POPUP_VAULT_SET, key: field.key, value: input.value.trim() });
    }
  }
  showVaultMsg('Vault saved securely.', 'success');
  addLog('[Vault] Identity data saved locally.', 'info');
}

async function deleteVaultField(key) {
  await msg({ type: POPUP_VAULT_DELETE, key });
  const input = document.getElementById(`vault_${key}`);
  if (input) input.value = '';
  showVaultMsg(`Removed ${key} from vault.`, 'info');
}

async function flushVault() {
  if (!confirm('Clear ALL vault data? This cannot be undone.')) return;
  await msg({ type: POPUP_VAULT_FLUSH });
  for (const field of VAULT_FIELDS) {
    const input = document.getElementById(`vault_${field.key}`);
    if (input) input.value = '';
  }
  showVaultMsg('Vault cleared.', 'warning');
  addLog('[Vault] All identity data cleared.', 'warning');
}

function showVaultMsg(text, type = 'info') {
  if (!vaultMsg) return;
  vaultMsg.textContent = text;
  vaultMsg.hidden = false;
  vaultMsg.style.color = type === 'success' ? '#22c55e' : type === 'warning' ? '#f59e0b' : '#94a3b8';
  setTimeout(() => { vaultMsg.hidden = true; }, 3000);
}

// Wire vault buttons
document.addEventListener('DOMContentLoaded', () => {
  const saveVaultBtn = document.getElementById('saveVaultBtn');
  const flushVaultBtn = document.getElementById('flushVaultBtn');
  if (saveVaultBtn) saveVaultBtn.addEventListener('click', saveVault);
  if (flushVaultBtn) flushVaultBtn.addEventListener('click', flushVault);
  
  // Wire individual delete buttons
  for (const field of VAULT_FIELDS) {
    const delBtn = document.getElementById(`vaultDel_${field.key}`);
    if (delBtn) delBtn.addEventListener('click', () => deleteVaultField(field.key));
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// HITL (HUMAN-IN-THE-LOOP) CHAT
// ═══════════════════════════════════════════════════════════════════════════════

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

// ═══════════════════════════════════════════════════════════════════════════════
// JIT ACTION APPROVAL
// ═══════════════════════════════════════════════════════════════════════════════

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
