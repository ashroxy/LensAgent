/**
 * privacy_engine.js - Zero-Leakage Privacy Engine
 * 
 * Provides:
 * 1. sanitizeViewport: Combines DOM ground-truth PII with Member 1's ML detections.
 *    Supports 'placeholder' jargon masking (e.g. [REDACTED_PASSWORD], ••••••) or hard 'blackout'.
 * 2. validatePayload: Scans outgoing payloads for unmasked PII (Aadhaar, PAN, Cards, Passwords, etc.)
 */

export class PrivacyEngine {
  constructor(options = {}) {
    this.enableStrictZeroLeakage = options.enableStrictZeroLeakage ?? true;
    this.boxPadding = options.boxPadding ?? 8;
    this.maskStyle = options.maskStyle ?? 'placeholder'; // 'placeholder' | 'blackout'
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
   * Generates realistic placeholder/jargon text for given category
   * @param {string} category 
   * @param {string} label 
   * @returns {string} Placeholder jargon string
   */
  static getPlaceholderText(category = '', label = '') {
    const cat = (category || label || '').toUpperCase();
    if (cat.includes('PASSWORD')) return '••••••••••••';
    if (cat.includes('CARD') || cat.includes('CC')) return '[REDACTED_CARD_****]';
    if (cat.includes('AADHAAR')) return '[REDACTED_AADHAAR_****]';
    if (cat.includes('PAN')) return '[REDACTED_PAN_****]';
    if (cat.includes('EMAIL')) return '[REDACTED_EMAIL@DOMAIN]';
    if (cat.includes('PHONE') || cat.includes('TEL')) return '[REDACTED_PHONE_+91]';
    if (cat.includes('FACE') || cat.includes('AVATAR')) return '[REDACTED_AVATAR]';
    if (cat.includes('NAME')) return '[REDACTED_NAME_***]';
    if (cat.includes('CVV')) return '•••';
    return `[REDACTED_${cat.replace(/\s+/g, '_') || 'PII'}]`;
  }

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
    let imageBitmap;
    if (typeof rawScreenshotBase64 === 'string') {
      const dataUrl = rawScreenshotBase64.startsWith('data:') 
        ? rawScreenshotBase64 
        : `data:image/jpeg;base64,${rawScreenshotBase64}`;
      const imgBlob = await (await fetch(dataUrl)).blob();
      imageBitmap = await createImageBitmap(imgBlob);
    } else {
      imageBitmap = rawScreenshotBase64;
    }

    // Support both OffscreenCanvas and standard DOM Canvas
    const canvas = (typeof OffscreenCanvas !== 'undefined')
      ? new OffscreenCanvas(imageBitmap.width, imageBitmap.height)
      : document.createElement('canvas');
    
    if (!canvas.width) {
      canvas.width = imageBitmap.width;
      canvas.height = imageBitmap.height;
    }
    const ctx = canvas.getContext('2d');
    ctx.drawImage(imageBitmap, 0, 0);

    // 4. Render Redaction Masks (Placeholder Jargon Text or Blackout)
    for (const item of allBoxes) {
      const { x, y, width, height } = item.boundingBox;
      const pad = this.boxPadding;
      const px = Math.max(0, x - pad);
      const py = Math.max(0, y - pad);
      const pw = Math.min(canvas.width - px, width + pad * 2);
      const ph = Math.min(canvas.height - py, height + pad * 2);

      const placeholderText = PrivacyEngine.getPlaceholderText(item.category, item.redactionLabel);

      if (this.maskStyle === 'placeholder') {
        // Step A: Draw stylized dark container badge box
        ctx.fillStyle = '#0f172a'; // Deep slate background to completely obscure underlying pixels
        ctx.fillRect(px, py, pw, ph);

        // Step B: Draw subtle border highlight
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(px, py, pw, ph);

        // Step C: Render centered placeholder/jargon text
        const fontSize = Math.max(10, Math.min(13, Math.floor(ph * 0.45)));
        ctx.font = `600 ${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, monospace`;
        ctx.fillStyle = '#38bdf8'; // Cyan text
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        ctx.save();
        ctx.beginPath();
        ctx.rect(px + 2, py + 2, Math.max(0, pw - 4), Math.max(0, ph - 4));
        ctx.clip(); // Prevent text overflow outside box boundary

        ctx.fillText(placeholderText, px + pw / 2, py + ph / 2);
        ctx.restore();

      } else {
        // Fallback: Solid Blackout
        ctx.fillStyle = '#000000';
        ctx.fillRect(px, py, pw, ph);
      }

      tokenMap.push({
        id: item.id,
        category: item.category,
        redactionLabel: item.redactionLabel,
        placeholder: placeholderText,
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
    
    if (sanitizedImage.includes(',')) {
      sanitizedImage = sanitizedImage.split(',')[1];
    }

    const latency = Math.round(performance.now() - startTime);

    return {
      sanitizedImage,
      tokenMap,
      telemetry: {
        sanitizationLatencyMs: latency,
        maskedItemsCount: tokenMap.length,
        domBoxesCount: domBoxes.length,
        mlBoxesCount: customMlBoxes.length,
        maskStyle: this.maskStyle
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

    const payloadString = (typeof payload === 'string') ? payload : JSON.stringify(payload);

    for (const [key, regex] of Object.entries(PrivacyEngine.PII_PATTERNS)) {
      const match = payloadString.match(regex);
      if (match) {
        throw new Error(`Unmasked ${key} detected in payload: "${match[0]}". Payload blocked locally to prevent privacy leak.`);
      }
    }

    return true;
  }
}


