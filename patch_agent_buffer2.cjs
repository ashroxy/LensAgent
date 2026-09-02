const fs = require('fs');
let content = fs.readFileSync('lib/agent-loop.js', 'utf8');

content = content.replace(
  /this\.offscreenPort\.postMessage\(\{\s*type:\s*BG_PROCESS_FRAME,\s*correlationId:\s*id,\s*rawBase64:\s*frame\.base64,\s*piiBoxes:\s*piiBoxes,\s*dpr:\s*this\.actionExecutor\.dpr,\s*viewportWidth:\s*viewportWidth\s*\}\);/,
  'this.offscreenPort.postMessage({ type: BG_PROCESS_FRAME, correlationId: id, rawBase64: frame.base64, buffer: frame.buffer, piiBoxes: piiBoxes, dpr: this.actionExecutor.dpr, viewportWidth: viewportWidth }, [frame.buffer]);'
);

fs.writeFileSync('lib/agent-loop.js', content);
