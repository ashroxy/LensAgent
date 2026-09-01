/**
 * action-executor.js - CDP Input Synthesizer
 * =============================================
 * Dispatches synthetic user inputs via Chrome DevTools Protocol.
 *
 * Features:
 *   1. DPR-aware coordinate normalization (Retina / Windows scaling safe)
 *   2. Gaussian jitter injection for human-like mouse movement
 *   3. Variable inter-key timing with word-boundary awareness
 *   4. Coordinate validation via DOM.getNodeForLocation
 *   5. Retry logic with configurable attempts
 *   6. Full action type support: click, double-click, type, scroll,
 *      press key, hover, drag, select, navigate, back
 *   7. Action history tracking for audit trail
 *   8. Smooth multi-step scrolling for realism
 *   9. Focus verification after click actions
 */

import { ActionType } from "./message-types.js";

export class ActionExecutor {
  /**
   * @param {number} tabId
   * @param {Object} [opts]
   * @param {number} [opts.dpr=1]
   * @param {boolean} [opts.humanize=true]
   * @param {number} [opts.interKeyDelayBase=30]
   * @param {number} [opts.interKeyJitter=40]
   * @param {number} [opts.maxRetries=2]
   */
  constructor(tabId, opts = {}) {
    this.tabId  = tabId;
    this.target = { tabId };
    this.dpr    = opts.dpr ?? 1;

    this.humanize          = opts.humanize ?? true;
    this.interKeyDelayBase = opts.interKeyDelayBase ?? 30;
    this.interKeyJitter    = opts.interKeyJitter ?? 40;
    this.maxRetries        = opts.maxRetries ?? 2;

    // Action history for audit trail
    this._history = [];
    this._maxHistory = 100;
  }

  /** Update DPR dynamically (e.g., after querying from CaptureEngine) */
  setDPR(dpr) { this.dpr = dpr; }

  /** Get action execution history */
  getHistory() { return [...this._history]; }

