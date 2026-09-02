const fs = require('fs');
let content = fs.readFileSync('background/service-worker.js', 'utf8');

content = content.replace(
  '      const captureEngine = new CaptureEngine(tab.id);',
  '      // Ensure tab is active and window is focused so startScreencast emits frames\\n      await chrome.tabs.update(tab.id, { active: true }).catch(() => {});\\n      await chrome.windows.update(tab.windowId, { focused: true }).catch(() => {});\\n\\n      const captureEngine = new CaptureEngine(tab.id);'
);

fs.writeFileSync('background/service-worker.js', content);
