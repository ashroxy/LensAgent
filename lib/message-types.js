/**
 * message-types.js — Extension-Wide Communication Protocol
 * ==========================================================
 * Single source of truth for every message type, state enum, and
 * shared constant flowing through the extension.
 *
 * Import this module in background, offscreen, and popup contexts.
 *
 * Naming Convention:
 *   POPUP_*     → Messages originating from the popup UI
 *   BG_*        → Messages originating from the background service worker
 *   OS_*        → Messages originating from the offscreen document
 *   AUDIT_*     → Messages destined for the popup audit panel
 *   SETTINGS_*  → Settings-related messages
 */

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * TEAM DATA CONTRACTS (JSDoc Type Definitions)
 * ─────────────────────────────────────────────────────────────────────────────
 */

/**
 * @typedef {Object} BoundingBox
 * @property {number} id - Unique numeric ID for the UI element
 * @property {string} type - UI element type (e.g., 'button', 'input', 'link', 'text')
 * @property {number[]} bbox - [x, y, width, height] in device-independent pixels
 * @property {number} [confidence] - Optional detection confidence score (0.0 to 1.0)
 * @property {string} [label] - Optional extracted text or aria-label
 */

/**
 * @typedef {Object} PerceptionResult
 * @property {string} rawImageBase64 - Original unredacted frame (JPEG)
 * @property {string} redactedImageBase64 - Sanitized frame for server (JPEG)
 * @property {BoundingBox[]} elements - Detected UI elements from Member 2's model
 * @property {BoundingBox[]} redactedRegions - Areas blacked out by Member 3's engine
 */

/**
 * @typedef {Object} AgentAction
 * @property {string} type - The action type (e.g., 'CLICK', 'TYPE', 'TERMINATE')
 * @property {number} [x] - X coordinate (required for clicks/drags/hovers)
 * @property {number} [y] - Y coordinate (required for clicks/drags/hovers)
 * @property {string} [text] - Text to type (required for TYPE actions)
 * @property {string} [key] - Key to press (required for PRESS_KEY actions)
 */

/**
 * @typedef {Object} ServerDecision
 * @property {string} thought - Member 4's VLM reasoning for the chosen actions
 * @property {AgentAction[]} actions - Ordered list of actions to execute in the browser
 */

// ═══════════════════════════════════════════════════════════════════════════════
// POPUP → BACKGROUND
// ═══════════════════════════════════════════════════════════════════════════════

export const POPUP_START_AGENT      = "POPUP_START_AGENT";
export const POPUP_STOP_AGENT       = "POPUP_STOP_AGENT";
export const POPUP_GET_STATUS       = "POPUP_GET_STATUS";
export const POPUP_GET_HISTORY      = "POPUP_GET_HISTORY";
export const POPUP_EXPORT_LOG       = "POPUP_EXPORT_LOG";
export const POPUP_UPDATE_SETTINGS  = "POPUP_UPDATE_SETTINGS";
export const POPUP_GET_SETTINGS     = "POPUP_GET_SETTINGS";
export const POPUP_HITL_RESPONSE     = "POPUP_HITL_RESPONSE";     // User answered an HITL question
export const POPUP_APPROVAL_RESPONSE = "POPUP_APPROVAL_RESPONSE"; // User approved/denied a sensitive action
export const POPUP_VAULT_GET         = "POPUP_VAULT_GET";         // Get all vault entries
export const POPUP_VAULT_SET         = "POPUP_VAULT_SET";         // Set a vault entry
export const POPUP_VAULT_DELETE      = "POPUP_VAULT_DELETE";      // Delete a vault entry
export const POPUP_VAULT_FLUSH       = "POPUP_VAULT_FLUSH";       // Clear entire vault
export const POPUP_CLEAR_HISTORY     = "POPUP_CLEAR_HISTORY";     // Clear session history

// ═══════════════════════════════════════════════════════════════════════════════
// BACKGROUND → POPUP
// ═══════════════════════════════════════════════════════════════════════════════

export const BG_AGENT_STATUS        = "BG_AGENT_STATUS";
export const AUDIT_FRAME_UPDATE     = "AUDIT_FRAME_UPDATE";
export const AUDIT_ACTION_LOG       = "AUDIT_ACTION_LOG";
export const BG_SETTINGS_UPDATED    = "BG_SETTINGS_UPDATED";
export const BG_SESSION_HISTORY     = "BG_SESSION_HISTORY";
export const BG_HITL_PROMPT          = "BG_HITL_PROMPT";          // Agent is asking user a question
export const BG_APPROVAL_PROMPT      = "BG_APPROVAL_PROMPT";      // Agent needs approval for sensitive action
export const BG_VAULT_DATA           = "BG_VAULT_DATA";           // Vault data response

// ═══════════════════════════════════════════════════════════════════════════════
// BACKGROUND ↔ OFFSCREEN (via Port)
// ═══════════════════════════════════════════════════════════════════════════════

