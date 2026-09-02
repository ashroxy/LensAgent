const fs = require('fs');
let content = fs.readFileSync('popup/popup.js', 'utf8');

content = content.replace(
  'let currentPopupTabId = null;\nchrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {\n  if (tabs.length > 0) currentPopupTabId = tabs[0].id;\n});',
  'let currentPopupTabId = null;'
);

content = content.replace(
  '(async () => {\n    const status = await msg({ type: POPUP_GET_STATUS, targetTabId: currentPopupTabId });',
  '(async () => {\n    const tabs = await new Promise(r => chrome.tabs.query({ active: true, currentWindow: true }, r));\n    if (tabs.length > 0) currentPopupTabId = tabs[0].id;\n    const status = await msg({ type: POPUP_GET_STATUS, targetTabId: currentPopupTabId });'
);

fs.writeFileSync('popup/popup.js', content);
