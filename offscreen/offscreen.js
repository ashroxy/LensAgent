// offscreen.js - High-Speed WebGPU & DOM Ground-Truth Fusion Redaction Engine
import { pipeline, env, RawImage } from '@xenova/transformers';

// 1. Configure WebGPU Execution Environment
env.allowLocalModels = false;
env.allowRemoteModels = true;
env.remoteHost = 'https://huggingface.co';
env.remotePath = '{model}/resolve/{revision}/';
env.backends.onnx.wasm.hasWebGPU = true;
env.backends.onnx.wasm.numThreads = 4;

let detector = null;
let isInitializing = false;
let initPromise = null;

// Target visual queries for zero-shot object detection
const VISION_CLASSES = [
  'face',
  'human face',
  'profile photo',
  'credit card',
  'id card',
  'driver license',
  'qr code',
  'text input'
];

// Safety bounding box margin in pixels to eliminate edge leaks
const BOX_PADDING = 8;

async function getDetector() {
  if (detector) return detector;
  if (isInitializing) return initPromise;

  isInitializing = true;
  initPromise = (async () => {
    try {
      console.log("[WebGPU Redactor] Initializing WebGPU Vision Model (Xenova/owlvit-base-patch16)...");
      detector = await pipeline('zero-shot-object-detection', 'Xenova/owlvit-base-patch16', {
        device: 'webgpu',
        quantized: true
      });
      console.log("[WebGPU Redactor] WebGPU Vision Model ready!");
      return detector;
    } catch (err) {
      console.warn("[WebGPU Redactor] WebGPU acceleration unavailable, falling back to WASM:", err);
      detector = await pipeline('zero-shot-object-detection', 'Xenova/owlvit-base-patch16', {
        device: 'wasm',
        quantized: true
      });
      return detector;
    } finally {
      isInitializing = false;
    }
  })();

  return initPromise;
}

/**
 * High-Speed Dual-Pass Redactor: Fuses WebGPU Vision Detections + DOM Ground Truth
 * @param {string} dataUrl - Raw tab screenshot data URL (PNG/JPEG)
 * @param {Array<{xmin: number, ymin: number, xmax: number, ymax: number}>} domBoxes - 100% deterministic DOM ground truth boxes
 * @returns {Promise<{sanitizedBase64: string, detectionCount: number, latencyMs: number, error: string|null}>}
 */
