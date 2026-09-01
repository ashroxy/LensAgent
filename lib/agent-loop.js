/**
 * agent-loop.js - Perception → Decision → Action Orchestrator
 * =============================================================
 * The central nervous system of LensAgent. Coordinates all subsystems.
 *
 * Enhanced Features:
 *   - Epoch-gated execution (stale actions from pre-navigation frames are dropped)
 *   - Exponential backoff on server errors (with jitter)
 *   - Per-stage performance profiling (perception, network, execution)
 *   - Latency telemetry with running averages
 *   - Multi-action sequential execution per step
 *   - Graceful degradation on offscreen document crash
 *   - Session history recording on completion
 *   - Action verification feedback for next cycle
 *   - Configurable via settings object
 */

import {
  BG_PROCESS_FRAME, OS_PERCEPTION_DONE,
  AUDIT_FRAME_UPDATE, AUDIT_ACTION_LOG,
  BG_AGENT_STATUS, AgentState, ActionType,
  PERCEPTION_TIMEOUT, SENSITIVE_ACTION_PATTERNS
} from "./message-types.js";
import * as storage from "./storage.js";
import { AccessibilitySanitizer } from "../offscreen/accessibility_sanitizer.js";

// Shared sanitizer instance for zero-leakage AX tree scrubbing before LLM payload
const _a11ySanitizer = new AccessibilitySanitizer();

