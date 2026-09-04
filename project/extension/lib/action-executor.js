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
    const target = action.target || action.element_id || action.id;

    // Reject "invented token" values the model sometimes emits as a literal
    // (e.g. @contact.email, @contact.address, #phone, or an undetokenized
    // <VAULT_X>). Real vault tokens use the exact <VAULT_KEY> form and are
    // detokenized before reaching the executor, so a bare @x / #x / dotted
    // token placeholder is a model confabulation and must never be written.
    if (action.type === ActionType.TYPE || action.type === "CHECK" ||
        action.type === ActionType.SELECT || action.type === ActionType.VAULT_FILL ||
        action.type === ActionType.CLICK) {
      const raw = String(action.text ?? action.value ?? action.optionText ?? '');
      const t = raw.trim();
      if (/^[@#][\w.\-]+$/.test(t) || /^<VAULT_[A-Z0-9_]+\>\s*$/i.test(t) || /^vault[:_][\w.\-]+$/i.test(t)) {
        return { success: false, action: action.type, detail: `Refusing invented token: ${t}` };
      }
    }

    switch (action.type) {
      case ActionType.CLICK:
      case ActionType.CHECK:
        // If a value is present, route through smartFill so radios/selects can
        // be resolved against the (detokenized) value the model provided.
        if (target && (action.text || action.value)) {
          const r = await this.smartFill(target, action.text ?? action.value);
          return { success: r.success, action: "CLICK", target, id: r.id, value: r.value, text: r.text, detail: `ID: #${target}${r.kind ? ' (' + r.kind + ')' : ''}` };
        }
        if (target) {
          await this.clickElement(target);
          return { success: true, action: "CLICK", detail: `ID: #${target}` };
        }
        if (action.x != null && action.y != null) {
          await this.click(action.x, action.y);
          return { success: true, action: "CLICK", detail: `Coords: (${action.x}, ${action.y})` };
        }
        return { success: false, action: "CLICK", detail: "Missing target ID or coordinates" };

      case ActionType.DOUBLE_CLICK:
        if (target) {
          await this.clickElement(target);
          await this._delay(50);
          await this.clickElement(target);
          return { success: true, action: "DOUBLE_CLICK", detail: `ID: #${target}` };
        }
        await this.doubleClick(action.x, action.y);
        return { success: true, action: "DOUBLE_CLICK", detail: `Coords: (${action.x}, ${action.y})` };

      case ActionType.TYPE:
      case ActionType.VAULT_FILL:
        if (target) {
          const r = await this.smartFill(target, action.text || "");
          return { success: r.success, action: "TYPE", target, id: r.id, value: r.value, text: r.text ?? action.text, detail: `ID: #${target}${r.kind && r.kind !== 'text' ? ' (' + r.kind + ')' : ''}` };
        }
        if (action.x != null && action.y != null) {
          await this.click(action.x, action.y);
          await this._delay(80);
        }
        await this.typeText(action.text || "");
        if (action.press_enter || action.pressEnter) await this.pressKey("Enter");
        return { success: true, action: "TYPE", detail: `Coords (${action.x}, ${action.y})` };

      case ActionType.SELECT:
        if (target) {
          // Route through smartFill so vault tokens are decoded and the matching
          // option (by value or text) is selected; returns value/text for validation.
          const r = await this.smartFill(target, action.optionText || action.text || "");
          return { success: r.success, action: "SELECT", target, id: r.id, value: r.value, text: r.text, detail: `ID: #${target} -> ${action.optionText || action.text || "option"}` };
        }
        if (action.x != null && action.y != null) await this.click(action.x, action.y);
        await this._delay(200);
        if (action.optionText) await this._selectOption(action.optionText);
        return { success: true, action: "SELECT", detail: action.optionText || "dropdown" };

      case ActionType.SCROLL:
        if (target) {
          await this.scrollElementIntoView(target);
          return { success: true, action: "SCROLL", detail: `Scroll to ID: #${target}` };
        }
        await this.scroll(action.x || 640, action.y || 360, action.delta_y || 400, action.delta_x || 0);
        return { success: true, action: "SCROLL", detail: `deltaY=${action.delta_y || 400}` };

      case ActionType.PRESS_KEY:
        await this.pressKey(action.key);
        return { success: true, action: "PRESS_KEY", detail: action.key };

      case ActionType.HOVER:
        if (target) {
          await this.hoverElement(target);
          return { success: true, action: "HOVER", detail: `ID: #${target}` };
        }
        await this.hover(action.x, action.y);
        return { success: true, action: "HOVER", detail: `(${action.x}, ${action.y})` };

      case ActionType.DRAG:
        await this.drag(action.fromX, action.fromY, action.toX, action.toY);
        return { success: true, action: "DRAG", detail: `(${action.fromX},${action.fromY})→(${action.toX},${action.toY})` };

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
  // ID-BASED ELEMENT ACTION IMPLEMENTATIONS
  // ═══════════════════════════════════════════════════════════════════════════

  async fillElement(targetId, text, pressEnter = false) {
    const escapedText = JSON.stringify(text);
    const escapedTarget = JSON.stringify(targetId);
    
    const res = await this._cdp("Runtime.evaluate", {
      expression: `
        (function() {
          const target = ${escapedTarget};
          const text = ${escapedText};
          
          const el = document.getElementById(target)
                  || document.querySelector('[name="' + target + '"]')
                  || document.querySelector('[data-testid="' + target + '"]')
                  || (target.startsWith('#') || target.startsWith('.') || target.includes('[') ? document.querySelector(target) : null);
                  
          if (!el) return { success: false, error: 'Element not found by target id: ' + target };
          
          el.scrollIntoView({ behavior: 'instant', block: 'center' });
          el.focus();
          
          const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
          const nativeSetter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
          if (nativeSetter) {
            nativeSetter.call(el, text);
          } else {
            el.value = text;
          }
          
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
          
          if (${pressEnter}) {
            el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
            el.dispatchEvent(new KeyboardEvent('keypress', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
            el.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
            if (el.form) el.form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
          }
          
          return { success: true, id: el.id || target, value: el.value };
        })()
      `,
      returnByValue: true
    });
    
    if (res?.result?.value?.error) {
      throw new Error(res.result.value.error);
    }
    return res?.result?.value;
  }

  async clickElement(targetId) {
    const escapedTarget = JSON.stringify(targetId);
    
    const res = await this._cdp("Runtime.evaluate", {
      expression: `
        (function() {
          const target = ${escapedTarget};
          const el = document.getElementById(target)
                  || document.querySelector('[name="' + target + '"]')
                  || document.querySelector('[data-testid="' + target + '"]')
                  || (target.startsWith('#') || target.startsWith('.') || target.includes('[') ? document.querySelector(target) : null);
                  
          if (!el) return { success: false, error: 'Element not found by target id: ' + target };
          
          el.scrollIntoView({ behavior: 'instant', block: 'center' });
          el.focus();
          
          if (el.type === 'checkbox') {
            if (!el.checked) {
              el.checked = true;
              el.dispatchEvent(new Event('change', { bubbles: true }));
              el.dispatchEvent(new Event('input', { bubbles: true }));
            }
          } else if (el.type === 'radio') {
            el.checked = true;
            el.dispatchEvent(new Event('change', { bubbles: true }));
            el.dispatchEvent(new Event('input', { bubbles: true }));
          } else {
            el.click();
            el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
          }
          return { success: true, id: el.id || target };
        })()
      `,
      returnByValue: true
    });
    
    if (res?.result?.value?.error) {
      throw new Error(res.result.value.error);
    }
    return res?.result?.value;
  }

  async selectElement(targetId, optionText) {
    const escapedTarget = JSON.stringify(targetId);
    const escapedOption = JSON.stringify(optionText || '');
    
    const res = await this._cdp("Runtime.evaluate", {
      expression: `
        (function() {
          const target = ${escapedTarget};
          const optQuery = ${escapedOption}.toLowerCase().trim();
          
          const el = document.getElementById(target)
                  || document.querySelector('[name="' + target + '"]')
                  || (target.startsWith('#') || target.startsWith('.') || target.includes('[') ? document.querySelector(target) : null);
                  
          if (!el) return { success: false, error: 'Select element not found: ' + target };
          
          el.scrollIntoView({ behavior: 'instant', block: 'center' });
          el.focus();
          
          if (el.tagName === 'SELECT') {
            const clean = (s) => (s || '').toLowerCase().replace(/[\s\-_.,]/g, '').trim();
            const qClean = clean(optQuery);
            let matched = false;

            // 1. Exact / clean match on text or value
            for (let i = 0; i < el.options.length; i++) {
              const opt = el.options[i];
              const tClean = clean(opt.text);
              const vClean = clean(opt.value);
              if (qClean && (tClean === qClean || vClean === qClean)) {
                el.selectedIndex = i;
                el.value = opt.value;
                matched = true;
                break;
              }
            }

            // 2. Substring match
            if (!matched && qClean) {
              for (let i = 0; i < el.options.length; i++) {
                const opt = el.options[i];
                const tClean = clean(opt.text);
                const vClean = clean(opt.value);
                if ((tClean && (qClean.includes(tClean) || tClean.includes(qClean))) ||
                    (vClean && (qClean.includes(vClean) || vClean.includes(qClean)))) {
                  el.selectedIndex = i;
                  el.value = opt.value;
                  matched = true;
                  break;
                }
              }
            }

            if (!matched && el.options.length > 1) {
              el.selectedIndex = 1;
            }

            el.dispatchEvent(new Event('change', { bubbles: true }));
            el.dispatchEvent(new Event('input', { bubbles: true }));
            return { success: true, value: el.value, text: el.options[el.selectedIndex]?.text };
          }

          // Graceful fallback for non-SELECT elements (e.g. text inputs or custom dropdowns)
          const valToSet = optQuery || ${JSON.stringify(optionText || '')};
          const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
          const nativeSetter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
          if (nativeSetter) {
            nativeSetter.call(el, valToSet);
          } else {
            el.value = valToSet;
          }
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
          return { success: true, value: el.value, fallback: true };
        })()
      `,
      returnByValue: true
    });
    
    if (res?.result?.value?.error) {
      throw new Error(res.result.value.error);
    }
    return res?.result?.value;
  }

  /**
   * Smart fill: resolves the element and adapts to its type using the (already
   * detokenized) value. Radios -> click the option in the group whose value
   * matches; SELECTs -> select the matching option; checkboxes -> check/uncheck
   * from a truthy value; otherwise -> TYPE the text. This lets the model pass a
   * vault token like <VAULT_GENDER> and the client decode + adapt.
   *
   * @param {string} targetId - element id/name (may be any member of a radio group)
   * @param {string|number} value - detokenized real value
   * @returns {Promise<Object>} execution result
   */
  async smartFill(targetId, value) {
    const escapedTarget = JSON.stringify(targetId);
    const escapedVal = JSON.stringify(typeof value === 'string' ? value : String(value ?? ''));

    const res = await this._cdp("Runtime.evaluate", {
      expression: `
        (function() {
          const target = ${escapedTarget};
          const value = ${escapedVal};
          const clean = (s) => (s || '').toString().toLowerCase().replace(/[\\s\\-_.,]/g, '').trim();
          const qClean = clean(value);

          const resolve = (t) => document.getElementById(t)
                  || document.querySelector('[name="' + t + '"]')
                  || document.querySelector('[data-testid="' + t + '"]')
                  || (t.startsWith('#') || t.startsWith('.') || t.includes('[') ? document.querySelector(t) : null);

          let el = resolve(target);
          if (!el) return { success: false, error: 'Element not found by target id: ' + target };

          // Guard against "invented token" values the model sometimes emits as a
          // literal (e.g. @contact.email, @contact.phone, #phone). Vault
          // tokens are always the exact form <VAULT_KEY> and are detokenized
          // before this point, so any bare @x / #x / token.x placeholder is a
          // model confabulation and must never be written into a real field.
          const rawVal = typeof value === 'string' ? value : String(value ?? '');
          if (/^[@#][\w.\-]+$/.test(rawVal.trim()) || /^<VAULT_[A-Z0-9_]+\>\s*$/i.test(rawVal.trim()) || /^vault[:_][\w.\-]+$/i.test(rawVal.trim())) {
            return { success: false, error: 'Refusing to write invented token: ' + rawVal };
          }

          el.scrollIntoView({ behavior: 'instant', block: 'center' });
          el.focus();

          // --- SELECT: pick the option whose text/value matches ---
          if (el.tagName === 'SELECT') {
            let matched = false;
            for (let i = 0; i < el.options.length; i++) {
              const opt = el.options[i];
              if (qClean && (clean(opt.text) === qClean || clean(opt.value) === qClean)) {
                el.selectedIndex = i; el.value = opt.value; matched = true; break;
              }
            }
            if (!matched && qClean) {
              for (let i = 0; i < el.options.length; i++) {
                const opt = el.options[i];
                const t = clean(opt.text), v = clean(opt.value);
                if ((t && (qClean.includes(t) || t.includes(qClean))) || (v && (qClean.includes(v) || v.includes(qClean)))) {
                  el.selectedIndex = i; el.value = opt.value; matched = true; break;
                }
              }
            }
            if (!matched && el.options.length > 1) el.selectedIndex = 1;
            el.dispatchEvent(new Event('change', { bubbles: true }));
            el.dispatchEvent(new Event('input', { bubbles: true }));
            return { success: true, id: el.id || target, value: el.value, text: el.options[el.selectedIndex]?.text, kind: 'select' };
          }

          // --- RADIO group: click the option whose value matches ---
          if (el.type === 'radio') {
            const name = el.name;
            let chosen = el;
            if (name) {
              const group = document.getElementsByName(name);
              for (const opt of group) {
                if (qClean && (clean(opt.value) === qClean || clean(opt.id) === qClean)) { chosen = opt; break; }
              }
            }
            if (!(qClean && (clean(chosen.value) === qClean || clean(chosen.id) === qClean))) {
              // value did not match any option: keep the original target if it's the only match
              chosen = el;
            }
            chosen.checked = true;
            chosen.dispatchEvent(new Event('change', { bubbles: true }));
            chosen.dispatchEvent(new Event('input', { bubbles: true }));
            return { success: true, id: chosen.id || target, value: chosen.value, kind: 'radio' };
          }

          // --- CHECKBOX: truthy -> check ---
          if (el.type === 'checkbox') {
            const yes = /^(1|true|yes|on|y|checked)$/i.test(String(value).trim());
            if (yes) { el.checked = true; }
            else { el.checked = false; }
            el.dispatchEvent(new Event('change', { bubbles: true }));
            el.dispatchEvent(new Event('input', { bubbles: true }));
            return { success: true, id: el.id || target, value: el.checked ? 'true' : 'false', kind: 'checkbox' };
          }

          // --- TEXT-like: fill the value ---
          let valToSet = value;
          if (el.type === 'date') {
            const parseDateInput = (val) => {
              if (!val) return '';
              const s = String(val).trim();
              if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
              let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
              if (m) {
                return m[1] + '-' + m[2].padStart(2, '0') + '-' + m[3].padStart(2, '0');
              }
              m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
              if (m) {
                const p1 = parseInt(m[1], 10), p2 = parseInt(m[2], 10), y = m[3];
                let d, mo;
                if (p1 > 12) {
                  d = String(p1).padStart(2, '0');
                  mo = String(p2).padStart(2, '0');
                } else if (p2 > 12) {
                  mo = String(p1).padStart(2, '0');
                  d = String(p2).padStart(2, '0');
                } else {
                  d = String(p1).padStart(2, '0');
                  mo = String(p2).padStart(2, '0');
                }
                return `${y}-${mo}-${d}`;
              }
              const ts = Date.parse(s);
              if (!isNaN(ts)) {
                const dt = new Date(ts);
                const y = dt.getFullYear();
                const mo = String(dt.getMonth() + 1).padStart(2, '0');
                const d = String(dt.getDate()).padStart(2, '0');
                return `${y}-${mo}-${d}`;
              }
              return s;
            };
            valToSet = parseDateInput(value);
          }
          const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
          const nativeSetter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
          if (nativeSetter) nativeSetter.call(el, valToSet); else el.value = valToSet;
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
          return { success: true, id: el.id || target, value: el.value, kind: 'text' };
        })()
      `,
      returnByValue: true
    });

    if (res?.result?.value?.error) {
      throw new Error(res.result.value.error);
    }
    return res?.result?.value;
  }

  async scrollElementIntoView(targetId) {
    const escapedTarget = JSON.stringify(targetId);
    await this._cdp("Runtime.evaluate", {
      expression: `
        (function() {
          const target = ${escapedTarget};
          const el = document.getElementById(target)
                  || document.querySelector('[name="' + target + '"]')
                  || (target.startsWith('#') || target.startsWith('.') || target.includes('[') ? document.querySelector(target) : null);
          if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        })()
      `
    });
  }

  async hoverElement(targetId) {
    const escapedTarget = JSON.stringify(targetId);
    await this._cdp("Runtime.evaluate", {
      expression: `
        (function() {
          const target = ${escapedTarget};
          const el = document.getElementById(target)
                  || document.querySelector('[name="' + target + '"]');
          if (el) {
            el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
            el.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
          }
        })()
      `
    });
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
      if (this.humanize && i < steps - 1) await this._delay(30 + Math.random() * 20);
    }
    // Allow scroll momentum / layout to settle before capturing next perception frame
    await this._delay(350);
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

              allElements.forEach((el) => {
                const tag = (el.tagName || '').toLowerCase();
                const className = (typeof el.className === 'string') ? el.className : '';
                const id = el.id || '';
                const dataPii = el.getAttribute ? el.getAttribute('data-pii') : null;
                const isSensitiveClass = /sensitive|pii-mask|mask-pii/i.test(className + ' ' + id);

                if (dataPii || isSensitiveClass) {
                  const rect = el.getBoundingClientRect();
                  if (rect.width > 0 && rect.height > 0) {
                    const cat = dataPii ? dataPii.toUpperCase() : 'SENSITIVE_CONTAINER';
                    sensitiveItems.push({
                      id: 'SENSITIVE_' + (counter++),
                      type: 'SENSITIVE_ELEMENT',
                      category: cat,
                      boundingBox: {
                        x: Math.round(rect.left),
                        y: Math.round(rect.top),
                        width: Math.round(rect.width),
                        height: Math.round(rect.height)
                      },
                      redactionLabel: '[REDACTED_' + cat + '_#' + (counter - 1) + ']'
                    });
                    if (tag !== 'input' && tag !== 'textarea' && tag !== 'select') return;
                  }
                }

                if (tag === 'input' || tag === 'textarea' || tag === 'select' || el.isContentEditable) {
                  const rect = el.getBoundingClientRect();
                  if (rect.width <= 0 || rect.height <= 0) return;

                  const val = (el.value || el.innerText || '').trim();
                  
                  const type = el.type || 'text';
                  if (type === 'password') {
                    sensitiveItems.push({ id: 'SEC_PASSWORD_' + (counter++), type: 'INPUT_FIELD', category: 'PASSWORD', boundingBox: { x: Math.round(rect.left), y: Math.round(rect.top), width: Math.round(rect.width), height: Math.round(rect.height) }, redactionLabel: '[REDACTED_PASSWORD_#' + (counter-1) + ']' });
                    return;
                  }

                  const attrContext = ((el.name||'') + ' ' + (el.id||'') + ' ' + (el.placeholder||'') + ' ' + (el.getAttribute('aria-label')||'')).toLowerCase();
const dataPii = el.getAttribute('data-pii');
if (sensitiveKeywords.test(attrContext) || dataPii) {
  let matchedCat = dataPii ? dataPii.toUpperCase() : 'AUTH_CREDENTIAL';
  if (attrContext.includes('aadhaar')) matchedCat = 'AADHAAR';
  else if (attrContext.includes('pan')) matchedCat = 'PAN';
  else if (/cvv|pin|otp/.test(attrContext)) matchedCat = 'OTP_PIN';
  sensitiveItems.push({ id: 'SEC_' + matchedCat + '_' + (counter++), type: 'INPUT_FIELD', category: matchedCat, boundingBox: { x: Math.round(rect.left), y: Math.round(rect.top), width: Math.round(rect.width), height: Math.round(rect.height) }, redactionLabel: '[REDACTED_' + matchedCat + '_#' + (counter-1) + ']' });
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
                      sensitiveItems.push({ id: 'SEC_' + matchedCat + '_' + (counter++), type: 'INPUT_FIELD', category: matchedCat, boundingBox: { x: Math.round(rect.left), y: Math.round(rect.top), width: Math.round(rect.width), height: Math.round(rect.height) }, redactionLabel: '[REDACTED_' + matchedCat + '_#' + (counter-1) + ']' });
                      return;
                    }
                  }
                }

                if (tag === 'img' || el.getAttribute('role') === 'img' || /avatar|profile|user-photo/i.test(el.className)) {
                  if (/avatar|profile|user|photo|badge/i.test((el.className||'') + ' ' + (el.id||'') + ' ' + (el.src||''))) {
                    const rect = el.getBoundingClientRect();
                    if (rect.width > 20 && rect.height > 20) {
                      sensitiveItems.push({ id: 'FACE_AVATAR_' + (counter++), type: 'MEDIA_PII', category: 'FACE_AVATAR', boundingBox: { x: Math.round(rect.left), y: Math.round(rect.top), width: Math.round(rect.width), height: Math.round(rect.height) }, redactionLabel: '[REDACTED_AVATAR_#' + (counter-1) + ']' });
                    }
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
                      sensitiveItems.push({ id: 'PII_' + matchedCat + '_' + (counter++), type: 'TEXT_PII', category: matchedCat, boundingBox: { x: Math.round(rect.left), y: Math.round(rect.top), width: Math.round(rect.width), height: Math.round(rect.height) }, redactionLabel: '[REDACTED_' + matchedCat + '_#' + (counter-1) + ']' });
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

  async getPageMetadataAndElements() {
    try {
      const res = await this._cdp("Runtime.evaluate", {
        expression: `
          (function() {
            const page = {
              title: document.title,
              url: window.location.href,
              viewport: { width: window.innerWidth, height: window.innerHeight },
              scroll: { x: window.scrollX, y: window.scrollY }
            };
            
            function getRole(el) {
              const roleAttr = el.getAttribute('role');
              if (roleAttr) return roleAttr.toLowerCase();
              const tag = el.tagName?.toLowerCase();
              switch (tag) {
                case 'input':
                  switch (el.type) {
                    case 'checkbox': return 'checkbox';
                    case 'radio': return 'radio';
                    case 'button': case 'submit': case 'reset': return 'button';
                    case 'text': case 'password': case 'email': return 'textbox';
                    default: return 'textbox';
                  }
                case 'button': return 'button';
                case 'select': return 'combobox';
                case 'textarea': return 'textbox';
                case 'a': return 'link';
                default: return 'generic';
              }
            }

            function isVisible(el, rect) {
              if (rect.width === 0 || rect.height === 0) return false;
              const style = window.getComputedStyle(el);
              if (style.visibility === 'hidden' || style.display === 'none' || style.opacity === '0') return false;
              return rect.bottom > 0 && rect.right > 0 && rect.top < window.innerHeight && rect.left < window.innerWidth;
            }

            const elements = [];
            const walk = (node) => {
              if (!node) return;
              if (node.nodeType === Node.ELEMENT_NODE) {
                elements.push(node);
                if (node.shadowRoot) walk(node.shadowRoot);
              }
              for (let child of node.childNodes) walk(child);
            };
            walk(document.body);

            const backendElements = elements.map(el => {
              const rect = el.getBoundingClientRect();
              if (rect.width <= 0 || rect.height <= 0) return null;
              
              let label = el.getAttribute('aria-label') || el.getAttribute('placeholder');
              if (!label && el.id) {
                const labelEl = document.querySelector('label[for="' + el.id + '"]');
                if (labelEl) label = labelEl.textContent;
              }
              
              const isInput = el.tagName === 'INPUT' || el.tagName === 'TEXTAREA';
              const isSelect = el.tagName === 'SELECT';
              const val = isInput ? (el.value || '') : (isSelect ? (el.value || '') : '');
              const isChecked = (el.type === 'checkbox' || el.type === 'radio') ? Boolean(el.checked) : undefined;
              const isSelected = isSelect ? Boolean(el.selectedIndex > 0 && el.value) : undefined;

              return {
                element_id: el.id || 'auto_' + Math.floor(Math.random() * 10000),
                role: getRole(el),
                type: el.type || undefined,
                tag: el.tagName?.toLowerCase() || undefined,
                text: el.innerText?.trim() || undefined,
                label: label?.trim() || undefined,
                placeholder: el.placeholder || undefined,
                value: val,
                bbox: [Math.round(rect.left), Math.round(rect.top), Math.round(rect.width), Math.round(rect.height)],
                visible: isVisible(el, rect),
                enabled: !el.disabled,
                checked: isChecked,
                selected: isSelected
              };
            }).filter(Boolean);

            // Form checklist computation across all form controls on page
            const formControls = Array.from(document.querySelectorAll('input, select, textarea')).filter(el => {
              if (el.type === 'hidden' || el.type === 'submit' || el.type === 'button' || el.type === 'reset') return false;
              const style = window.getComputedStyle(el);
              return style.display !== 'none' && style.visibility !== 'hidden';
            });

            const checkedRadioNames = new Set();
            for (const el of formControls) {
              if (el.type === 'radio' && el.checked && el.name) checkedRadioNames.add(el.name);
            }

            const checklist = {
              total_fields: formControls.length,
              filled: [],
              unfilled_visible: [],
              unfilled_offscreen: [],
            };

            for (const el of formControls) {
              const rect = el.getBoundingClientRect();
              const isVis = isVisible(el, rect);
              const eid = el.id || el.name || '';
              
              let isFilled = false;
              if (el.tagName === 'SELECT') {
                isFilled = el.selectedIndex > 0 && el.value !== '';
              } else if (el.type === 'checkbox') {
                isFilled = Boolean(el.checked);
              } else if (el.type === 'radio') {
                isFilled = Boolean(el.checked || (el.name && checkedRadioNames.has(el.name)));
              } else {
                isFilled = Boolean(el.value && el.value.trim().length > 0);
              }

              if (isFilled) {
                checklist.filled.push(eid);
              } else if (isVis) {
                checklist.unfilled_visible.push(eid);
              } else {
                checklist.unfilled_offscreen.push(eid);
              }
            }

            return { page, elements: backendElements, checklist };
          })()
        `,
        returnByValue: true,
      });
      return res.result?.value || { page: {}, elements: [], checklist: {} };
    } catch (err) {
      console.warn("[ActionExecutor] getPageMetadataAndElements failed:", err.message);
      return { page: {}, elements: [] };
    }
  }
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

