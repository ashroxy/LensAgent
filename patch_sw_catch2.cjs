const fs = require('fs');
let content = fs.readFileSync('background/service-worker.js', 'utf8');

content = content.replace(
  /\} catch \(err\) \{\s*console\.error\("\[SW\] Start failed:", err\);\s*if \(activeCaptureEngine\) \{\s*await activeCaptureEngine\.detach\(\)\.catch\(\(\) => \{\}\);\s*activeCaptureEngine = null;\s*\}\s*activeTabId = null;\s*await storage\.sessionSet\(\{ agentState: AgentState\.IDLE \}\);\s*return \{ status: "STOPPED" \};\s*\}/,
  '} catch (err) {\n    console.error("[SW] Start failed:", err);\n    return { status: "ERROR", error: err.message || err.toString() };\n  }'
);

content = content.replace(
  /\} catch \(err\) \{\s*console\.error\("\[SW\] Start failed:", err\);\s*if \(activeCaptureEngine\) \{\s*await activeCaptureEngine\.detach\(\)\.catch\(\(\) => \{\}\);\s*activeCaptureEngine = null;\s*\}/,
  '} catch (err) {\n    console.error("[SW] Start failed:", err);\n    return { status: "ERROR", error: err.message || err.toString() };\n  //'
); // In case it matched without activeTabId

fs.writeFileSync('background/service-worker.js', content);
