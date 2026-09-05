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
    CREDIT_CARD: /(?<!\d)(?:\d{4}[\s\-]?){3}\d{4}(?!\d)|(?<!\d)\d{13,16}(?!\d)/,
    PHONE: /\b(?:\+91[ -]?)?[6-9]\d{9}\b/,
    EMAIL: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/,
    UPI_ID: /[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z]{2,64}/i,
    PASSPORT: /[A-Z][1-9][0-9]{7}/,
    DRIVING_LICENSE: /[A-Z]{2}[0-9]{2}[0-9]{11}|[A-Z]{2}-[0-9]{13}/,
    VOTER_ID: /[A-Z]{3}[0-9]{7}/,
    PIN_CODE: /\b[1-9][0-9]{5}\b/
  };

  /**
   * Generates realistic placeholder/jargon text for given category
   * @param {string} category 
   * @param {string} label 
   * @returns {string} Placeholder jargon string
   */
  static getPlaceholderText(category = '', label = '') {
    const cat = (category || label || '').toUpperCase();
    if (cat === 'UPI_ID' || cat.includes('UPI')) return '[REDACTED_UPI_ID]';
    if (cat === 'PASSPORT' || cat.includes('PASSPORT')) return '[REDACTED_PASSPORT_****]';
    if (cat === 'DRIVING_LICENSE' || cat.includes('LICENSE') || cat.includes('DRIVING') || cat.includes('DL')) return '[REDACTED_DL_****]';
    if (cat === 'VOTER_ID' || cat.includes('VOTER')) return '[REDACTED_VOTER_ID]';
    if (cat === 'PIN_CODE' || cat.includes('PIN') || cat.includes('POSTAL') || cat.includes('ZIP')) return '[REDACTED_PIN_CODE]';
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
   * Luhn checksum - returns true only for a valid credit-card number.
   * Distinguishes real PAN numbers from arbitrary digit runs (e.g. phone/test
   * numbers that merely look card-shaped, like "4000244140625").
   */
  _isValidLuhnCard(digits) {
    const clean = (digits || "").replace(/[\s\-]/g, "");
    if (!/^\d{13,16}$/.test(clean)) return false;
    let sum = 0;
    let double = false;
    for (let i = clean.length - 1; i >= 0; i--) {
      let d = clean.charCodeAt(i) - 48;
      if (double) {
        d *= 2;
        if (d > 9) d -= 9;
      }
      sum += d;
      double = !double;
    }
    return sum % 10 === 0;
  }

  /**
   * Redacts sensitive PII in text using defined patterns and placeholders.
   * @param {string} text - Input text containing sensitive PII
   * @returns {string} Text with all PII replaced by safe placeholders
   */
  redactText(text) {
    if (typeof text !== 'string' || !text) return text;
    let redacted = text;

    const order = [
      'EMAIL',
      'CREDIT_CARD',
      'AADHAAR',
      'PAN',
      'PHONE',
      'UPI_ID',
      'PASSPORT',
      'DRIVING_LICENSE',
      'VOTER_ID',
      'PIN_CODE'
    ];

    for (const category of order) {
      const rx = PrivacyEngine.PII_PATTERNS[category];
      if (!rx) continue;
      const flags = rx.flags.includes('g') ? rx.flags : rx.flags + 'g';
      const globalRx = new RegExp(rx.source, flags);
      redacted = redacted.replace(globalRx, (match) => {
        if (/^\[?(REDACTED_|SYS_|PROTECTED_|MASKED_)/.test(match)) return match;
        if (category === 'CREDIT_CARD' && !this._isValidLuhnCard(match)) return match;
        return PrivacyEngine.getPlaceholderText(category);
      });
    }

    return redacted;
  }

  static redactText(text) {
    const engine = new PrivacyEngine();
    return engine.redactText(text);
  }

  /**
   * Recursively scans a value, object, or array for sensitive PII violations.
   * @param {*} value - The value or object to scan
   * @param {string} [path=''] - The current object path
   * @param {string} [key=''] - The property key name
   * @param {Array} [violations=[]] - Array to collect detected violations
   * @returns {Array} List of detected violations
   */
  scanValue(value, path = '', key = '', violations = []) {
    if (value == null) return violations;
    if (key === 'session_id' || key === 'sessionId') return violations;

    const CONTENT_KEYS = new Set([
      'value', 'text', 'label', 'placeholder', 'name', 'title', 'url',
      'actual', 'actual_value', 'expected', 'expected_value', 'expectedValue',
      'optionText', 'aria_label', 'aria-label', 'description', 'task', 'detail',
      'answer', 'full_text', 'content', 'option_text', 'text_content',
      'pincode', 'pin_code', 'pin', 'postal_code', 'zip', 'zipcode'
    ]);

    const globalPatterns = Object.fromEntries(
      Object.entries(PrivacyEngine.PII_PATTERNS).map(([k, rx]) => [
        k,
        new RegExp(rx.source, rx.flags.includes('g') ? rx.flags : rx.flags + 'g'),
      ])
    );

    if (typeof value === 'string') {
      const str = value;
      for (const [category, regex] of Object.entries(globalPatterns)) {
        regex.lastIndex = 0;
        let match;
        while ((match = regex.exec(str)) !== null) {
          const val = match[0];
          const isSafe = /^\[?(REDACTED_|SYS_|PROTECTED_|MASKED_)/.test(val);
          if (isSafe) continue;
          if (category === 'CREDIT_CARD' && !this._isValidLuhnCard(val)) continue;
          violations.push({
            category,
            matchedSample: val.length > 5 ? val.slice(0, 3) + '****' + val.slice(-2) : '****',
            path: path || key || 'root'
          });
        }
      }
      return violations;
    }

    if (typeof value === 'number' && (CONTENT_KEYS.has(key) || !key)) {
      const str = String(value);
      for (const [category, regex] of Object.entries(globalPatterns)) {
        regex.lastIndex = 0;
        let match;
        while ((match = regex.exec(str)) !== null) {
          const val = match[0];
          const isSafe = /^\[?(REDACTED_|SYS_|PROTECTED_|MASKED_)/.test(val);
          if (isSafe) continue;
          if (category === 'CREDIT_CARD' && !this._isValidLuhnCard(val)) continue;
          violations.push({
            category,
            matchedSample: val.length > 5 ? val.slice(0, 3) + '****' + val.slice(-2) : '****',
            path: path || key || 'root'
          });
        }
      }
      return violations;
    }

    if (Array.isArray(value)) {
      value.forEach((item, i) => {
        this.scanValue(item, path ? `${path}[${i}]` : `[${i}]`, key, violations);
      });
      return violations;
    }

    if (typeof value === 'object') {
      for (const [childKey, item] of Object.entries(value)) {
        this.scanValue(item, path ? `${path}.${childKey}` : childKey, childKey, violations);
      }
      return violations;
    }

    return violations;
  }

  static scanValue(value, path = '', key = '', violations = []) {
    const engine = new PrivacyEngine();
    return engine.scanValue(value, path, key, violations);
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

    const violations = [];
    if (typeof payload === 'object' && payload !== null) {
      this.scanValue(payload, '', '', violations);
    } else if (typeof payload === 'string' || typeof payload === 'number') {
      this.scanValue(payload, '', '', violations);
    }

    if (violations.length > 0) {
      const detail = violations.map((v) => `${v.category}@${v.path || '?'}(=${v.matchedSample})`).join('; ');
      throw new Error(`[PrivacyEngine] SECURITY ALERT: Blocked outgoing payload with ${violations.length} unmasked PII leaks (${detail}).`);
    }
    return true;
  }
}


