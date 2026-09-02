const fs = require('fs');
let content = fs.readFileSync('lib/agent-loop.js', 'utf8');

content = content.replace(
  /this\.offscreenPort\.postMessage\(\s*\{\s*type:\s*BG_PROCESS_FRAME,\s*correlationId:\s*id,\s*rawBase64:\s*frame\.base64,\s*buffer:\s*frame\.buffer,\s*piiBoxes:\s*piiBoxes,\s*dpr:\s*this\.actionExecutor\.dpr,\s*viewportWidth:\s*viewportWidth\s*\},\s*\[frame\.buffer\]\s*\);/,
  'this.offscreenPort.postMessage({ type: BG_PROCESS_FRAME, correlationId: id, rawBase64: frame.base64, piiBoxes: piiBoxes, dpr: this.actionExecutor.dpr, viewportWidth: viewportWidth });'
);

fs.writeFileSync('lib/agent-loop.js', content);
