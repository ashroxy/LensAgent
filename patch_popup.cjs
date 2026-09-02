const fs = require('fs');
let content = fs.readFileSync('popup/popup.js', 'utf8');

const prefix = `let currentPopupTabId = null;
chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
  if (tabs.length > 0) currentPopupTabId = tabs[0].id;
});

`;

content = prefix + content;

content = content.replace(
  'chrome.runtime.onMessage.addListener((message) => {',
  `chrome.runtime.onMessage.addListener((message) => {
    if (message.payload && message.payload.activeTabId && currentPopupTabId && message.payload.activeTabId !== currentPopupTabId) {
      return; // Ignore broadcasts from other tabs
    }`
);

content = content.replace(
  'const status = await msg({ type: POPUP_GET_STATUS });',
  `const status = await msg({ type: POPUP_GET_STATUS });
    if (status && status.activeTabId && currentPopupTabId && status.activeTabId !== currentPopupTabId && status.state !== AgentState.IDLE) {
      addLog("Agent is running on another tab. Please stop it first.", "warning");
      status.state = AgentState.IDLE;
    }`
);

fs.writeFileSync('popup/popup.js', content);
