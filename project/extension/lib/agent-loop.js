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
import { PrivacyEngine } from "../privacy_engine.js";

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

    // Session management for backend compatibility
    this.sessionId       = `sess_${Date.now().toString(36)}_${Math.random().toString(36).substr(2, 9)}`;
    this._lastExecutionResults = [];
    this._lastValidationFeedback = [];

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

    await this.captureEngine.startScreencast((frame) => this._onFrame(frame));

    // Instantly capture and process initial frame without waiting for idle screencast event
    setTimeout(async () => {
      if (this.state === AgentState.RUNNING && !this.isBusy && this.stepCount === 0) {
        try {
          const initialFrame = await this.captureEngine.captureFrame();
          if (initialFrame) this._onFrame(initialFrame);
        } catch (e) {
          console.warn("[AgentLoop] Initial frame capture fallback:", e);
        }
      }
    }, 100);
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
    let viewportWidth = null;

    // 1a. PII scanning - fail-closed
    try {
      piiBoxes = await this.actionExecutor.scanDOMForPii();
      const vp = await this.captureEngine.getViewportSize();
      if (vp) viewportWidth = vp.width;
    } catch (piiErr) {
      this._log(`[FAIL-CLOSED] PII scan failed: ${piiErr.message}. Frame dropped to prevent data leakage.`, "warning");
      await storage.incrementMetric("perceptionErrors");
      return; // DROP THE FRAME - never send raw data
    }

    // 1b. Offscreen perception (redaction) - fail-closed
    try {
      perception = await this._requestPerception(frame, piiBoxes, viewportWidth);
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
    const executionResults = [];

    if (decision && decision.thought) {
      this._log(`Thought: ${decision.thought}`, "info");
    }

    for (let i = 0; i < actions.length; i++) {
      const action = actions[i];

      // Zero-Knowledge Autofill
      if (action.text) {
        action.text = this.vault.detokenize(action.text);
      }
      if (action.optionText) {
        action.optionText = this.vault.detokenize(action.optionText);
      }

      if (action.type === ActionType.VAULT_FILL) { action.type = ActionType.TYPE; } // ASK_USER
      if (action.type === ActionType.ASK_USER) {
        // ASK_USER is only legitimate when it targets an actual unfilled field
        // (an id to type into). If the model asks with no target — e.g. "provide
        // me screenshot and element tree", which is context it already receives —
        // it is a degenerate/hallucinated action. Skip it rather than interrupting
        // the user with a dialog that can do nothing.
        if (!action.target && !action.x) {
          this._log(`[ASK_USER] Skipped degenerate ask (no field target): ${action.question || ""}`, "warning");
          continue;
        }
        this.state = AgentState.WAITING_FOR_USER;
        this._broadcastStatus();
        chrome.runtime.sendMessage({ type: "BG_HITL_PROMPT", payload: { question: action.question || "Need input", suggestedVaultKey: action.vaultKey, correlationId: this.stepCount }});
        const hitlMsg = await new Promise(r => this.hitlResolver = r);
        this.state = AgentState.RUNNING;
        this._broadcastStatus();
        // Never persist secrets (password/confirm/pin/cvv/otp) to the vault —
        // each site should use its own value, so fill one-shot and do not save.
        const isSecretField = /(password|passwd|pwd|confirm|cvv|otp|pin|secret)/i.test(hitlMsg.vaultKey || '') ||
                              /(password|passwd|pwd|confirm)/i.test(action.target || '');
        if (hitlMsg.saveToVault && hitlMsg.vaultKey && !isSecretField) {
          await this.vault.learnEntry(hitlMsg.vaultKey, hitlMsg.answer);
        }
        this.hitlContext.push({ question: action.question, answer: hitlMsg.answer });
        // if action has a target, also type it automatically.
        // NB: spread `...action` FIRST so explicit type/text below win.
        if (action.target || action.x) {
             const typeResult = await this.actionExecutor.execute({ ...action, type: "TYPE", text: hitlMsg.answer });
             executionResults.push(typeResult);
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
      executionResults.push(result);
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
      if (action.type === ActionType.SCROLL) {
        await new Promise((r) => setTimeout(r, 400));
      } else if (i < actions.length - 1) {
        await new Promise((r) => setTimeout(r, 120));
      }
    }

    // Update last execution results for next request
    this._lastExecutionResults = executionResults;

    // ─── Stage 3.5: Validate Execution Results ────────────────────
    this._lastValidationFeedback = await this._validateExecutionResults(executionResults);

    if (this._lastValidationFeedback.length > 0) {
      const failed = this._lastValidationFeedback.filter(f => !f.filled);
      if (failed.length > 0) {
        this._log(`[Validation] ${failed.length}/${this._lastValidationFeedback.length} fields failed verification, will retry`, "warning");
      } else {
        this._log(`[Validation] All ${this._lastValidationFeedback.length} fields verified successfully`, "info");
      }
    }

    const execTime = Date.now() - execStart;
    this._recordStage("execution", execTime);

    // ─── Post-Cycle ─────────────────────────────────────────────────
    await new Promise((r) => setTimeout(r, Math.max(350, this.stabilizeDelay)));

    const totalLatency = Date.now() - cycleStart;
    this._latencyHistory.push(totalLatency);
    if (this._latencyHistory.length > 25) this._latencyHistory.shift();

    // Report latency to capture engine for adaptive quality
    this.captureEngine.reportProcessingLatency(totalLatency);

    await storage.recordCycleLatency(totalLatency);
    await storage.incrementMetric("processedFrames");

    // ─── Autonomous Next Turn Continuation ───────────────────────────
    if (this.state === AgentState.RUNNING) {
      setTimeout(async () => {
        if (this.state !== AgentState.RUNNING || this.isBusy) return;
        try {
          const freshFrame = await this.captureEngine.captureFrame();
          if (freshFrame) this._onFrame(freshFrame);
        } catch (e) {
          console.warn("[AgentLoop] Auto next frame fallback:", e);
        }
      }, 350);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PRIVATE: OFFSCREEN PERCEPTION BRIDGE
  // ═══════════════════════════════════════════════════════════════════════════

  _requestPerception(frame, piiBoxes = [], viewportWidth = null) {
    return new Promise((resolve, reject) => {
      const id = `f_${this.stepCount}_${Date.now()}`;
      const timer = setTimeout(() => {
        this._pendingPerception.delete(id);
        reject(new Error("Perception timeout"));
      }, PERCEPTION_TIMEOUT);

      this._pendingPerception.set(id, { resolve, reject, timeout: timer });

      try {
        this.offscreenPort.postMessage({ 
          type: BG_PROCESS_FRAME, 
          correlationId: id, 
          rawBase64: frame.base64, 
          buffer: frame.buffer,
          piiBoxes: piiBoxes,
          dpr: this.actionExecutor.dpr,
          viewportWidth: viewportWidth
        });
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
          if (msg.error) {
            this._log(`[Perception Error] ${msg.error}`, "error");
          }
          p.resolve(msg.result);
        }
      }
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PRIVATE: VALIDATION FEEDBACK
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Read back actual field values via CDP after actions execute, then compare
   * expected vs actual to produce validation_feedback for the backend.
   *
   * @param {Array} executionResults - results from actionExecutor.execute()
   * @returns {Promise<Array>} validation_feedback items
   */
  async _validateExecutionResults(executionResults) {
    if (!executionResults || executionResults.length === 0) return [];

    const feedback = [];

    for (const result of executionResults) {
      if (!result.success) {
        feedback.push({
          element_id:  String(result.elementId || result.selector || result.target || result.action || "unknown"),
          action_id:   result.actionId  || null,
          filled:      false,
          actual_value: null,
          expected_value: result.expectedValue || null,
          error:       result.detail || "action_failed",
        });
        continue;
      }

      const actionType = (result.action || "").toUpperCase();
      if (actionType !== "TYPE" && actionType !== "SELECT") continue;

      const target = result.selector || result.target || result.id || null;
      if (!target) continue;

      try {
        // Read back the element's current value for verification.
        const escapedTarget = JSON.stringify(target);
        const evalResult = await this.actionExecutor._cdp("Runtime.evaluate", {
          expression: `(() => {
            const t = ${escapedTarget};
            const el = document.getElementById(t)
                    || document.querySelector('[name="' + t + '"]')
                    || document.querySelector('[data-testid="' + t + '"]')
                    || (t.startsWith('#') || t.startsWith('.') || t.includes('[') ? document.querySelector(t) : null);
            return el ? el.value : null;
          })()`,
          returnByValue: true,
        });

        // _cdp resolves with the Runtime.evaluate result; the returned value
        // lives at .result.value (RemoteObject). Tolerate a nested shape too.
        const readback =
          evalResult?.result?.value ??
          evalResult?.result?.result?.value ??
          null;
        const actualValue = readback ?? null;
        // Normalized compare helper: strip case/whitespace/punctuation so that
        // option value ("tamilnadu") vs option text ("Tamil Nadu") both validate.
        const norm = (s) => String(s ?? "").toLowerCase().replace(/[\s\-_.,]/g, "").trim();
        const expectedCandidates = [result.expectedValue, result.value, result.text, result.optionText]
          .filter((v) => v != null && String(v).trim() !== "");
        const confirmed = actualValue !== null &&
          (expectedCandidates.length === 0
            ? String(actualValue).trim() !== ""
            : expectedCandidates.some((c) => norm(c) === norm(actualValue)));

        feedback.push({
          element_id:  String(result.elementId || target),
          action_id:   result.actionId  || null,
          filled:      confirmed,
          actual_value: actualValue,
          expected_value: expectedCandidates[0] ?? result.expectedValue ?? null,
          error:       confirmed ? null : "value_mismatch",
        });
      } catch (err) {
        feedback.push({
          element_id:  String(result.elementId || target),
          action_id:   result.actionId  || null,
          filled:      false,
          actual_value: null,
          expected_value: result.expectedValue || result.text || null,
          error:       err.message || "validation_error",
        });
      }
    }

    return feedback;
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
    const [rawA11yTree, metadataAndElements] = await Promise.all([
      this.actionExecutor.getAccessibilityTree(),
      this.actionExecutor.getPageMetadataAndElements(),
    ]);

    // ── Privacy Gate: Strip PII from AX tree before it reaches the LLM server ──
    const a11yTree = Array.isArray(rawA11yTree)
      ? rawA11yTree.map(node => _a11ySanitizer.sanitizeTree(node))
      : _a11ySanitizer.sanitizeTree(rawA11yTree);

    // ── Filter to interactive/semantic elements only & sanitize ──
    const sanitizedElements = (metadataAndElements.elements || [])
      .filter(el => {
        const role = el.role || '';
        const tag = el.tag || '';
        return ['textbox', 'button', 'checkbox', 'radio', 'combobox', 'link'].includes(role) ||
               ['input', 'select', 'textarea', 'button', 'a'].includes(tag);
      })
      .map(el => {
        const sanitized = { ...el };
        if (typeof sanitized.text === 'string') sanitized.text = _a11ySanitizer._maskPIIString(sanitized.text);
        if (typeof sanitized.label === 'string') sanitized.label = _a11ySanitizer._maskPIIString(sanitized.label);
        if (typeof sanitized.placeholder === 'string') sanitized.placeholder = _a11ySanitizer._maskPIIString(sanitized.placeholder);
        if (typeof sanitized.value === 'string') sanitized.value = _a11ySanitizer._maskPIIString(sanitized.value);
        return sanitized;
      });

    const sanitizedPage = metadataAndElements.page ? { ...metadataAndElements.page } : {};
    if (typeof sanitizedPage.title === 'string') sanitizedPage.title = _a11ySanitizer._maskPIIString(sanitizedPage.title);
    if (typeof sanitizedPage.url === 'string') sanitizedPage.url = _a11ySanitizer._maskPIIString(sanitizedPage.url);

    const sanitizedExecutionResults = (this._lastExecutionResults || []).map(r => {
      const sanitized = { ...r };
      for (const field of ['detail', 'text', 'value', 'expectedValue']) {
        if (sanitized[field] !== undefined && sanitized[field] !== null) {
          sanitized[field] = _a11ySanitizer._maskPIIString(String(sanitized[field]));
        }
      }
      return sanitized;
    });

    // Sanitize validation feedback for privacy before sending to backend
    // NB: coerce numbers/null to strings BEFORE masking — _maskPIIString skips
    // non-strings, so a numeric actual/expected value (e.g. a 13-digit phone as
    // a number) would otherwise bypass redaction and leak into the payload.
    const sanitizedValidationFeedback = (this._lastValidationFeedback || []).map(f => {
      const sanitized = { ...f };
      for (const field of ['actual_value', 'expected_value']) {
        if (sanitized[field] !== undefined && sanitized[field] !== null) {
          sanitized[field] = _a11ySanitizer._maskPIIString(String(sanitized[field]));
        }
      }
      return sanitized;
    });

    const payload = {
      session_id: this.sessionId || `sess_${Date.now().toString(36)}`,
      task: this.goal,
      browser_state: {
        page: sanitizedPage,
        elements: sanitizedElements,
        checklist: metadataAndElements.checklist || {}
      },
      screenshot: {
        mime_type: "image/jpeg",
        data: perception.redactedImageBase64
      },
      available_keys: this.vault ? this.vault.getAvailableTokens() : [],
      execution_results: sanitizedExecutionResults,
      validation_feedback: sanitizedValidationFeedback
    };

    const privacyEngine = new PrivacyEngine({ enableStrictZeroLeakage: true });
    try {
      // Exclude large base64 image data from regex validation to prevent 
      // random alphanumeric sequence collisions (e.g. false-positive PAN cards in Base64)
      const payloadForValidation = { ...payload, screenshot: "<redacted_image_data_skipped>" };
      privacyEngine.validatePayload(payloadForValidation);
    } catch (error) {
      console.error("Payload blocked locally to prevent privacy leak:", error.message);
      this._log(`[Privacy Gate] ${error.message}`, "warning");
      // Deep-mask EVERY string/number leaf anywhere in the payload so the
      // re-validation can never re-throw on a field the fixed-field list missed.
      const deepMask = (node) => {
        if (node == null) return;
        if (typeof node === 'string' || typeof node === 'number') {
          return _a11ySanitizer._maskPIIString(String(node)) || "[REDACTED]";
        }
        if (Array.isArray(node)) {
          for (let i = 0; i < node.length; i++) node[i] = deepMask(node[i]);
          return;
        }
        if (typeof node === 'object') {
          for (const key of Object.keys(node)) node[key] = deepMask(node[key]);
        }
      };
      deepMask(payload);

      // Re-run the gate to ensure the payload is now clean before sending.
      privacyEngine.validatePayload({ ...payload, screenshot: "<redacted_image_data_skipped>" });
    }

    const resp = await fetch(`${this.backendUrl}/api/v1/infer`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(payload),
      signal:  AbortSignal.timeout(this.serverTimeout),
    });

    if (!resp.ok) {
      const errDetail = await resp.text().catch(() => "");
      console.error(`[AgentLoop] Backend error ${resp.status}:`, errDetail);
      throw new Error(`Server ${resp.status}: ${resp.statusText}${errDetail ? ` (${errDetail.slice(0, 100)})` : ""}`);
    }
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





