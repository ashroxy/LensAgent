// content.js - Prevent duplicate execution context bindings
if (!window.hasAgentLoopRegistered) {
  window.hasAgentLoopRegistered = true;

  function extractSensitiveDOMBoxes() {
    const dpr = window.devicePixelRatio || 1;
    const selectors = [
      'input[type="password"]',
      'input[type="email"]',
      'input[type="tel"]',
      'input[autocomplete*="cc-"]',
      'input[autocomplete*="credit-card"]',
      'input[id*="card" i]',
      'input[name*="card" i]',
      'input[id*="cvv" i]',
      'input[name*="cvv" i]',
      'input[id*="ssn" i]',
      'input[name*="ssn" i]',
      'input[id*="password" i]',
      'input[name*="password" i]',
      '[data-pii]',
      '.sensitive-pii',
      '.sensitive'
    ];

    const elements = document.querySelectorAll(selectors.join(','));
    const boxes = [];

    for (const el of elements) {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0 && rect.top < window.innerHeight && rect.bottom > 0) {
        boxes.push({
          xmin: Math.round(rect.left * dpr),
          ymin: Math.round(rect.top * dpr),
          xmax: Math.round(rect.right * dpr),
          ymax: Math.round(rect.bottom * dpr),
          label: el.getAttribute('data-pii') || el.type || 'sensitive-input'
        });
      }
    }
    return boxes;
  }

  async function runAgentLoop(userInstruction) {
    console.log("Starting visual agent iteration...");

    const domBoxes = extractSensitiveDOMBoxes();
    const response = await chrome.runtime.sendMessage({ 
      type: 'CAPTURE_TAB',
      domBoxes: domBoxes
    });
    
    if (!response || response.error) {
      console.error("Redaction Error:", response?.error || "Empty response");
      return;
    }

    console.log("Frame sanitized. Forwarding to backend server...");

    const serverResponse = await fetch('http://localhost:8000/api/v1/agent/act', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        instruction: userInstruction,
        sanitized_image: response.sanitizedBase64,
        url: window.location.href
      })
    });

    const rawPayload = await serverResponse.json();
    const actionPlan = rawPayload?.response || rawPayload;

    console.log("==========================================");
    console.log("🤖 EXECUTING VLM ACTION:", actionPlan);
    console.log("==========================================");

    if (actionPlan && actionPlan.action) {
      executeAction(actionPlan);
    }
  }

  window.runAgentLoop = runAgentLoop;
}