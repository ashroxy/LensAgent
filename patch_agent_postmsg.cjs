const fs = require('fs');
let content = fs.readFileSync('lib/agent-loop.js', 'utf8');

content = content.replace(
  '            { \\n              type: BG_PROCESS_FRAME, \\n              correlationId: id, \\n              rawBase64: frame.base64, \\n              buffer: frame.buffer,\\n              piiBoxes: piiBoxes,\\n              dpr: this.actionExecutor.dpr,\\n              viewportWidth: viewportWidth\\n            },\\n            [frame.buffer]\\n          );',
  '            { \\n              type: BG_PROCESS_FRAME, \\n              correlationId: id, \\n              rawBase64: frame.base64,\\n              piiBoxes: piiBoxes,\\n              dpr: this.actionExecutor.dpr,\\n              viewportWidth: viewportWidth\\n            }\\n          );'
);

fs.writeFileSync('lib/agent-loop.js', content);
