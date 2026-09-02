const fs = require('fs');
let content = fs.readFileSync('popup/popup.js', 'utf8');

content = content.replace(
  'await msg({ type: POPUP_START_AGENT, goal, settings: { ...settings, captureQuality } });',
  'await msg({ type: POPUP_START_AGENT, goal, settings: { ...settings, captureQuality }, targetTabId: currentPopupTabId });'
);

content = content.replace(
  'await msg({ type: POPUP_STOP_AGENT });',
  'await msg({ type: POPUP_STOP_AGENT, targetTabId: currentPopupTabId });'
);

content = content.replace(
  'const status = await msg({ type: POPUP_GET_STATUS });',
  'const status = await msg({ type: POPUP_GET_STATUS, targetTabId: currentPopupTabId });'
);

content = content.replace(
  'const history = await msg({ type: POPUP_GET_HISTORY });',
  'const history = await msg({ type: POPUP_GET_HISTORY, targetTabId: currentPopupTabId });'
);

content = content.replace(
  'const resp = await msg({ type: POPUP_EXPORT_LOG });',
  'const resp = await msg({ type: POPUP_EXPORT_LOG, targetTabId: currentPopupTabId });'
);

content = content.replace(
  'await msg({ type: POPUP_HITL_RESPONSE, actionId, answer, saveToVault, vaultKey });',
  'await msg({ type: POPUP_HITL_RESPONSE, actionId, answer, saveToVault, vaultKey, targetTabId: currentPopupTabId });'
);

content = content.replace(
  'await msg({ type: POPUP_APPROVAL_RESPONSE, actionId, approved });',
  'await msg({ type: POPUP_APPROVAL_RESPONSE, actionId, approved, targetTabId: currentPopupTabId });'
);

content = content.replace(
  'await msg({ type: POPUP_CLEAR_HISTORY });',
  'await msg({ type: POPUP_CLEAR_HISTORY, targetTabId: currentPopupTabId });'
);

fs.writeFileSync('popup/popup.js', content);
