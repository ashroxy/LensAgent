// background.js

async function ensureOffscreenDocument() {
  try {
    // Check if offscreen document already exists using getContexts
    const contexts = await chrome.runtime.getContexts({
      contextTypes: ['OFFSCREEN_DOCUMENT']
    });

    if (contexts.length > 0) {
      console.log("Offscreen document already active.");
      return;
    }

    // Create the document using a valid MV3 enum reason
    await chrome.offscreen.createDocument({
      url: 'offscreen.html',
      reasons: ['WORKERS'], // Valid Chrome MV3 Enum Reason
      justification: 'Running client-side WebGPU Vision Model for local PII redaction'
    });
    console.log("Offscreen document created successfully!");
  } catch (err) {
    console.error("Failed to create offscreen document:", err);
  }
}

// Ensure offscreen document is spawned immediately when extension initializes
chrome.runtime.onInstalled.addListener(() => {
  ensureOffscreenDocument();
});

chrome.runtime.onStartup.addListener(() => {
  ensureOffscreenDocument();
});

// Listener for capture events
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'CAPTURE_TAB') {
    (async () => {
      try {
        await ensureOffscreenDocument();

        // Capture screen pixels
        const dataUrl = await chrome.tabs.captureVisibleTab(null, { format: 'png' });

        // Forward to offscreen document with DOM ground truth boxes
        chrome.runtime.sendMessage(
          { 
            type: 'PROCESS_SCREENSHOT', 
            dataUrl: dataUrl,
            domBoxes: message.domBoxes || []
          },
          (sanitizedResponse) => {
            if (chrome.runtime.lastError) {
              console.error("Offscreen response error:", chrome.runtime.lastError.message);
              sendResponse({ error: chrome.runtime.lastError.message });
            } else {
              sendResponse(sanitizedResponse);
            }
          }
        );
      } catch (err) {
        console.error("Background script execution error:", err);
        sendResponse({ error: err.message });
      }
    })();

    return true; // Keep channel open for async response
  }
});