export async function redactSensitiveData(dataUrl, domBoxes = []) {
  const startTime = performance.now();
  try {
    // 1. Concurrently decode image to OffscreenCanvas and prepare RawImage for WebGPU
    const [detectorInstance, rawImage, imageBitmap] = await Promise.all([
      getDetector(),
      RawImage.read(dataUrl),
      fetch(dataUrl).then(res => res.blob()).then(blob => createImageBitmap(blob))
    ]);

    const canvas = new OffscreenCanvas(imageBitmap.width, imageBitmap.height);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(imageBitmap, 0, 0);

    // 2. Run WebGPU Vision Detection — threshold 0.40 minimises false positives on real sites
    const visionResults = await detectorInstance(rawImage, VISION_CLASSES, { threshold: 0.40 });

    // 3. Dual-Pass Masking with Placeholder / Jargon Text Badges
    let totalDetections = 0;

    function renderPlaceholderBadge(px, py, pw, ph, text) {
      // 1. Draw solid dark background to destroy original pixels
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(px, py, pw, ph);

      // 2. Draw subtle border highlight
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(px, py, pw, ph);

      // 3. Render centered placeholder/jargon text
      const fontSize = Math.max(10, Math.min(13, Math.floor(ph * 0.45)));
      ctx.font = `600 ${fontSize}px sans-serif, monospace`;
      ctx.fillStyle = '#38bdf8';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      ctx.save();
      ctx.beginPath();
      ctx.rect(px + 2, py + 2, Math.max(0, pw - 4), Math.max(0, ph - 4));
      ctx.clip();
      ctx.fillText(text, px + pw / 2, py + ph / 2);
      ctx.restore();
    }

    // Pass 1: DOM Ground-Truth Form Fields & Sensitive Inputs (100% Deterministic)
    for (const box of domBoxes) {
      const xmin = Math.max(0, box.xmin - BOX_PADDING);
      const ymin = Math.max(0, box.ymin - BOX_PADDING);
      const width = Math.min(canvas.width - xmin, (box.xmax - box.xmin) + (BOX_PADDING * 2));
      const height = Math.min(canvas.height - ymin, (box.ymax - box.ymin) + (BOX_PADDING * 2));
      
      const label = (box.label || 'PII').toUpperCase();
      let placeholder = `[REDACTED_${label}]`;
      if (label.includes('PASSWORD')) placeholder = '••••••••••••';
      else if (label.includes('CARD')) placeholder = '[REDACTED_CARD_****]';
      else if (label.includes('AADHAAR')) placeholder = '[REDACTED_AADHAAR]';
      else if (label.includes('PAN')) placeholder = '[REDACTED_PAN]';
      else if (label.includes('EMAIL')) placeholder = '[REDACTED_EMAIL]';
      else if (label.includes('PHONE') || label.includes('TEL')) placeholder = '[REDACTED_PHONE]';

      renderPlaceholderBadge(xmin, ymin, width, height, placeholder);
      totalDetections++;
    }

    // Pass 2: WebGPU Vision Detections (Faces, Cards, Scanned IDs, Avatars)
    for (const det of visionResults) {
      const { xmin, ymin, xmax, ymax } = det.box;
      const paddedXmin = Math.max(0, Math.round(xmin) - BOX_PADDING);
      const paddedYmin = Math.max(0, Math.round(ymin) - BOX_PADDING);
      const width = Math.min(canvas.width - paddedXmin, Math.round(xmax - xmin) + (BOX_PADDING * 2));
      const height = Math.min(canvas.height - paddedYmin, Math.round(ymax - ymin) + (BOX_PADDING * 2));

      const label = (det.label || 'OBJECT').toUpperCase();
      let placeholder = `[REDACTED_${label}]`;
      if (label.includes('FACE') || label.includes('PHOTO')) placeholder = '[REDACTED_AVATAR]';
      else if (label.includes('CARD')) placeholder = '[REDACTED_CARD_****]';
      else if (label.includes('ID') || label.includes('LICENSE')) placeholder = '[REDACTED_ID_DOC]';
      else if (label.includes('QR')) placeholder = '[REDACTED_QR_CODE]';

      renderPlaceholderBadge(paddedXmin, paddedYmin, width, height, placeholder);
      totalDetections++;
    }

    // 4. Export sanitized canvas as Base64 JPEG
    const sanitizedBlob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.85 });
    
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const totalLatency = Math.round(performance.now() - startTime);
        console.log(`[WebGPU Redactor] Sanitized frame in ${totalLatency}ms (${totalDetections} redaction boxes applied).`);
        resolve({
          sanitizedBase64: reader.result,
          detectionCount: totalDetections,
          latencyMs: totalLatency,
          error: null
        });
      };
      reader.readAsDataURL(sanitizedBlob);
    });

  } catch (err) {
    const totalLatency = Math.round(performance.now() - startTime);
    console.error("[WebGPU Redactor Error]:", err);
    return {
      sanitizedBase64: null,
      detectionCount: 0,
      latencyMs: totalLatency,
      error: err.message || String(err)
    };
  }
}

/**
 * Runs Vision Model only and returns Member 1 customMlBoxes schema
 */
export async function runVisionDetection(dataUrl, classes = VISION_CLASSES, threshold = 0.15) {
  try {
    const [detectorInstance, rawImage] = await Promise.all([
      getDetector(),
      RawImage.read(dataUrl)
    ]);

    const results = await detectorInstance(rawImage, classes, { threshold });
    
    // Map to Member 1 contract
    const customMlBoxes = results.map((det, index) => {
      const idx = index + 1;
      const label = (det.label || 'OBJECT').toLowerCase();
      
      let category = 'VISUAL_PII';
      if (label.includes('face') || label.includes('photo')) category = 'FACE_AVATAR';
      else if (label.includes('card')) category = 'CREDIT_CARD';
      else if (label.includes('id') || label.includes('license')) category = 'ID_DOCUMENT';
      else if (label.includes('qr')) category = 'QR_CODE';

      const x = Math.round(det.box.xmin);
      const y = Math.round(det.box.ymin);
      const width = Math.round(det.box.xmax - det.box.xmin);
      const height = Math.round(det.box.ymax - det.box.ymin);

      return {
        id: `ML_DETECTED_${category}_${idx}`,
        category: category,
        boundingBox: { x, y, width, height },
        redactionLabel: `[REDACTED_${category}_#${idx}]`
      };
    });

    return { customMlBoxes, error: null };
  } catch (err) {
    console.error("[Vision Detection Error]:", err);
    return { customMlBoxes: [], error: err.message || String(err) };
  }
}

// Background Worker Message Listener
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'PROCESS_SCREENSHOT') {
    redactSensitiveData(request.dataUrl, request.domBoxes || []).then(sendResponse);
    return true; // Async response channel
  }

  if (request.type === 'RUN_VISION_DETECTION') {
    runVisionDetection(request.dataUrl, request.classes, request.threshold).then(sendResponse);
    return true;
  }
});
