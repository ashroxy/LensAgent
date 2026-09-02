const fs = require('fs');
let content = fs.readFileSync('background/service-worker.js', 'utf8');

content = content.replace(
  '  } catch (err) {\\n    console.error("[SW] Start failed:", err);\\n    if (activeCaptureEngine) {\\n      await activeCaptureEngine.detach().catch(() => {});\\n      activeCaptureEngine = null;\\n    }\\n    await storage.sessionSet({ agentState: AgentState.IDLE });\\n    return { status: "STOPPED" };\\n  }',
  '  } catch (err) {\\n    console.error("[SW] Start failed:", err);\\n    if (typeof tab !== "undefined" && tab?.id && activeCaptureEngines.has(tab.id)) {\\n      await activeCaptureEngines.get(tab.id).detach().catch(() => {});\\n      activeCaptureEngines.delete(tab.id);\\n    }\\n    return { status: "ERROR", error: err.message };\\n  }'
);

fs.writeFileSync('background/service-worker.js', content);