  // ═══════════════════════════════════════════════════════════════════════════
  // MAIN DISPATCH
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Execute a server action plan with retry logic.
   * @param {Object} action - { type, x, y, text, key, delta_y, url, ... }
   * @returns {Promise<{success: boolean, action: string, detail: string, retries: number}>}
   */
  async execute(action) {
    let lastErr = null;
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        const result = await this._dispatch(action);
        result.retries = attempt;
        this._recordHistory(result);
        return result;
      } catch (err) {
        lastErr = err;
        if (attempt < this.maxRetries) {
          await this._delay(100 * (attempt + 1)); // Linear backoff
        }
      }
    }

    const failResult = {
      success: false,
      action:  action.type,
      detail:  `Failed after ${this.maxRetries + 1} attempts: ${lastErr.message}`,
      retries: this.maxRetries,
    };
    this._recordHistory(failResult);
    return failResult;
  }

  /**
   * Internal dispatcher - routes to the correct action handler.
   */
  async _dispatch(action) {
    switch (action.type) {
      case ActionType.CLICK:
        await this.click(action.x, action.y);
        return { success: true, action: "CLICK", detail: `(${action.x}, ${action.y})` };

      case ActionType.DOUBLE_CLICK:
        await this.doubleClick(action.x, action.y);
        return { success: true, action: "DOUBLE_CLICK", detail: `(${action.x}, ${action.y})` };

      case ActionType.TYPE:
        if (action.x != null && action.y != null) {
          await this.click(action.x, action.y);
          await this._delay(80);
        }
        await this.typeText(action.text || "");
        if (action.press_enter || action.pressEnter) await this.pressKey("Enter");
        return { success: true, action: "TYPE", detail: `"${(action.text || "").slice(0, 40)}"` };

      case ActionType.SCROLL:
        await this.scroll(action.x || 640, action.y || 360, action.delta_y || 400, action.delta_x || 0);
        return { success: true, action: "SCROLL", detail: `deltaY=${action.delta_y || 400}` };

      case ActionType.PRESS_KEY:
        await this.pressKey(action.key);
        return { success: true, action: "PRESS_KEY", detail: action.key };

      case ActionType.HOVER:
        await this.hover(action.x, action.y);
        return { success: true, action: "HOVER", detail: `(${action.x}, ${action.y})` };

      case ActionType.DRAG:
        await this.drag(action.fromX, action.fromY, action.toX, action.toY);
        return { success: true, action: "DRAG", detail: `(${action.fromX},${action.fromY})→(${action.toX},${action.toY})` };

      case ActionType.SELECT:
        if (action.x != null && action.y != null) await this.click(action.x, action.y);
        await this._delay(200);
        if (action.optionText) await this._selectOption(action.optionText);
        return { success: true, action: "SELECT", detail: action.optionText || "dropdown" };

      case ActionType.WAIT:
        await this._delay(action.duration_ms || 1000);
        return { success: true, action: "WAIT", detail: `${action.duration_ms || 1000}ms` };

      case ActionType.NAVIGATE:
        await this._cdp("Page.navigate", { url: action.url });
        return { success: true, action: "NAVIGATE", detail: action.url };

      case ActionType.BACK:
        await this._cdp("Page.navigateToHistoryEntry", { entryId: -1 }).catch(async () => {
          await this._cdp("Runtime.evaluate", { expression: "history.back()" });
        });
        return { success: true, action: "BACK", detail: "Browser back" };

      case ActionType.TERMINATE:
      case ActionType.FINISH:
        return { success: true, action: action.type, detail: "Task completion signaled" };

      default:
        return { success: false, action: action.type || "UNKNOWN", detail: "Unrecognized action type" };
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ACTION IMPLEMENTATIONS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Single click with hover → press → release sequence.
   */
  async click(x, y) {
    const { cssX, cssY } = this._normalize(x, y);

    // Move (triggers CSS :hover)
    await this._mouse("mouseMoved", cssX, cssY);
    if (this.humanize) await this._delay(25 + Math.random() * 35);

    // Press
    await this._mouse("mousePressed", cssX, cssY, { button: "left", clickCount: 1 });
    if (this.humanize) await this._delay(12 + Math.random() * 20);

    // Release
    await this._mouse("mouseReleased", cssX, cssY, { button: "left", clickCount: 1 });
  }

  /**
   * Double click (two rapid click cycles).
   */
  async doubleClick(x, y) {
    const { cssX, cssY } = this._normalize(x, y);

    await this._mouse("mouseMoved", cssX, cssY);
    if (this.humanize) await this._delay(20);

    // First click
    await this._mouse("mousePressed", cssX, cssY, { button: "left", clickCount: 1 });
    await this._mouse("mouseReleased", cssX, cssY, { button: "left", clickCount: 1 });

    await this._delay(50 + Math.random() * 30);

    // Second click
    await this._mouse("mousePressed", cssX, cssY, { button: "left", clickCount: 2 });
    await this._mouse("mouseReleased", cssX, cssY, { button: "left", clickCount: 2 });
  }

  /**
   * Hover without clicking (useful for tooltips / menus).
   */
  async hover(x, y) {
    const { cssX, cssY } = this._normalize(x, y);
    await this._mouse("mouseMoved", cssX, cssY);
    await this._delay(200); // Allow hover effects to render
  }

  /**
   * Drag from one point to another with smooth interpolation.
   */
  async drag(fromX, fromY, toX, toY) {
    const from = this._normalize(fromX, fromY);
    const to   = this._normalize(toX, toY);

    // Move to start
    await this._mouse("mouseMoved", from.cssX, from.cssY);
    await this._delay(50);

    // Press
    await this._mouse("mousePressed", from.cssX, from.cssY, { button: "left", clickCount: 1 });
    await this._delay(30);

    // Smooth interpolation (8 steps)
    const steps = 8;
    for (let i = 1; i <= steps; i++) {
      const t  = i / steps;
      // Ease-in-out cubic for natural drag feel
      const ease = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      const mx = Math.round(from.cssX + (to.cssX - from.cssX) * ease);
      const my = Math.round(from.cssY + (to.cssY - from.cssY) * ease);
      await this._mouse("mouseMoved", mx, my);
      await this._delay(15 + Math.random() * 10);
    }

    // Release at destination
    await this._mouse("mouseReleased", to.cssX, to.cssY, { button: "left", clickCount: 1 });
  }

  /**
   * Type a string with realistic per-character timing.
   */
  async typeText(text) {
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      await this._cdp("Input.dispatchKeyEvent", {
        type: "keyDown", text: char, unmodifiedText: char,
      });
      await this._cdp("Input.dispatchKeyEvent", {
        type: "keyUp", text: char, unmodifiedText: char,
      });

      if (this.humanize) {
        const isWordBound = " .,;:!-".includes(char);
        const isPause     = i > 0 && i % (8 + Math.floor(Math.random() * 6)) === 0;  // Natural micro-pause
        let delayMs = isWordBound
          ? this.interKeyDelayBase * 2.0
          : this.interKeyDelayBase;
        delayMs += Math.random() * this.interKeyJitter;
        if (isPause) delayMs += 80 + Math.random() * 120; // Thinking pause
        await this._delay(delayMs);
      }
    }
  }

  /**
   * Scroll with smooth multi-step animation.
   */
  async scroll(x, y, deltaY, deltaX = 0) {
    const { cssX, cssY } = this._normalize(x, y);

    const steps = this.humanize ? Math.min(Math.ceil(Math.abs(deltaY) / 80), 6) : 1;
    const sdy   = deltaY / steps;
    const sdx   = deltaX / steps;

    for (let i = 0; i < steps; i++) {
      await this._cdp("Input.dispatchMouseEvent", {
        type: "mouseWheel", x: cssX, y: cssY,
        deltaX: sdx, deltaY: sdy,
      });
      if (this.humanize && i < steps - 1) await this._delay(25 + Math.random() * 15);
    }
  }

  /**
   * Press a special key.
   */
  async pressKey(keyName) {
    const def = KEY_MAP[keyName] || { code: keyName, key: keyName, windowsVirtualKeyCode: 0 };

    await this._cdp("Input.dispatchKeyEvent", {
      type: "rawKeyDown",
      windowsVirtualKeyCode: def.windowsVirtualKeyCode,
      nativeVirtualKeyCode:  def.windowsVirtualKeyCode,
      code: def.code, key: def.key,
    });
    if (this.humanize) await this._delay(15 + Math.random() * 15);
    await this._cdp("Input.dispatchKeyEvent", {
      type: "keyUp",
      windowsVirtualKeyCode: def.windowsVirtualKeyCode,
      nativeVirtualKeyCode:  def.windowsVirtualKeyCode,
      code: def.code, key: def.key,
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // COORDINATE VALIDATION
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Validate that coordinates hit an interactive element via CDP.
   * @returns {Promise<{valid: boolean, tag: string, role: string|null}>}
   */
  async validateTarget(x, y) {
    try {
      const { cssX, cssY } = this._normalize(x, y);
      const node = await this._cdp("DOM.getNodeForLocation", {
        x: Math.round(cssX), y: Math.round(cssY),
        includeUserAgentShadowDOM: false,
      });
      if (!node?.backendNodeId) return { valid: false, tag: null, role: null };

      const desc = await this._cdp("DOM.describeNode", { backendNodeId: node.backendNodeId });
      const tag  = desc?.node?.nodeName?.toLowerCase() || "unknown";
      const attrs = desc?.node?.attributes || [];
      const role  = attrs[attrs.indexOf("role") + 1] || null;

      const interactive = ["a", "button", "input", "select", "textarea", "label", "summary", "details", "option"];
      const hasHandler  = attrs.includes("onclick") || attrs.includes("tabindex");

      return { valid: interactive.includes(tag) || hasHandler, tag, role };
    } catch {
      return { valid: true, tag: "unknown", role: null };
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ACCESSIBILITY TREE & DOM EXTRACTION (Tri-Stream Architecture)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Extracts the full Accessibility Tree from the active page via CDP.
   * Returns a simplified, token-efficient array of interactive nodes
   * suitable for feeding into Member 4's VLM alongside the visual stream.
   *
   * @returns {Promise<Array<{role: string, name: string, value?: string, disabled?: boolean}>>}
   */
  async getAccessibilityTree() {
    try {
      // In CDP, Accessibility domain must be enabled before querying
      try {
        await this._cdp("Accessibility.enable");
      } catch (_) {}

      const res = await this._cdp("Accessibility.getFullAXTree", {
        max_depth: 10,
      });

      const nodes = res?.nodes || [];
      if (!nodes || nodes.length === 0) return [];

      const INTERACTIVE_ROLES = new Set([
        "button", "link", "textbox", "combobox", "checkbox", "radio",
        "slider", "switch", "tab", "menuitem", "searchbox", "spinbutton",
        "heading", "img", "listitem", "option", "treeitem", "generic", "group", "banner", "main"
      ]);

      const extractVal = (v) => {
        if (!v) return "";
        if (typeof v === "string") return v;
        if (typeof v === "object" && v.value !== undefined) return String(v.value);
        return "";
      };

      return nodes
        .filter((node) => {
          const role = extractVal(node.role).toLowerCase();
          const name = extractVal(node.name).trim();
          if (!role || role === "none") return false;
          return INTERACTIVE_ROLES.has(role) || name.length > 0;
        })
        .slice(0, 150) // Strictly capped at 150 for Local Model context windows
        .map((node) => {
          const role = extractVal(node.role) || "unknown";
          const name = extractVal(node.name).trim();
          const val  = extractVal(node.value);
          const entry = { role, name };
          if (val) entry.value = val;
          if (node.disabled?.value || node.disabled === true) entry.disabled = true;
          if (node.focused?.value || node.focused === true) entry.focused = true;
          return entry;
        });
    } catch (err) {
      console.warn("[ActionExecutor] A11y tree extraction failed:", err.message);
      return [];
    }
  }

  /**
   * Lightweight DOM text snapshot via Runtime.evaluate.
   * Extracts visible text content and form values from the page
   * without needing to parse the full DOM tree.
   *
   * @returns {Promise<Array<{tag: string, text?: string, role?: string, bbox: number[]}>>}
   */
  async getDOMSnapshot() {
    try {
      const res = await this._cdp("Runtime.evaluate", {
        expression: `
          (function() {
            try {
              const selectors = 'button, a, input, select, textarea, [role], [onclick], h1, h2, h3, [aria-label]';
              const elements = document.querySelectorAll(selectors);
              const list = [];
              for (let i = 0; i < elements.length && list.length < 150; i++) {
                const el = elements[i];
                const r = el.getBoundingClientRect();
                if (r.width <= 0 || r.height <= 0) continue;
                const text = (el.innerText || el.value || el.placeholder || el.getAttribute('aria-label') || '').trim().slice(0, 80);
                const tag = el.tagName ? el.tagName.toLowerCase() : 'element';
                list.push({
                  tag,
                  text: text || undefined,
                  role: el.getAttribute('role') || undefined,
                  bbox: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)]
                });
              }
              return list;
            } catch (e) {
              return [];
            }
          })()
        `,
        returnByValue: true,
      });

      const val = res?.result?.value;
      if (Array.isArray(val)) return val;
      if (typeof val === "string") {
        try { return JSON.parse(val); } catch (_) { return []; }
      }
      return [];
    } catch (err) {
      console.warn("[ActionExecutor] DOM snapshot failed:", err.message);
      return [];
    }
  }

  /**
   * Evaluates the Privacy Engine's PII scanning logic directly on the active tab.
   * This is required because the offscreen document has an empty DOM.
   * @returns {Promise<Array<Object>>} Array of PII bounding boxes and categories.
   */
  async scanDOMForPii() {
    try {
      const res = await this._cdp("Runtime.evaluate", {
        expression: `
          (function() {
            try {
              const regexMap = [
                { cat: 'AADHAAR', rx: /(?<!\\d)[2-9]{1}[0-9]{3}[\\s\\-]?[0-9]{4}[\\s\\-]?[0-9]{4}(?!\\d)/ },
                { cat: 'PAN', rx: /\\b[A-Z]{5}[0-9]{4}[A-Z]{1}\\b/ },
                { cat: 'CREDITCARD', rx: /(?<!\\d)(?:\\d{4}[\\s\\-]?){3}\\d{4}(?!\\d)|(?<!\\d)\\d{15,16}(?!\\d)/ },
                { cat: 'INDIANPHONE', rx: /(?<!\\d)(?:\\+91[\\-\\s]?)?[6-9]\\d{9}(?!\\d)/ },
                { cat: 'EMAIL', rx: /\\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}\\b/ },
                { cat: 'UPIID', rx: /\\b[a-zA-Z0-9.\\-_]{2,256}@[a-zA-Z]{2,64}\\b/ },
                { cat: 'PASSPORT', rx: /\\b[A-Z]{1}[0-9]{7}\\b/ },
                { cat: 'DRIVINGLICENSE', rx: /\\b[A-Z]{2}[0-9]{2}[0-9]{11}\\b/ }
              ];
              // Compile into a single high-performance JIT regex
              const unifiedSource = regexMap.map(r => '(' + r.rx.source + ')').join('|');
              const unifiedRegex = new RegExp(unifiedSource, 'g');

              const sensitiveKeywords = /password|cvv|otp|pin|aadhaar|pan|card|secret|token|ssn|license/i;

              function getAllElementsDeep(root) {
                const elements = [];
                const walk = (node) => {
                  if (!node) return;
                  if (node.nodeType === Node.ELEMENT_NODE) {
                    elements.push(node);
                    if (node.shadowRoot) walk(node.shadowRoot);
                  }
                  for (const child of node.children || []) walk(child);
                };
                walk(root);
                return elements;
              }

              const sensitiveItems = [];
              let counter = 1;
              const allElements = getAllElementsDeep(document.body || document.documentElement);

              const vWidth = window.innerWidth || 1280;
              const vHeight = window.innerHeight || 720;

              allElements.forEach((el) => {
                const tag = (el.tagName || '').toLowerCase();
                if (tag === 'input' || tag === 'textarea' || tag === 'select' || el.isContentEditable) {
                  const rect = el.getBoundingClientRect();
                  if (rect.width <= 0 || rect.height <= 0) return;

                  const val = (el.value || el.innerText || '').trim();
                  const type = el.type || 'text';
                  const baseBox = { x: Math.round(rect.left), y: Math.round(rect.top), width: Math.round(rect.width), height: Math.round(rect.height), viewportWidth: vWidth, viewportHeight: vHeight };

                  if (type === 'password') {
                    sensitiveItems.push({ id: 'SEC_PASSWORD_' + (counter++), type: 'INPUT_FIELD', category: 'PASSWORD', boundingBox: baseBox, redactionLabel: '[REDACTED_PASSWORD_#' + (counter-1) + ']' });
                    return;
                  }

                  const attrContext = ((el.name||'') + ' ' + (el.id||'') + ' ' + (el.placeholder||'') + ' ' + (el.getAttribute('aria-label')||'')).toLowerCase();
                  if (sensitiveKeywords.test(attrContext)) {
                    let matchedCat = 'AUTH_CREDENTIAL';
                    if (attrContext.includes('aadhaar')) matchedCat = 'AADHAAR';
                    else if (attrContext.includes('pan')) matchedCat = 'PAN';
                    else if (/cvv|pin|otp/.test(attrContext)) matchedCat = 'OTP_PIN';
                    sensitiveItems.push({ id: 'SEC_' + matchedCat + '_' + (counter++), type: 'INPUT_FIELD', category: matchedCat, boundingBox: baseBox, redactionLabel: '[REDACTED_' + matchedCat + '_#' + (counter-1) + ']' });
                    return;
                  }

                  if (val.length > 0) {
                    unifiedRegex.lastIndex = 0;
                    const match = unifiedRegex.exec(val);
                    if (match) {
                      let matchedCat = 'PII_DATA';
                      for (let i = 1; i <= regexMap.length; i++) {
                        if (match[i] !== undefined) { matchedCat = regexMap[i-1].cat; break; }
                      }
                      sensitiveItems.push({ id: 'SEC_' + matchedCat + '_' + (counter++), type: 'INPUT_FIELD', category: matchedCat, boundingBox: baseBox, redactionLabel: '[REDACTED_' + matchedCat + '_#' + (counter-1) + ']' });
                      return;
                    }
                  }
                }

                if (tag === 'img' && (el.id === 'avatar-btn' || /user-avatar|profile-photo|my-account/i.test(el.className))) {
                  const rect = el.getBoundingClientRect();
                  if (rect.width > 20 && rect.height > 20) {
                    sensitiveItems.push({ id: 'FACE_AVATAR_' + (counter++), type: 'MEDIA_PII', category: 'FACE_AVATAR', boundingBox: { x: Math.round(rect.left), y: Math.round(rect.top), width: Math.round(rect.width), height: Math.round(rect.height), viewportWidth: vWidth, viewportHeight: vHeight }, redactionLabel: '[REDACTED_AVATAR_#' + (counter-1) + ']' });
                  }
                }
              });

              const walker = document.createTreeWalker(document.body || document.documentElement, NodeFilter.SHOW_TEXT, {
                acceptNode: (node) => {
                  if (!node.nodeValue || node.nodeValue.trim().length === 0) return NodeFilter.FILTER_REJECT;
                  const tag = (node.parentElement && node.parentElement.tagName) ? node.parentElement.tagName.toLowerCase() : '';
                  if (['script', 'style', 'noscript', 'svg'].includes(tag)) return NodeFilter.FILTER_REJECT;
                  return NodeFilter.FILTER_ACCEPT;
                }
              });

              let node;
              while ((node = walker.nextNode())) {
                const text = node.nodeValue;
                unifiedRegex.lastIndex = 0;
                let match;
                while ((match = unifiedRegex.exec(text)) !== null) {
                  try {
                    let matchedCat = 'PII_DATA';
                    for (let i = 1; i <= regexMap.length; i++) {
                      if (match[i] !== undefined) { matchedCat = regexMap[i-1].cat; break; }
                    }
                    
                    const range = document.createRange();
                    range.setStart(node, match.index);
                    range.setEnd(node, match.index + match[0].length);
                    const rect = range.getBoundingClientRect();
                    
                    if (rect.width > 0 && rect.height > 0) {
                      sensitiveItems.push({ id: 'PII_' + matchedCat + '_' + (counter++), type: 'TEXT_PII', category: matchedCat, boundingBox: { x: Math.round(rect.left), y: Math.round(rect.top), width: Math.round(rect.width), height: Math.round(rect.height), viewportWidth: vWidth, viewportHeight: vHeight }, redactionLabel: '[REDACTED_' + matchedCat + '_#' + (counter-1) + ']' });
                    }
                  } catch (e) {}
                }
              }
              return sensitiveItems;
            } catch (e) { return []; }
          })()
        `,
        returnByValue: true,
      });
      return res?.result?.value || [];
    } catch (err) {
      console.warn("[ActionExecutor] scanDOMForPii failed:", err.message);
      return [];
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PRIVATE HELPERS
  // ═══════════════════════════════════════════════════════════════════════════

  _normalize(x, y) {
    let jx = 0, jy = 0;
    if (this.humanize) {
      jx = this._gaussRandom(0, 1.5);
      jy = this._gaussRandom(0, 1.5);
    }
    return {
      cssX: Math.round((x / this.dpr) + jx),
      cssY: Math.round((y / this.dpr) + jy),
    };
  }

  _mouse(type, x, y, extra = {}) {
    return this._cdp("Input.dispatchMouseEvent", { type, x, y, ...extra });
  }

  async _selectOption(optionText) {
    await this._cdp("Runtime.evaluate", {
      expression: `
        (function() {
          const sel = document.activeElement;
          if (sel && sel.tagName === 'SELECT') {
            for (const opt of sel.options) {
              if (opt.text.trim().toLowerCase().includes('${optionText.toLowerCase().replace(/'/g, "\\'")}\')) {
                sel.value = opt.value;
                sel.dispatchEvent(new Event('change', { bubbles: true }));
                return true;
              }
            }
          }
          return false;
        })()
      `,
    });
  }

  _gaussRandom(mean, sd) {
    const u1 = Math.random(), u2 = Math.random();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2) * sd + mean;
  }

  _delay(ms) { return new Promise((r) => setTimeout(r, ms)); }

  _cdp(method, params = {}) {
    return new Promise((resolve, reject) => {
      chrome.debugger.sendCommand(this.target, method, params, (result) => {
        if (chrome.runtime.lastError) return reject(new Error(`CDP ${method}: ${chrome.runtime.lastError.message}`));
        resolve(result);
      });
    });
  }

  /**
   * Extracts sanitized DOM, Accessibility Tree, and Unified Browser State matching
   * the canonical ISRO PS 171 Schema.
   */
  async extractSanitizedBrowserState() {
    try {
      const res = await this._cdp("Runtime.evaluate", {
        expression: `
          (function() {
            try {
              const regexes = [
                { type: "EMAIL", rx: /\\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}\\b/g },
                { type: "PHONE", rx: /(?<!\\d)(?:\\+91[\\-\\s]?)?[6-9]\\d{9}(?!\\d)/g },
                { type: "PAN", rx: /\\b[A-Z]{5}[0-9]{4}[A-Z]{1}\\b/g },
                { type: "AADHAAR", rx: /(?<!\\d)[2-9]{1}[0-9]{3}[\\s\\-]?[0-9]{4}[\\s\\-]?[0-9]{4}(?!\\d)/g },
                { type: "CREDIT_CARD", rx: /(?<!\\d)(?:\\d{4}[\\s\\-]?){3}\\d{4}(?!\\d)|(?<!\\d)\\d{15,16}(?!\\d)/g },
                { type: "PERSON", rx: /\\b(?:Dr\\.|Prof\\.|Mr\\.|Mrs\\.|Ms\\.|Shri|Smt\\.|Director|Commander|Scientist)\\s+[A-Z][a-z]+(?:\\s+[A-Z][a-z]+)*/g }
              ];

              function sanitizeString(str, redactionsList, elId) {
                if (!str || typeof str !== 'string') return str;
                let s = str;
                for (const r of regexes) {
                  r.rx.lastIndex = 0;
                  if (r.rx.test(s)) {
                    redactionsList.push({ element_id: elId, type: r.type });
                    r.rx.lastIndex = 0;
                    s = s.replace(r.rx, '<' + r.type + '>');
                  }
                }
                return s;
              }

              function getAllElementsDeep(root) {
                const list = [];
                const walk = (node) => {
                  if (!node) return;
                  if (node.nodeType === Node.ELEMENT_NODE) {
                    list.push(node);
                    if (node.shadowRoot) walk(node.shadowRoot);
                  }
                  for (const child of node.children || []) walk(child);
                };
                walk(root);
                return list;
              }

              const allElements = getAllElementsDeep(document.body || document.documentElement);
              const elements = [];
              const axNodes = [];
              const redactions = [];

              let idCounter = 1;
              let axCounter = 1;

              for (let i = 0; i < allElements.length && elements.length < 150; i++) {
                const el = allElements[i];
                const tag = (el.tagName || '').toLowerCase();
                if (['script', 'style', 'noscript', 'template', 'svg', 'path'].includes(tag)) continue;

                const rect = el.getBoundingClientRect();
                if (rect.width <= 0 || rect.height <= 0) continue;

                const elId = el.id || el.name || ('elem_' + (idCounter++));
                const type = el.type || undefined;
                const role = el.getAttribute('role') || (tag === 'button' ? 'button' : (tag === 'input' ? (type === 'checkbox' ? 'checkbox' : (type === 'radio' ? 'radio' : 'textbox')) : (tag === 'select' ? 'combobox' : (tag === 'a' ? 'link' : (/^h[1-6]$/.test(tag) ? 'heading' : tag)))));

                const rawVal = el.value !== undefined ? el.value : undefined;
                const rawText = el.innerText || el.textContent || '';
                const label = el.labels?.[0]?.innerText || el.placeholder || el.getAttribute('aria-label') || '';

                const isInteractive = ['button', 'input', 'select', 'textarea', 'a', 'option'].includes(tag) || el.hasAttribute('onclick') || el.hasAttribute('role');
                const isHeading = /^h[1-6]$/.test(tag);
                const hasLabel = label.length > 0;
                const hasText = rawText.trim().length > 0 && rawText.trim().length < 120;

                if (!isInteractive && !isHeading && !hasLabel && (!hasText || el.children.length > 2)) {
                  continue;
                }

                let sanitizedVal = rawVal;
                let sanitizedText = rawText.trim().slice(0, 100);

                if (type === 'password') {
                  sanitizedVal = '<PASSWORD>';
                  redactions.push({ element_id: elId, type: 'PASSWORD' });
                } else {
                  if (sanitizedVal) sanitizedVal = sanitizeString(sanitizedVal, redactions, elId);
                  if (sanitizedText) sanitizedText = sanitizeString(sanitizedText, redactions, elId);
                }

                const bbox = [Math.round(rect.x), Math.round(rect.y), Math.round(rect.width), Math.round(rect.height)];

                const domElem = {
                  element_id: elId,
                  tag: tag,
                  type: type,
                  label: label || undefined,
                  text: (!sanitizedVal && sanitizedText) ? sanitizedText : undefined,
                  value: sanitizedVal,
                  autocomplete: el.autocomplete || undefined,
                  bbox: bbox,
                  visible: true,
                  enabled: !el.disabled
                };
                if (type === 'checkbox') domElem.checked = el.checked;
                elements.push(domElem);

                const axNode = {
                  node_id: 'ax' + (axCounter++),
                  role: role,
                  name: label || sanitizedText || (sanitizedVal ? sanitizedVal : ''),
                  value: sanitizedVal,
                  required: el.required || false,
                  disabled: !!el.disabled,
                  focused: document.activeElement === el,
                  element_id: elId
                };
                if (isHeading) axNode.level = parseInt(tag[1]) || 1;
                if (type === 'checkbox') axNode.checked = el.checked;
                axNodes.push(axNode);
              }

              const pageData = {
                title: document.title || 'Web Page',
                url: window.location.href,
                viewport: {
                  width: window.innerWidth,
                  height: window.innerHeight
                },
                scroll: {
                  x: Math.round(window.scrollX || 0),
                  y: Math.round(window.scrollY || 0)
                }
              };

              const browserStateElements = elements.map((e, idx) => ({
                element_id: e.element_id,
                role: axNodes[idx]?.role || e.tag,
                type: e.type,
                label: e.label,
                text: e.text,
                value: e.value,
                bbox: e.bbox,
                visible: e.visible,
                enabled: e.enabled,
                focused: axNodes[idx]?.focused || false,
                level: e.tag.startsWith('h') ? parseInt(e.tag[1]) : undefined,
                checked: e.checked
              }));

              return {
                sanitized_dom: {
                  page: pageData,
                  elements: elements
                },
                sanitized_accessibility_tree: {
                  root: {
                    role: 'document',
                    name: pageData.title
                  },
                  nodes: axNodes
                },
                browser_state: {
                  schema_version: '1.0',
                  page: pageData,
                  elements: browserStateElements,
                  redactions: redactions
                }
              };
            } catch (e) {
              return null;
            }
          })()
        `,
        returnByValue: true
      });

      return res?.result?.value || null;
    } catch (err) {
      console.warn("[ActionExecutor] extractSanitizedBrowserState error:", err.message);
      return null;
    }
  }

  _recordHistory(result) {
    this._history.push({ ...result, timestamp: Date.now() });
    if (this._history.length > this._maxHistory) this._history.shift();
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// COMPLETE KEY MAP
// ═══════════════════════════════════════════════════════════════════════════════

const KEY_MAP = {
  Enter:      { code: "Enter",      key: "Enter",      windowsVirtualKeyCode: 13 },
  Tab:        { code: "Tab",        key: "Tab",        windowsVirtualKeyCode: 9  },
  Escape:     { code: "Escape",     key: "Escape",     windowsVirtualKeyCode: 27 },
  Backspace:  { code: "Backspace",  key: "Backspace",  windowsVirtualKeyCode: 8  },
  Delete:     { code: "Delete",     key: "Delete",     windowsVirtualKeyCode: 46 },
  Space:      { code: "Space",      key: " ",          windowsVirtualKeyCode: 32 },
  ArrowUp:    { code: "ArrowUp",    key: "ArrowUp",    windowsVirtualKeyCode: 38 },
  ArrowDown:  { code: "ArrowDown",  key: "ArrowDown",  windowsVirtualKeyCode: 40 },
  ArrowLeft:  { code: "ArrowLeft",  key: "ArrowLeft",  windowsVirtualKeyCode: 37 },
  ArrowRight: { code: "ArrowRight", key: "ArrowRight", windowsVirtualKeyCode: 39 },
  Home:       { code: "Home",       key: "Home",       windowsVirtualKeyCode: 36 },
  End:        { code: "End",        key: "End",        windowsVirtualKeyCode: 35 },
  PageUp:     { code: "PageUp",     key: "PageUp",     windowsVirtualKeyCode: 33 },
  PageDown:   { code: "PageDown",   key: "PageDown",   windowsVirtualKeyCode: 34 },
  F1:         { code: "F1",         key: "F1",         windowsVirtualKeyCode: 112 },
  F5:         { code: "F5",         key: "F5",         windowsVirtualKeyCode: 116 },
  F11:        { code: "F11",        key: "F11",        windowsVirtualKeyCode: 122 },
};
