/**
 * ISRO PS 171 - Accessibility Tree Walker (Shadow DOM Support)
 * Module: accessibility_walker.js
 *
 * NOTE: This module runs in PAGE CONTEXT via CDP Runtime.evaluate injection.
 * It is NOT an ES module — it uses a plain IIFE return pattern for CDP compatibility.
 * When injecting, call: (function(){ <code>; return new AccessibilityWalker().buildTree(); })()
 */

export class AccessibilityWalker {
  constructor() {
    this.interactiveTags = new Set([
      'a', 'button', 'input', 'select', 'textarea', 'option',
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'nav', 'main', 'form'
    ]);
  }

  buildTree(rootElement = (typeof document !== 'undefined' ? document.body : null)) {
    if (!rootElement) return null;
    let nodeIdCounter = 1;

    const traverse = (element) => {
      if (!element || element.nodeType !== Node.ELEMENT_NODE) return null;
      const tagName = (element.tagName || '').toLowerCase();
      if (['script', 'style', 'noscript', 'template', 'svg'].includes(tagName)) return null;

      const style = window.getComputedStyle ? window.getComputedStyle(element) : {};
      if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return null;

      const rect = element.getBoundingClientRect ? element.getBoundingClientRect() : { left: 0, top: 0, width: 0, height: 0 };
      const isVisible = rect.width > 0 && rect.height > 0;
      const role = this._determineRole(element, tagName);
      const name = this._getAccessibleName(element);
      const isInteractive = this._isInteractive(element, tagName, role);

      const childrenNodes = [];
      const childElements = [];
      if (element.shadowRoot) {
        for (const shadowChild of element.shadowRoot.children) childElements.push(shadowChild);
      }
      for (const lightChild of element.children) childElements.push(lightChild);
      for (const child of childElements) {
        const childNode = traverse(child);
        if (childNode) childrenNodes.push(childNode);
      }

      if (!isInteractive && !name && childrenNodes.length === 1) return childrenNodes[0];
      if (isInteractive || name || childrenNodes.length > 0) {
        return {
          nodeId: `AX_${nodeIdCounter++}`,
          role,
          tagName,
          name,
          value: element.value || (element.type === 'checkbox' ? element.checked : undefined),
          isInteractive,
          boundingBox: isVisible ? {
            x: Math.round(rect.left), y: Math.round(rect.top),
            width: Math.round(rect.width), height: Math.round(rect.height)
          } : null,
          children: childrenNodes.length > 0 ? childrenNodes : undefined
        };
      }
      return null;
    };

    return {
      role: 'WebArea',
      name: document.title || 'Web Page',
      url: window.location.href,
      children: traverse(rootElement) ? [traverse(rootElement)] : []
    };
  }

  _determineRole(el, tag) {
    if (el.getAttribute && el.getAttribute('role')) return el.getAttribute('role');
    if (tag === 'button') return 'button';
    if (tag === 'a' && el.hasAttribute && el.hasAttribute('href')) return 'link';
    if (tag === 'input') {
      const type = el.type || 'text';
      if (type === 'password') return 'password';
      if (type === 'checkbox') return 'checkbox';
      if (type === 'radio') return 'radio';
      if (['submit', 'button', 'reset'].includes(type)) return 'button';
      return 'textbox';
    }
    if (tag === 'select') return 'combobox';
    if (tag === 'textarea') return 'textbox';
    if (/^h[1-6]$/.test(tag)) return 'heading';
    return tag;
  }

  _getAccessibleName(el) {
    if (!el.getAttribute) return '';
    if (el.getAttribute('aria-label')) return el.getAttribute('aria-label').trim();
    if (el.placeholder) return el.placeholder.trim();
    if (el.title) return el.title.trim();
    if (el.alt) return el.alt.trim();
    if (['button', 'a', 'h1', 'h2', 'h3', 'h4', 'label'].includes((el.tagName || '').toLowerCase())) {
      const text = el.innerText || el.textContent;
      if (text && text.trim().length > 0 && text.trim().length < 80) return text.trim();
    }
    return '';
  }

  _isInteractive(el, tag, role) {
    if (['button', 'link', 'textbox', 'combobox', 'checkbox', 'radio'].includes(role)) return true;
    if (this.interactiveTags.has(tag)) return true;
    if (el.hasAttribute && (el.hasAttribute('tabindex') || el.hasAttribute('onclick'))) return true;
    if (el.isContentEditable) return true;
    return false;
  }
}

/**
 * CDP injection helper — returns the serialized tree string when evaluated in page context.
 * Usage: await Runtime.evaluate({ expression: getWalkerInjectionScript() })
 */
export function getWalkerInjectionScript() {
  return `(function() {
    ${AccessibilityWalker.toString()}
    try { return JSON.stringify(new AccessibilityWalker().buildTree()); }
    catch(e) { return JSON.stringify({ error: e.message }); }
  })()`;
}
