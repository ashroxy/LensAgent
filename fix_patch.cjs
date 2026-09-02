const fs = require('fs');
let content = fs.readFileSync('patch_sw_final3.cjs', 'utf8');
content = content.replace(\"'activeTabId = null;',\\n  'if (activeTabId === tabId) activeTabId = null;'\", \"'    activeTabId = null;',\\n  '    if (activeTabId === tabId) activeTabId = null;'\");
fs.writeFileSync('patch_sw_final3.cjs', content);
