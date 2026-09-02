const fs = require('fs');
let content = fs.readFileSync('lib/agent-loop.js', 'utf8');

content = content.replace(
  'chrome.runtime.sendMessage({ type: AUDIT_FRAME_UPDATE, payload: data }).catch(() => {});',
  'chrome.runtime.sendMessage({ type: AUDIT_FRAME_UPDATE, payload: { ...data, activeTabId: this.tabId } }).catch(() => {});'
);

content = content.replace(
  'type: AUDIT_ACTION_LOG, payload: { message, timestamp: Date.now() },',
  'type: AUDIT_ACTION_LOG, payload: { message, timestamp: Date.now(), activeTabId: this.tabId },'
);

content = content.replace(
  'chrome.runtime.sendMessage({ type: BG_AGENT_STATUS, payload: this.getStatus() }).catch(() => {});',
  'chrome.runtime.sendMessage({ type: BG_AGENT_STATUS, payload: { activeTabId: this.tabId, ...this.getStatus() } }).catch(() => {});'
);

fs.writeFileSync('lib/agent-loop.js', content);
