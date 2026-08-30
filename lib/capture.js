/**
 * capture.js - Adaptive CDP Screencast Engine
 * ==============================================
 * High-performance frame capture via Page.startScreencast with:
 *
 *   1. Adaptive quality scaling (auto-downgrades JPEG quality under load)
 *   2. ACK-gated backpressure (natural flow control via CDP protocol)
 *   3. Delta-frame detection (DJB2 hash - skip unchanged frames)
 *   4. Base64 → ArrayBuffer conversion for zero-copy Transferable transfer
 *   5. FPS monitoring with rolling window calculation
 *   6. Navigation epoch tracking (invalidate stale frames on page transition)
 *   7. Self-healing detach recovery
 *   8. Connection quality assessment
 *
 * Performance Targets:
 *   - Capture latency: <25ms per frame
 *   - Delta-hash computation: <0.2ms
 *   - Base64→ArrayBuffer conversion: <5ms for 720p JPEG
 *   - Zero-copy transfer overhead: ~0.1ms
 */

import { DetachReason, ConnectionQuality } from "./message-types.js";

export class CaptureEngine {
  /**
   * @param {number} tabId
   * @param {Object} [opts]
   * @param {number} [opts.quality=75]
   * @param {number} [opts.maxWidth=1280]
   * @param {number} [opts.maxHeight=720]
   * @param {number} [opts.everyNthFrame=1]
   * @param {boolean} [opts.enableDeltaFrames=true]
   * @param {boolean} [opts.adaptiveQuality=true]
   */
  constructor(tabId, opts = {}) {
    this.tabId  = tabId;
    this.target = { tabId };

    // Screencast configuration (mutable - adaptive quality can change these)
    this.quality         = opts.quality       ?? 75;
    this.maxWidth        = opts.maxWidth      ?? 1280;
    this.maxHeight       = opts.maxHeight     ?? 720;
    this.everyNthFrame   = opts.everyNthFrame ?? 1;
    this.enableDelta     = opts.enableDeltaFrames ?? true;
    this.adaptiveQuality = opts.adaptiveQuality ?? true;

    // State
    this.isAttached  = false;
    this.isCapturing = false;
    this.epoch       = 0;

    // Delta-frame detection
    this._prevFrameHash   = null;
    this._consecutiveSkips = 0;
    this._maxConsecutiveSkips = 30; // Force a frame through after 30 skips (~1s at 30fps)

    // FPS monitoring (rolling window)
    this._frameTimestamps = [];
    this._fpsWindowMs     = 3000;   // Calculate FPS over last 3 seconds

    // Metrics
    this._metrics = {
      totalFrames:     0,
      deliveredFrames: 0,
      skippedFrames:   0,
      captureStartTime: 0,
      lastFrameTime:   0,
      currentFps:      0,
      currentQuality:  this.quality,
      bytesProcessed:  0,
    };

    // Adaptive quality state
    this._adaptiveHistory = []; // Recent processing latencies from the agent loop
    this._qualityFloor    = 40;
    this._qualityCeiling  = 90;

    // Callbacks
    this._onFrame    = null;
    this._onDetach   = null;
    this._onNavigate = null;
    this._onFpsUpdate = null;

    // Bound handlers
    this._boundEvent  = this._handleDebuggerEvent.bind(this);
    this._boundDetach = this._handleDetach.bind(this);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PUBLIC API
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Attach chrome.debugger to the target tab.
   * @throws {Error} If URL is restricted or attachment fails.
   */
  async attach() {
    const tab = await chrome.tabs.get(this.tabId);
    const url = tab.url || "";

    const BLOCKED = ["chrome://", "chrome-extension://", "https://chromewebstore.google.com", "about:", "edge://"];
    if (BLOCKED.some((prefix) => url.startsWith(prefix))) {
      throw new Error(`Cannot attach debugger to restricted URL: ${url}`);
    }

    return new Promise((resolve, reject) => {
      chrome.debugger.attach(this.target, "1.3", () => {
        if (chrome.runtime.lastError) {
          return reject(new Error(chrome.runtime.lastError.message));
        }
        this.isAttached = true;
        chrome.debugger.onEvent.addListener(this._boundEvent);
        chrome.debugger.onDetach.addListener(this._boundDetach);
        resolve();
      });
    });
  }

  /**
   * Start screencast streaming.
   * @param {Function} onFrame - Receives frame payloads
   */
  async startScreencast(onFrame) {
    if (!this.isAttached) throw new Error("Debugger not attached.");
    this._onFrame     = onFrame;
    this.isCapturing  = true;
    this.epoch++;
    this._metrics.captureStartTime = Date.now();

    await this._cdp("Page.enable");
    await this._cdp("DOM.enable");

    await this._cdp("Page.startScreencast", {
      format:        "jpeg",
      quality:       this.quality,
      maxWidth:      this.maxWidth,
      maxHeight:     this.maxHeight,
      everyNthFrame: this.everyNthFrame,
    });

    // Start FPS monitoring
    this._fpsInterval = setInterval(() => this._updateFps(), 1000);
  }

  /**
   * Stop screencast and detach.
   */
  async stopScreencast() {
    if (!this.isCapturing && !this.isAttached) return;
    this.isCapturing = false;

    if (this._fpsInterval) {
      clearInterval(this._fpsInterval);
      this._fpsInterval = null;
    }

    try {
      if (this.isAttached) await this._cdp("Page.stopScreencast");
    } catch (_) {}

    await this.detach();
  }

  /**
   * Detach debugger cleanly.
   */
  async detach() {
    if (!this.isAttached) return;
    try {
      chrome.debugger.onEvent.removeListener(this._boundEvent);
      chrome.debugger.onDetach.removeListener(this._boundDetach);
      await new Promise((res) => {
        chrome.debugger.detach(this.target, () => {
          if (chrome.runtime.lastError) { /* ignore */ }
          res();
        });
      });
    } catch (_) {}
    this.isAttached = false;
  }

  /**
   * Fetch the device pixel ratio from the attached tab.
   * @returns {Promise<number>}
   */
  async getDevicePixelRatio() {
    const r = await this._cdp("Runtime.evaluate", {
      expression:    "window.devicePixelRatio",
      returnByValue: true,
    });
    return r?.result?.value ?? 1;
  }

  /**
   * Fetch current viewport dimensions.
   * @returns {Promise<{width: number, height: number}>}
   */
  async getViewportSize() {
    const r = await this._cdp("Runtime.evaluate", {
      expression:    "JSON.stringify({width:window.innerWidth,height:window.innerHeight})",
      returnByValue: true,
    });
    try { return JSON.parse(r?.result?.value); }
    catch { return { width: this.maxWidth, height: this.maxHeight }; }
  }

  /**
   * Fetch the current page URL from the attached tab.
   * @returns {Promise<string>}
   */
  async getCurrentUrl() {
    const r = await this._cdp("Runtime.evaluate", {
      expression:    "location.href",
      returnByValue: true,
    });
    return r?.result?.value ?? "";
  }

  /**
   * Report agent loop processing latency so the capture engine can
   * adapt JPEG quality for optimal throughput.
   * @param {number} latencyMs - Total cycle latency
   */
  reportProcessingLatency(latencyMs) {
    if (!this.adaptiveQuality) return;
    this._adaptiveHistory.push(latencyMs);
    if (this._adaptiveHistory.length > 10) this._adaptiveHistory.shift();
    this._adaptQuality();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CALLBACK SETTERS
  // ═══════════════════════════════════════════════════════════════════════════

  onDetach(fn)    { this._onDetach = fn; }
  onNavigate(fn)  { this._onNavigate = fn; }
  onFpsUpdate(fn) { this._onFpsUpdate = fn; }

  // ═══════════════════════════════════════════════════════════════════════════
  // METRICS
  // ═══════════════════════════════════════════════════════════════════════════

  getMetrics() {
    return { ...this._metrics, captureEpoch: this.epoch };
  }

  getConnectionQuality() {
    const fps = this._metrics.currentFps;
    if (fps >= 20) return ConnectionQuality.EXCELLENT;
    if (fps >= 12) return ConnectionQuality.GOOD;
    if (fps >= 5)  return ConnectionQuality.FAIR;
    if (fps > 0)   return ConnectionQuality.POOR;
    return ConnectionQuality.OFFLINE;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PRIVATE: EVENT HANDLERS
  // ═══════════════════════════════════════════════════════════════════════════

  _handleDebuggerEvent(source, method, params) {
    if (source.tabId !== this.tabId) return;

    switch (method) {
      case "Page.screencastFrame":
        this._onScreencastFrame(params);
        break;
      case "Page.frameNavigated":
        this._onFrameNavigated(params);
        break;
    }
  }

  _onScreencastFrame(params) {
    const { data, sessionId, metadata } = params;

    // 1. ACK immediately (backpressure control)
    this._cdp("Page.screencastFrameAck", { sessionId }).catch(() => {});

    if (!this.isCapturing || !this._onFrame) return;

    this._metrics.totalFrames++;
    this._metrics.lastFrameTime = Date.now();
    this._metrics.bytesProcessed += data.length;

    // Track for FPS calculation
    this._frameTimestamps.push(Date.now());

    // 2. Delta-frame detection
    if (this.enableDelta) {
      const hash = this._fastHash(data);
      if (hash === this._prevFrameHash) {
        this._consecutiveSkips++;
        // Force a frame through periodically to prevent stale state
        if (this._consecutiveSkips < this._maxConsecutiveSkips) {
          this._metrics.skippedFrames++;
          return;
        }
      }
      this._prevFrameHash    = hash;
      this._consecutiveSkips = 0;
    }

    this._metrics.deliveredFrames++;

    // 3. Convert to ArrayBuffer for zero-copy transfer
    const buffer = this._base64ToArrayBuffer(data);

    // 4. Deliver frame payload
    this._onFrame({
      buffer,
      base64:    data,
      metadata,
      timestamp: Date.now(),
      epoch:     this.epoch,
      frameId:   this._metrics.totalFrames,
      quality:   this._metrics.currentQuality,
    });
  }

  _onFrameNavigated(params) {
    if (!params.frame || params.frame.parentId) return;
    this.epoch++;
    this._prevFrameHash    = null;
    this._consecutiveSkips = 0;
    if (this._onNavigate) this._onNavigate(params.frame.url);
  }

  _handleDetach(source, reason) {
    if (source.tabId !== this.tabId) return;
    this.isAttached  = false;
    this.isCapturing = false;
    if (this._fpsInterval) {
      clearInterval(this._fpsInterval);
      this._fpsInterval = null;
    }
    if (this._onDetach) this._onDetach(reason);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PRIVATE: ADAPTIVE QUALITY
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Dynamically adjust JPEG quality based on recent processing latencies.
   * If the agent loop is taking >600ms per cycle, reduce quality to lower
   * payload size and free up bandwidth. If latency is <300ms, increase quality.
   */
  _adaptQuality() {
    if (this._adaptiveHistory.length < 3) return;

    const recentAvg = this._adaptiveHistory.slice(-5)
      .reduce((a, b) => a + b, 0) / Math.min(this._adaptiveHistory.length, 5);

    let newQuality = this.quality;
    if (recentAvg > 600 && this.quality > this._qualityFloor) {
      newQuality = Math.max(this._qualityFloor, this.quality - 5);
    } else if (recentAvg < 300 && this.quality < this._qualityCeiling) {
      newQuality = Math.min(this._qualityCeiling, this.quality + 3);
    }

    if (newQuality !== this.quality) {
      this.quality = newQuality;
      this._metrics.currentQuality = newQuality;
      // Restart screencast with new quality (non-blocking)
      if (this.isCapturing) {
        this._cdp("Page.stopScreencast").then(() => {
          return this._cdp("Page.startScreencast", {
            format: "jpeg", quality: this.quality,
            maxWidth: this.maxWidth, maxHeight: this.maxHeight,
            everyNthFrame: this.everyNthFrame,
          });
        }).catch(() => {});
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PRIVATE: FPS MONITORING
  // ═══════════════════════════════════════════════════════════════════════════

  _updateFps() {
    const now    = Date.now();
    const cutoff = now - this._fpsWindowMs;
    this._frameTimestamps = this._frameTimestamps.filter((t) => t > cutoff);
    const fps = Math.round((this._frameTimestamps.length / this._fpsWindowMs) * 1000);
    this._metrics.currentFps = fps;
    if (this._onFpsUpdate) this._onFpsUpdate(fps);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PRIVATE: UTILITIES
  // ═══════════════════════════════════════════════════════════════════════════

  _cdp(method, params = {}) {
    return new Promise((resolve, reject) => {
      chrome.debugger.sendCommand(this.target, method, params, (result) => {
        if (chrome.runtime.lastError) {
          return reject(new Error(`CDP ${method}: ${chrome.runtime.lastError.message}`));
        }
        resolve(result);
      });
    });
  }

  /**
   * Fast DJB2 hash over a sampled subset of the string.
   * Samples every ~500th character - ~0.1ms on 100KB string.
   */
  _fastHash(str) {
    let hash = 5381;
    const step = Math.max(1, Math.floor(str.length / 500));
    for (let i = 0; i < str.length; i += step) {
      hash = ((hash << 5) + hash + str.charCodeAt(i)) | 0;
    }
    return hash;
  }

  /**
   * Base64 → ArrayBuffer conversion for Transferable zero-copy messaging.
   */
  _base64ToArrayBuffer(base64) {
    const bin = atob(base64);
    const len = bin.length;
    const buf = new Uint8Array(len);
    for (let i = 0; i < len; i++) buf[i] = bin.charCodeAt(i);
    return buf.buffer;
  }
}
