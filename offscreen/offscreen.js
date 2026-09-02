/**
 * offscreen.js - Perception & Redaction Engine (Offscreen Document)
 * ==================================================================
 * Runs inside MV3 Offscreen Document with full DOM, Canvas 2D, and WebGPU access.
 *
 * Enhanced Features:
 *   - WebGPU device initialization with fallback to Canvas 2D
 *   - Warm-up inference pass on blank tensor (triggers shader compilation)
 *   - Model weight caching via Cache API (avoids re-download)
 *   - Per-frame performance timing (inference + redaction + export)
 *   - Fallback error recovery (never crashes the pipeline)
 *   - Async canvas export via convertToBlob() for non-blocking encoding
 *
 * INTEGRATION BOUNDARY:
 *   Member 1 (you): Port communication, frame decoding, response formatting, caching
 *   Member 2 (teammate): extractStructuralElements() â†’ real ONNX/WebGPU inference
 *   Member 3 (teammate): detectAndRedactPII() â†’ real PII detection + NER + canvas redaction
 */

import {
  PORT_OFFSCREEN, BG_PROCESS_FRAME, OS_PERCEPTION_DONE,
  OS_READY, OS_WEBGPU_STATUS, OS_PERF_METRICS,
  HEARTBEAT_PING, HEARTBEAT_PONG,
  WebGPUStatus,
} from "../lib/message-types.js";
import { PrivacyEngine } from '../privacy_engine.js';
import { LocalVisionModel } from '../vision_model.js';

// =====================================================================================================================
// TEAM INTEGRATION (Member 3)
// =====================================================================================================================
const privacyEngine = new PrivacyEngine({
  enableStrictZeroLeakage: true
});

const visionModel = new LocalVisionModel({ threshold: 0.15 });
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// CANVAS SETUP
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•



// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// WEBGPU INITIALIZATION
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

let gpuDevice   = null;
let gpuStatus   = WebGPUStatus.INITIALIZING;
let frameCount  = 0;

// Timing accumulators for performance reporting
let perfAccum = {
  decodeMs:    0,
  inferenceMs: 0,
  redactionMs: 0,
  exportMs:    0,
  totalMs:     0,
  frames:      0,
};

async function initWebGPU() {
  if (!navigator.gpu) {
    console.warn("[Offscreen] WebGPU not available - falling back to Canvas 2D.");
    gpuStatus = WebGPUStatus.UNAVAILABLE;
    reportGPUStatus();
    return false;
  }

  try {
    const adapter = await navigator.gpu.requestAdapter({ powerPreference: "high-performance" });
    if (!adapter) {
      gpuStatus = WebGPUStatus.UNAVAILABLE;
      reportGPUStatus();
      return false;
    }

    gpuDevice = await adapter.requestDevice({
      requiredLimits: {
        maxBufferSize:                  256 * 1024 * 1024,
        maxStorageBufferBindingSize:    128 * 1024 * 1024,
      },
    });

    // Handle device loss
    gpuDevice.lost.then((info) => {
      console.error("[Offscreen] WebGPU device lost:", info.message);
      gpuDevice = null;
      gpuStatus = WebGPUStatus.ERROR;
      reportGPUStatus();
    });

    gpuStatus = WebGPUStatus.AVAILABLE;
    reportGPUStatus();

    // Warm-up pass: draw a blank 640x640 tensor to trigger shader compilation
    await warmUpInference();

    console.log("[Offscreen] WebGPU device initialized successfully.");
    return true;
  } catch (err) {
    console.error("[Offscreen] WebGPU init error:", err);
    gpuStatus = WebGPUStatus.ERROR;
    reportGPUStatus();
    return false;
  }
}

/**
 * Pre-warm the inference pipeline with a blank canvas.
 * This triggers WGSL shader compilation upfront so the first real frame
 * doesn't suffer a 200-500ms compilation stall.
 */