export const BG_PROCESS_FRAME       = "BG_PROCESS_FRAME";
export const OS_PERCEPTION_DONE     = "OS_PERCEPTION_DONE";
export const OS_READY               = "OS_READY";
export const OS_WEBGPU_STATUS       = "OS_WEBGPU_STATUS";
export const OS_PERF_METRICS        = "OS_PERF_METRICS";

// ═══════════════════════════════════════════════════════════════════════════════
// PORT CHANNEL NAMES
// ═══════════════════════════════════════════════════════════════════════════════

export const PORT_OFFSCREEN         = "PORT_OFFSCREEN_PERCEPTION";

// ═══════════════════════════════════════════════════════════════════════════════
// HEARTBEAT / KEEP-ALIVE
// ═══════════════════════════════════════════════════════════════════════════════

export const HEARTBEAT_PING         = "HEARTBEAT_PING";
export const HEARTBEAT_PONG         = "HEARTBEAT_PONG";

// ═══════════════════════════════════════════════════════════════════════════════
// ENUMS
// ═══════════════════════════════════════════════════════════════════════════════

/** Agent lifecycle states */
export const AgentState = Object.freeze({
  IDLE:           "IDLE",
  STARTING:       "STARTING",
  RUNNING:        "RUNNING",
  PAUSED:         "PAUSED",
  STOPPING:       "STOPPING",
  ERROR:          "ERROR",
  FINISHED:       "FINISHED",
  RECOVERING:     "RECOVERING",     // Auto-recovery from detach/crash
  WAITING_FOR_USER:    "WAITING_FOR_USER",      // Paused, waiting for HITL response
  WAITING_FOR_APPROVAL: "WAITING_FOR_APPROVAL",  // Paused, waiting for action approval
});

/** Server action types */
export const ActionType = Object.freeze({
  CLICK:          "CLICK",
  DOUBLE_CLICK:   "DOUBLE_CLICK",
  TYPE:           "TYPE",
  SCROLL:         "SCROLL",
  PRESS_KEY:      "PRESS_KEY",
  HOVER:          "HOVER",
  DRAG:           "DRAG",
  SELECT:         "SELECT",         // Dropdown selection
  WAIT:           "WAIT",
  NAVIGATE:       "NAVIGATE",
  BACK:           "BACK",           // Browser back
  TERMINATE:      "TERMINATE",
  FINISH:         "FINISH",
  ASK_USER:          "ASK_USER",          // Agent asks user for information
  REQUIRE_APPROVAL:  "REQUIRE_APPROVAL",  // Agent needs approval before executing
  VAULT_FILL:        "VAULT_FILL",        // Fill from vault token
});

/** Debugger detach reasons */
export const DetachReason = Object.freeze({
  TARGET_CLOSED:    "target_closed",
  CANCELED_BY_USER: "canceled_by_user",
});

/** Connection quality tiers */
export const ConnectionQuality = Object.freeze({
  EXCELLENT:  "EXCELLENT",   // <100ms round-trip
  GOOD:       "GOOD",        // 100-300ms
  FAIR:       "FAIR",        // 300-800ms
  POOR:       "POOR",        // >800ms
  OFFLINE:    "OFFLINE",
});

/** WebGPU availability status */
export const WebGPUStatus = Object.freeze({
  AVAILABLE:      "AVAILABLE",
  UNAVAILABLE:    "UNAVAILABLE",
  INITIALIZING:   "INITIALIZING",
  ERROR:          "ERROR",
});

// ═══════════════════════════════════════════════════════════════════════════════
// DEFAULT SETTINGS
// ═══════════════════════════════════════════════════════════════════════════════

export const DEFAULT_SETTINGS = Object.freeze({
  backendUrl:         "http://localhost:8000",
  maxSteps:           30,
  captureQuality:     75,
  captureMaxWidth:    1280,
  captureMaxHeight:   720,
  humanizeInputs:     true,
  stabilizeDelayMs:   250,
  serverTimeoutMs:    10000,
  enableDeltaFrames:  true,
  enableAuditStream:  true,
  interKeyDelayBase:  30,
  interKeyJitter:     40,
});

// ═══════════════════════════════════════════════════════════════════════════════
// SHARED CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════════

export const ALARM_KEEPALIVE     = "sw-keepalive";
export const HEARTBEAT_INTERVAL  = 20_000;  // 20s
export const PERCEPTION_TIMEOUT  = 5_000;   // 5s
export const MAX_LOG_ENTRIES     = 200;
export const MAX_HISTORY_ENTRIES = 20;

export const SENSITIVE_ACTION_PATTERNS = Object.freeze([
  /transfer|send money|pay|payment/i,
  /delete|remove|cancel/i,
  /submit|confirm|place order/i,
  /logout|sign out/i,
  /unsubscribe|deactivate/i,
]);