export class AgentLoop {
  /**
   * @param {Object} config
   * @param {import('./capture.js').CaptureEngine} config.captureEngine
   * @param {import('./action-executor.js').ActionExecutor} config.actionExecutor
   * @param {chrome.runtime.Port} config.offscreenPort
   * @param {string} config.backendUrl
   * @param {number} [config.maxSteps=30]
   * @param {number} [config.stabilizeDelayMs=250]
   * @param {number} [config.serverTimeoutMs=10000]
   * @param {boolean} [config.enableAuditStream=true]
   */
  constructor(config) {
    this.captureEngine   = config.captureEngine;
    this.actionExecutor  = config.actionExecutor;
    this.offscreenPort   = config.offscreenPort;
    this.vault           = config.vaultManager;
    this.backendUrl      = config.backendUrl;
    this.maxSteps        = config.maxSteps ?? 30;
    this.stabilizeDelay  = config.stabilizeDelayMs ?? 250;
    this.serverTimeout   = config.serverTimeoutMs ?? 10000;
    this.enableAudit     = config.enableAuditStream ?? true;

    // State
    this.state          = AgentState.IDLE;
    this.goal           = "";
    this.stepCount      = 0;
    this.isBusy         = false;
    this.currentEpoch   = 0;
    this._sessionStart  = 0;
    this.hitlResolver   = null;
    this.approvalResolver = null;
    this.hitlContext    = [];

    // Exponential backoff state
    this._consecutiveServerErrors = 0;
    this._maxBackoffMs = 8000;

    // Performance profiler (per-stage timings)
    this._latencyHistory = [];
    this._stageTimings   = {
      perception: [],
      network:    [],
      execution:  [],
    };

    // Perception bridge
    this._pendingPerception = new Map();

    // Last action result (fed back to server for context)
    this._lastActionResult = null;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PUBLIC API
  // ═══════════════════════════════════════════════════════════════════════════

  async start(goal) {
    this.goal           = goal;
    this.stepCount      = 0;
    this.isBusy         = false;
    this.state          = AgentState.RUNNING;
    this.currentEpoch   = this.captureEngine.epoch;
    this._sessionStart  = Date.now();
    this._consecutiveServerErrors = 0;
    this._lastActionResult = null;

    this._setupPerceptionListener();

    await storage.saveSession({
      state: this.state, goal: this.goal, stepCount: 0,
      tabId: this.captureEngine.tabId, dpr: this.actionExecutor.dpr,
    });
    await storage.resetMetrics();
    await storage.appendLog(`Agent started - Goal: "${goal}"`, "action");

    this._broadcastStatus();

    await this.captureEngine.startScreencast((frame) => this._onFrame(frame));
  }

  async stop(reason = "USER_STOPPED") {
    if (this.state === AgentState.IDLE) return;
    this.state = AgentState.STOPPING;
    this._broadcastStatus();

    await this.captureEngine.stopScreencast();

    // Record session to history
    const duration = Date.now() - this._sessionStart;
    const resultState = reason === "GOAL_ACHIEVED" ? "FINISHED"
                      : reason === "USER_STOPPED"  ? "STOPPED"
                      : "ERROR";

    await storage.addHistoryEntry({
      goal:       this.goal,
      steps:      this.stepCount,
      result:     resultState,
      durationMs: duration,
      url:        "",
    });

    await storage.appendLog(
      `Session ended: ${reason} (${this.stepCount} steps, ${Math.round(duration / 1000)}s)`,
      resultState === "FINISHED" ? "success" : "warning"
    );

    this.state  = AgentState.IDLE;
    this.isBusy = false;
    this._pendingPerception.clear();

    await storage.sessionSet({ agentState: AgentState.IDLE });
    this._broadcastStatus();
  }

  pause() {
    this.state  = AgentState.PAUSED;
    this.isBusy = false;
    this._broadcastStatus();
    this._log("Agent paused - debugger detached. Close DevTools and restart.", "warning");
  }

  getStatus() {
    const avgStage = {};
    for (const [stage, times] of Object.entries(this._stageTimings)) {
      avgStage[stage] = times.length > 0
        ? Math.round(times.reduce((a, b) => a + b, 0) / times.length)
        : 0;
    }

    return {
      state:       this.state,
      goal:        this.goal,
      stepCount:   this.stepCount,
      maxSteps:    this.maxSteps,
      avgLatency:  this._getAvgLatency(),
      stageAvg:    avgStage,
      metrics:     this.captureEngine.getMetrics(),
      connection:  this.captureEngine.getConnectionQuality(),
      serverErrors: this._consecutiveServerErrors,
    };
  }

  handleHitlResponse(msg) {
    if (this.hitlResolver) {
      this.hitlResolver(msg);
      this.hitlResolver = null;
    }
  }

  handleApprovalResponse(msg) {
    if (this.approvalResolver) {
      this.approvalResolver(msg);
      this.approvalResolver = null;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PRIVATE: FRAME PROCESSING PIPELINE
  // ═══════════════════════════════════════════════════════════════════════════

  _onFrame(frame) {
    if (this.isBusy || this.state !== AgentState.RUNNING) return;
    if (this.stepCount >= this.maxSteps) {
      this._log(`Max steps (${this.maxSteps}) reached. Auto-stopping.`, "warning");
      this.stop("MAX_STEPS_REACHED");
      return;
    }

    this.isBusy = true;
    const cycleStart = Date.now();

    this._processCycle(frame, cycleStart).catch((err) => {
      console.error("[AgentLoop] Cycle error:", err);
      this._log(`Cycle error: ${err.message}`, "error");
    }).finally(() => {
      this.isBusy = false;
    });
  }

  async _processCycle(frame, cycleStart) {
    const epoch = this.captureEngine.epoch;
    this.stepCount++;
    await storage.sessionSet({ stepCount: this.stepCount });

    // ─── Stage 1: Perception (FAIL-CLOSED) ─────────────────────────────
    // SECURITY INVARIANT: If ANY step in the redaction pipeline fails,
    // the raw frame is DROPPED - never forwarded to the network.
    // This guarantees zero data egress even under crash conditions.
    const percStart = Date.now();
    let perception;
    let piiBoxes = [];

    // 1a. PII scanning - fail-closed
    try {
      piiBoxes = await this.actionExecutor.scanDOMForPii();
    } catch (piiErr) {
      this._log(`[FAIL-CLOSED] PII scan failed: ${piiErr.message}. Frame dropped to prevent data leakage.`, "warning");
      await storage.incrementMetric("perceptionErrors");
      return; // DROP THE FRAME - never send raw data
    }

    // 1b. Offscreen perception (redaction) - fail-closed
    try {
      perception = await this._requestPerception(frame, piiBoxes);
    } catch (err) {
      this._log(`[FAIL-CLOSED] Perception/redaction failed: ${err.message}. Frame dropped.`, "warning");
      await storage.incrementMetric("perceptionErrors");
      return; // DROP THE FRAME
    }

    // 1c. Validate redacted output exists - fail-closed
    if (!perception || !perception.redactedImageBase64 || perception.redactedImageBase64.length < 100) {
      this._log("[FAIL-CLOSED] Redaction produced empty or corrupt output. Frame dropped.", "warning");
      await storage.incrementMetric("perceptionErrors");
      return; // DROP THE FRAME
    }

    const percTime = Date.now() - percStart;
    this._recordStage("perception", percTime);

    // Epoch guard
    if (this.captureEngine.epoch !== epoch) {
      this._log("Page navigated during perception - skipping stale result", "info");
      return;
    }

    // ─── Emit Audit Update ──────────────────────────────────────────
    if (this.enableAudit) {
      this._broadcastAuditFrame({
        rawFrame:      frame.base64,
        redactedFrame: perception.redactedImageBase64,
        boundingBoxes: perception.elements,
        redactedCount: perception.redactedRegions?.length ?? 0,
      });
    }

    // ─── Stage 2: Server Decision ───────────────────────────────────
    // NOTE: Only the REDACTED image reaches this point. The raw frame
    // was consumed above and is never included in the server payload.
    const netStart = Date.now();
    let decision;
    try {
      decision = await this._requestServerAction(perception, frame);
      this._consecutiveServerErrors = 0;
    } catch (err) {
      this._consecutiveServerErrors++;
      await storage.incrementMetric("serverErrors");

      // Exponential backoff with jitter
      const backoff = Math.min(
        this._maxBackoffMs,
        Math.pow(2, this._consecutiveServerErrors) * 200 + Math.random() * 500
      );
      this._log(`Server error (attempt ${this._consecutiveServerErrors}): ${err.message}. Retrying in ${Math.round(backoff)}ms`, "warning");
      await new Promise((r) => setTimeout(r, backoff));

      if (this._consecutiveServerErrors >= 5) {
        this._log("Server unreachable after 5 attempts. Pausing agent.", "error");
        this.state = AgentState.ERROR;
        this._broadcastStatus();
      }
      return;
    }
    const netTime = Date.now() - netStart;
    this._recordStage("network", netTime);

    // Epoch guard (post-network)
    if (this.captureEngine.epoch !== epoch) {
      this._log("Page navigated during server call - dropping stale action", "info");
      return;
    }

    // ─── Stage 3: Execute Actions ───────────────────────────────────
    const execStart = Date.now();
    const actions = (decision && (decision.actions || (decision.action_plan ? [decision.action_plan] : []))) || [];

    if (decision && decision.thought) {
      this._log(`Thought: ${decision.thought}`, "info");
    }

    for (let i = 0; i < actions.length; i++) {
      const action = actions[i];

      // Zero-Knowledge Autofill
      if (action.text) {
        action.text = this.vault.detokenize(action.text);
      }

      if (action.type === ActionType.VAULT_FILL) { action.type = ActionType.TYPE; } // ASK_USER
      if (action.type === ActionType.ASK_USER) {
        this.state = AgentState.WAITING_FOR_USER;
        this._broadcastStatus();
        chrome.runtime.sendMessage({ type: "BG_HITL_PROMPT", payload: { question: action.question || "Need input", suggestedVaultKey: action.vaultKey, correlationId: this.stepCount }});
        const hitlMsg = await new Promise(r => this.hitlResolver = r);
        this.state = AgentState.RUNNING;
        this._broadcastStatus();
        if (hitlMsg.saveToVault && hitlMsg.vaultKey) await this.vault.learnEntry(hitlMsg.vaultKey, hitlMsg.answer);
        this.hitlContext.push({ question: action.question, answer: hitlMsg.answer });
        // if action has a target, also type it automatically
        if (action.target || action.x) {
             await this.actionExecutor.execute({ type: "TYPE", text: hitlMsg.answer, ...action });
        }
        continue;
      }

      // REQUIRE_APPROVAL
      const isSensitive = action.type === ActionType.REQUIRE_APPROVAL || SENSITIVE_ACTION_PATTERNS.some(p => p.test(action.type));
      if (isSensitive) {
        this.state = AgentState.WAITING_FOR_APPROVAL;
        this._broadcastStatus();
        chrome.runtime.sendMessage({ type: "BG_APPROVAL_PROMPT", payload: { context: action.context || action.type, detail: JSON.stringify(action), correlationId: this.stepCount }});
        const approvalMsg = await new Promise(r => this.approvalResolver = r);
        this.state = AgentState.RUNNING;
        this._broadcastStatus();
        if (!approvalMsg.approved) {
             this._log("Action denied by user.", "error");
             return; // abort this cycle's execution
          }
        }
        if (action.type === ActionType.REQUIRE_APPROVAL && !action.target && !action.url) { continue; }

      const result = await this.actionExecutor.execute(action);
      this._lastActionResult = result;

      await storage.incrementMetric(result.success ? "actionsExecuted" : "actionsFailed");

      const icon = result.success ? "[OK]" : "[FAIL]";
      this._log(`${icon} Step ${this.stepCount}${actions.length > 1 ? `.${i + 1}` : ""}: ${result.action} - ${result.detail}${result.retries > 0 ? ` (${result.retries} retries)` : ""}`, result.success ? "action" : "error");

      // Termination check
      if (action.type === ActionType.TERMINATE || action.type === ActionType.FINISH) {
        this._log(`Task completed: "${this.goal}"`, "success");
        this.state = AgentState.FINISHED;
        this._broadcastStatus();
        await this.stop("GOAL_ACHIEVED");
        return;
      }

      // Brief inter-action stabilization
      if (i < actions.length - 1) await new Promise((r) => setTimeout(r, 100));
    }

    const execTime = Date.now() - execStart;
    this._recordStage("execution", execTime);

    // ─── Post-Cycle ─────────────────────────────────────────────────
    await new Promise((r) => setTimeout(r, this.stabilizeDelay));

    const totalLatency = Date.now() - cycleStart;
    this._latencyHistory.push(totalLatency);
    if (this._latencyHistory.length > 25) this._latencyHistory.shift();

    // Report latency to capture engine for adaptive quality
    this.captureEngine.reportProcessingLatency(totalLatency);

    await storage.recordCycleLatency(totalLatency);
    await storage.incrementMetric("processedFrames");
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PRIVATE: OFFSCREEN PERCEPTION BRIDGE
  // ═══════════════════════════════════════════════════════════════════════════

  _requestPerception(frame, piiBoxes = []) {
    return new Promise((resolve, reject) => {
      const id = `f_${this.stepCount}_${Date.now()}`;
      const timer = setTimeout(() => {
        this._pendingPerception.delete(id);
        reject(new Error("Perception timeout"));
      }, PERCEPTION_TIMEOUT);

      this._pendingPerception.set(id, { resolve, reject, timeout: timer });

      try {
        this.offscreenPort.postMessage(
          { 
            type: BG_PROCESS_FRAME, 
            correlationId: id, 
            rawBase64: frame.base64, 
            buffer: frame.buffer,
            piiBoxes: piiBoxes,
            dpr: this.actionExecutor.dpr
          },
          [frame.buffer]
        );
      } catch (err) {
        this._pendingPerception.delete(id);
        clearTimeout(timer);
        reject(err);
      }
    });
  }

  _setupPerceptionListener() {
    this.offscreenPort.onMessage.addListener((msg) => {
      if (msg.type === OS_PERCEPTION_DONE && msg.correlationId) {
        const p = this._pendingPerception.get(msg.correlationId);
        if (p) {
          clearTimeout(p.timeout);
          this._pendingPerception.delete(msg.correlationId);
          p.resolve(msg.result);
        }
      }
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PRIVATE: SERVER COMMUNICATION
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Member 4 Integration: Vision-Language Model Server (FastAPI)
   * Sends the full Tri-Stream Browser State to the backend:
   *   Stream 1: Redacted Screenshot (from Member 2 & 3)
   *   Stream 2: DOM Text Snapshot (from CDP Runtime.evaluate)
   *   Stream 3: Accessibility Tree (from CDP Accessibility.getFullAXTree)
   * 
   * @param {import('./message-types.js').PerceptionResult} perception - Sanitized frame + elements
   * @param {Object} frame - Raw frame metadata
   * @returns {Promise<import('./message-types.js').ServerDecision>} Ordered sequence of actions
   */
  async _requestServerAction(perception, frame) {
    // Extract structural streams in parallel (non-blocking)
    const [rawA11yTree, domSnapshot, sanitizedState] = await Promise.all([
      this.actionExecutor.getAccessibilityTree(),
      this.actionExecutor.getDOMSnapshot(),
      this.actionExecutor.extractSanitizedBrowserState(),
    ]);

    // ── Privacy Gate: Strip PII from AX tree before it reaches the LLM server ──
    const a11yTree = Array.isArray(rawA11yTree)
      ? rawA11yTree.map(node => _a11ySanitizer.sanitizeTree(node))
      : _a11ySanitizer.sanitizeTree(rawA11yTree);

    const payload = {
      goal:           this.goal,
      step:           this.stepCount,
      viewport:       { width: 1280, height: 720, dpr: this.actionExecutor.dpr },

      // ── Canonical ISRO PS 171 Schema ──
      sanitized_dom:               sanitizedState?.sanitized_dom || { page: { title: "Web Page", url: "about:blank" }, elements: [] },
      sanitized_accessibility_tree: sanitizedState?.sanitized_accessibility_tree || { root: { role: "document", name: "Web Page" }, nodes: a11yTree },
      browser_state:               sanitizedState?.browser_state || { schema_version: "1.0", page: {}, elements: [], redactions: [] },

      // Stream 1: Visual (from Member 2 & 3)
      ui_elements:    perception.elements,
      redacted_image: perception.redactedImageBase64,

      // Stream 2: DOM Text Snapshot
      dom_snapshot:   domSnapshot,

      // Stream 3: Accessibility Tree
      a11y_tree:      a11yTree,

      // Metadata
      system_state:   {
        url_domain: "redacted",
        timestamp:  Date.now(),
        fps:        this.captureEngine.getMetrics().currentFps,
        quality:    frame.quality,
      },
      last_action_result: this._lastActionResult,
      hitl_context: this.hitlContext,
      available_vault_tokens: this.vault ? this.vault.getAvailableTokens() : [],
    };

    const resp = await fetch(`${this.backendUrl}/api/v1/agent/act`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(payload),
      signal:  AbortSignal.timeout(this.serverTimeout),
    });

    if (!resp.ok) throw new Error(`Server ${resp.status}: ${resp.statusText}`);
    return resp.json();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PRIVATE: BROADCAST & LOGGING
  // ═══════════════════════════════════════════════════════════════════════════

  _broadcastStatus() {
    chrome.runtime.sendMessage({ type: BG_AGENT_STATUS, payload: this.getStatus() }).catch(() => {});
  }

  _broadcastAuditFrame(data) {
    chrome.runtime.sendMessage({ type: AUDIT_FRAME_UPDATE, payload: data }).catch(() => {});
  }

  _log(message, type = "info") {
    chrome.runtime.sendMessage({
      type: AUDIT_ACTION_LOG, payload: { message, timestamp: Date.now() },
    }).catch(() => {});
    storage.appendLog(message, type);
  }

  _recordStage(stage, ms) {
    this._stageTimings[stage].push(ms);
    if (this._stageTimings[stage].length > 20) this._stageTimings[stage].shift();
  }

  _getAvgLatency() {
    if (!this._latencyHistory.length) return 0;
    return Math.round(this._latencyHistory.reduce((a, b) => a + b, 0) / this._latencyHistory.length);
  }
}