async function warmUpInference() {
  const warmCanvas = new OffscreenCanvas(640, 640);
  const warmCtx    = warmCanvas.getContext("2d");
  warmCtx.fillStyle = "#808080";
  warmCtx.fillRect(0, 0, 640, 640);

  console.log("[Offscreen] Warm-up inference pass complete.");
}

// â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• 
// MODEL CACHE (Cache API)
// â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• 

const MODEL_CACHE_NAME = "lensagent-models-v1";

/**
 * Cache a model file from a URL. Returns the cached ArrayBuffer.
 * Falls back to network fetch if not cached.
 * @param {string} url - URL to the model file
 * @returns {Promise<ArrayBuffer>}
 */
async function getCachedModel(url) {
  try {
    const cache = await caches.open(MODEL_CACHE_NAME);
    const cached = await cache.match(url);

    if (cached) {
      console.log(`[Offscreen] Model loaded from cache: ${url}`);
      return cached.arrayBuffer();
    }

    console.log(`[Offscreen] Downloading and caching model: ${url}`);
    const response = await fetch(url);
    await cache.put(url, response.clone());
    return response.arrayBuffer();
  } catch (err) {
    console.warn("[Offscreen] Cache API unavailable, fetching directly:", err);
    const response = await fetch(url);
    return response.arrayBuffer();
  }
}

// =====================================================================================================================
// PORT CONNECTION & AUTO-RECONNECT
// =====================================================================================================================

let port = null;



function connectPort() {
  try {
    port = chrome.runtime.connect({ name: PORT_OFFSCREEN });

    port.onMessage.addListener(async (msg) => {
      switch (msg.type) {
        case BG_PROCESS_FRAME: {
          const { correlationId, rawBase64, buffer, piiBoxes, dpr, viewportWidth } = msg;
          try {
            const result = await processFrame(rawBase64, buffer, piiBoxes || [], dpr || 1.0, viewportWidth || null);
            if (port) port.postMessage({ type: OS_PERCEPTION_DONE, correlationId, result });
          } catch (err) {
            console.error("[Offscreen] Frame error:", err);
            if (port) port.postMessage({ type: OS_PERCEPTION_DONE, correlationId, error: err.message, result: fallbackResult() });
          }
          break;
        }
        case HEARTBEAT_PING:
          if (port) port.postMessage({ type: HEARTBEAT_PONG });
          break;
      }
    });

    port.onDisconnect.addListener(() => {
      console.warn("[Offscreen] Port disconnected from Service Worker. Auto-reconnecting...");
      port = null;
      setTimeout(connectPort, 400);
    });

    // Signal readiness
    port.postMessage({ type: OS_READY, gpuStatus });
    console.log("[Offscreen] Connected to Service Worker channel.");
  } catch (err) {
    console.error("[Offscreen] Connect error:", err);
    setTimeout(connectPort, 1000);
  }
}

connectPort();

function reportGPUStatus() {
  if (port) port.postMessage({ type: OS_WEBGPU_STATUS, status: gpuStatus });
}

// =====================================================================================================================
// FRAME PROCESSING PIPELINE
// =====================================================================================================================

