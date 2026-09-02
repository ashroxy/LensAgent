const fs = require('fs');
let content = fs.readFileSync('popup/popup.js', 'utf8');

content = content.replace(
  /targetTabId: currentPopupTabId/g,
  'targetTabId: targetTabId || currentPopupTabId'
);

content = content.replace(
  /if \(status && status\.activeTabId && currentPopupTabId && status\.activeTabId !== currentPopupTabId && status\.state !== AgentState\.IDLE\) \{/g,
  'const filterTabId = targetTabId || currentPopupTabId;\n    if (status && status.activeTabId && filterTabId && status.activeTabId !== filterTabId && status.state !== AgentState.IDLE) {'
);

fs.writeFileSync('popup/popup.js', content);
