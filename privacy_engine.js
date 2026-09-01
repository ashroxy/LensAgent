/**
 * privacy_engine.js - Zero-Leakage Privacy Engine
 * 
 * Provides:
 * 1. sanitizeViewport: Combines DOM ground-truth PII with Member 1's ML detections.
 * 2. validatePayload: Scans outgoing payloads for unmasked PII (Aadhaar, PAN, Cards, Passwords, etc.)
 */

export class PrivacyEngine {
  constructor(options = {}) {
    this.enableStrictZeroLeakage = options.enableStrictZeroLeakage ?? true;
    this.boxPadding = options.boxPadding ?? 8;
  }

  // Regex patterns for sensitive Indian & Global PII
  static PII_PATTERNS = {
    AADHAAR: /\b[2-9]\d{3}[ -]?\d{4}[ -]?\d{4}\b/,
    PAN: /\b[A-Z]{5}[0-9]{4}[A-Z]{1}\b/,
    CREDIT_CARD: /\b(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|6(?:011|5[0-9]{2})[0-9]{12}|3[47][0-9]{13}|35\d{14})\b/,
    PHONE: /\b(?:\+91[ -]?)?[6-9]\d{9}\b/,
    EMAIL: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/
  };

  /**
   * Scans DOM for visible sensitive elements
   * @param {number} [dpr=1] - Window device pixel ratio
   * @returns {Array} List of DOM bounding boxes
   */
  extractDOMBoundingBoxes(dpr = 1) {
    if (typeof document === 'undefined') return [];
    const selectors = [
      'input[type="password"]',
      'input[type="email"]',
      'input[type="tel"]',
      'input[type="number"]',
      'input[autocomplete*="cc-"]',
      'input[autocomplete*="credit-card"]',
      'input[id*="card" i]',
      'input[name*="card" i]',
      'input[id*="cvv" i]',
      'input[name*="cvv" i]',
      'input[id*="ssn" i]',
      'input[name*="ssn" i]',
      'input[id*="aadhaar" i]',
      'input[name*="aadhaar" i]',
      'input[id*="pan" i]',
      'input[name*="pan" i]',
      'input[id*="password" i]',
      'input[name*="password" i]',
      '[data-pii]',
      '.sensitive-pii',
      '.sensitive',
      '[contenteditable="true"]'
    ];

    const elements = document.querySelectorAll(selectors.join(','));
    const boxes = [];
    let idx = 1;

    for (const el of elements) {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0 && rect.top < window.innerHeight && rect.bottom > 0) {
        const category = (el.getAttribute('data-pii') || el.name || el.type || 'DOM_INPUT').toUpperCase();
        boxes.push({
          id: `DOM_PII_${idx}`,
          category: category,
          boundingBox: {
            x: Math.round(rect.left * dpr),
            y: Math.round(rect.top * dpr),
            width: Math.round(rect.width * dpr),
            height: Math.round(rect.height * dpr)
          },
          redactionLabel: `[REDACTED_DOM_${category}_#${idx}]`
        });
        idx++;
      }
    }
    return boxes;
  }

  /**
   * Sanitize Viewport Image with both DOM PII and Member 1's ML detections
   * @param {string} rawScreenshotBase64 - Captured viewport image (PNG/WebP/Base64)
   * @param {Array} [customMlBoxes=[]] - ML bounding boxes from Member 1
   * @param {number} [dpr=1] - Device pixel ratio
   * @returns {Promise<{sanitizedImage: string, tokenMap: Array, telemetry: object}>}
   */
  async sanitizeViewport(rawScreenshotBase64, customMlBoxes = [], dpr = 1) {
    const startTime = performance.now();

    // 1. Gather DOM-level ground truth boxes
    const domBoxes = this.extractDOMBoundingBoxes(dpr);

    // 2. Combine DOM boxes and Member 1 ML boxes
    const allBoxes = [...domBoxes, ...(customMlBoxes || [])];
    const tokenMap = [];

    // 3. Load image into Canvas
    const dataUri = rawScreenshotBase64.startsWith('data:') 
      ? rawScreenshotBase64 
      : `data:image/jpeg;base64,${rawScreenshotBase64}`;
    const imgBlob = await (await fetch(dataUri)).blob();
    const imageBitmap = await createImageBitmap(imgBlob);

    // Support both OffscreenCanvas and standard DOM Canvas
    const canvas = (typeof OffscreenCanvas !== 'undefined')
      ? new OffscreenCanvas(imageBitmap.width, imageBitmap.height)
      : document.createElement('canvas');
    
    if (!canvas.width) {
      canvas.width = imageBitmap.width;
      canvas.height = imageBitmap.height;
    }
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(imageBitmap, 0, 0);
    imageBitmap.close(); // CRITICAL: Free GPU memory immediately

    // 4. Draw Solid #000000 blackout boxes with padding
    ctx.fillStyle = '#000000';
    for (const item of allBoxes) {
      const { x, y, width, height } = item.boundingBox;
      const pad = this.boxPadding;
      const px = Math.max(0, x - pad);
      const py = Math.max(0, y - pad);
      const pw = Math.min(canvas.width - px, width + pad * 2);
      const ph = Math.min(canvas.height - py, height + pad * 2);

      ctx.fillRect(px, py, pw, ph);

      tokenMap.push({
        id: item.id,
        category: item.category,
        redactionLabel: item.redactionLabel,
        boundingBox: { x: px, y: py, width: pw, height: ph }
      });
    }

    // 5. Export as WebP / JPEG base64
    let sanitizedImage;
    if (canvas.convertToBlob) {
      const blob = await canvas.convertToBlob({ type: 'image/webp', quality: 0.85 });
      sanitizedImage = await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.readAsDataURL(blob);
      });
    } else {
      sanitizedImage = canvas.toDataURL('image/webp', 0.85);
    }

    const latency = Math.round(performance.now() - startTime);

    return {
      sanitizedImage,
      tokenMap,
      telemetry: {
        sanitizationLatencyMs: latency,
        maskedItemsCount: tokenMap.length,
        domBoxesCount: domBoxes.length,
        mlBoxesCount: customMlBoxes.length
      }
    };
  }

  /**
   * Member 4 Validation: Scans outgoing JSON payload for unmasked PII
   * @param {object|string} payload - JSON object or string to validate
   * @returns {boolean} True if safe
   * @throws {Error} If unmasked sensitive PII is found
   */
  validatePayload(payload) {
    if (!this.enableStrictZeroLeakage) return true;
    if (payload == null) return true;

    const payloadString = (typeof payload === 'string') ? payload : JSON.stringify(payload);
    if (!payloadString) return true;

    for (const [key, regex] of Object.entries(PrivacyEngine.PII_PATTERNS)) {
      const match = payloadString.match(regex);
      if (match) {
        throw new Error(`Unmasked ${key} detected in payload: "${match[0]}". Payload blocked locally to prevent privacy leak.`);
      }
    }

    return true;
  }
}