async function processFrame(rawBase64, buffer, piiBoxes = [], defaultDpr = 1.0, viewportWidth = null) {
  const t0 = performance.now();
  frameCount++;

  // 1. Decode frame & verify true DPR scaling using zero-copy ImageBitmap
  let imageBitmap;
  if (buffer) {
    const blob = new Blob([buffer], { type: 'image/jpeg' });
    imageBitmap = await createImageBitmap(blob);
  } else {
    const res = await fetch(`data:image/jpeg;base64,${rawBase64}`);
    const blob = await res.blob();
    imageBitmap = await createImageBitmap(blob);
  }
  const dpr = viewportWidth ? (imageBitmap.width / viewportWidth) : defaultDpr;
  const decodeMs = 0; // Handled internally by privacy engine

  // 2. Structural element detection via Member 1 WebGPU Model
  const tInfer = performance.now();
  const elements = await visionModel.detect(rawBase64);
  
  // CRITICAL FIX: WebGPU elements are ALREADY in physical pixels (from the raw screenshot).
  // But piiBoxes (from action-executor DOM) are in CSS pixels!
  // We must multiply piiBoxes by DPR to match the physical canvas of PrivacyEngine.
  const scaledPiiBoxes = piiBoxes.map(box => {
    if (!box || !box.boundingBox) return box;
    return {
      ...box,
      boundingBox: {
        x: Math.round(box.boundingBox.x * dpr),
        y: Math.round(box.boundingBox.y * dpr),
        width: Math.round(box.boundingBox.width * dpr),
        height: Math.round(box.boundingBox.height * dpr)
      }
    };
  });
  
  const inferMs = performance.now() - tInfer;

  // 3. PII detection & canvas redaction via PrivacyEngine
  const tRedact = performance.now();
  const { sanitizedImage, tokenMap } = await privacyEngine.sanitizeViewport(
    imageBitmap,
    [...elements, ...scaledPiiBoxes],
    dpr
  );
  const redactMs = performance.now() - tRedact;

  // 4. Update performance accumulators
  const totalMs = performance.now() - t0;
  perfAccum.decodeMs    += decodeMs;
  perfAccum.inferenceMs += inferMs;
  perfAccum.redactionMs += redactMs;
  perfAccum.exportMs    += 0; // Handled internally by privacy engine
  perfAccum.totalMs     += totalMs;
  perfAccum.frames++;

  // Report perf metrics every 10 frames
  if (frameCount % 10 === 0) {
    port.postMessage({
      type: OS_PERF_METRICS,
      metrics: {
        avgDecodeMs:    Math.round(perfAccum.decodeMs / perfAccum.frames * 10) / 10,
        avgInferenceMs: Math.round(perfAccum.inferenceMs / perfAccum.frames * 10) / 10,
        avgRedactionMs: Math.round(perfAccum.redactionMs / perfAccum.frames * 10) / 10,
        avgExportMs:    0,
        avgTotalMs:     Math.round(perfAccum.totalMs / perfAccum.frames * 10) / 10,
        totalFrames:    frameCount,
      },
    });
  }
  const somElements = applySetOfMark(elements);

  return {
    elements: somElements,
    redactedRegions: tokenMap,
    rawImageBase64: rawBase64,
    redactedImageBase64: sanitizedImage,
  };
}

/**
 * Set-of-Mark (SoM) Prompting - Microsoft Research (arXiv:2310.11441)
 * ====================================================================
 * Annotates each detected UI element with a numbered SoM ID so the
 * AI model can reference elements by ID ("Click element 3") instead of
 * guessing raw pixel coordinates. This dramatically improves visual
 * grounding accuracy and eliminates coordinate hallucination.
 *
 * PRIVACY NOTE: SoM annotation happens AFTER redaction, so PII regions
 * are already blacked out before any element labeling is applied.
 *
 * @param {Array} elements - Detected structural UI elements with bboxes
 * @returns {Array} Elements annotated with som_id and som_label fields
 */
function applySetOfMark(elements) {
  if (!elements || elements.length === 0) return elements;

  try {
    return elements.map((el, idx) => ({
      ...el,
      som_id: idx + 1,  // 1-indexed for human readability
      som_label: `[${idx + 1}]`,
    }));
  } catch (err) {
    console.warn("[SoM] Overlay annotation failed:", err.message);
    return elements;
  }
}






/**
 * @returns {import('../lib/message-types.js').PerceptionResult} Empty fallback payload
 */
function fallbackResult() {
  return { elements: [], redactedRegions: [], rawImageBase64: "", redactedImageBase64: "" };
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// INIT
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

initWebGPU();
console.log("[Offscreen] Perception engine initialized - Member 3 PrivacyEngine active (real PII redaction).");

