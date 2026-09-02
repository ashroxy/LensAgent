const fs = require('fs');
let content = fs.readFileSync('popup/popup.js', 'utf8');

content = content.replace(
  'if (message.payload && message.payload.activeTabId && currentPopupTabId && message.payload.activeTabId !== currentPopupTabId) {',
  'const filterTabId = targetTabId || currentPopupTabId;\\n    if (message.payload && message.payload.activeTabId && filterTabId && message.payload.activeTabId !== filterTabId) {'
);

fs.writeFileSync('popup/popup.js', content);
