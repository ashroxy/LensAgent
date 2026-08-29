const http = require('http');

const server = http.createServer((req, res) => {
  // Handle CORS so the Chrome Extension can communicate with us
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    return res.end();
  }

  if (req.method === 'POST' && req.url === '/api/v1/agent/act') {
    let body = '';
    req.on('data', chunk => body += chunk.toString());
    req.on('end', () => {
      console.log(`\n[Mock Backend] Received Request from LensAgent!`);
      const payload = JSON.parse(body);
      
      console.log(`- Goal: "${payload.goal}"`);
      console.log(`- Step: ${payload.step}`);
      console.log(`- UI Elements detected: ${payload.ui_elements?.length || 0}`);
      console.log(`- A11y Tree nodes: ${payload.a11y_tree?.length || 0}`);
      console.log(`- DOM Snapshot nodes: ${payload.dom_snapshot?.length || 0}`);
      console.log(`- Redacted Image Size: ${payload.redacted_image ? Math.round(payload.redacted_image.length / 1024) + ' KB' : 'Missing'}`);

      const dpr = payload.viewport?.dpr || 1;
      
      // We send back a mock command to click the red button in the sandbox
      // The red button is located at CSS coordinates X:250, Y:250.
      // Because your action-executor.js correctly handles high-DPI displays (Retina/Windows Scaling),
      // the backend must send image (physical) pixels. We multiply by DPR here.
      const response = {
        thought: "I see the test sandbox. I will click the target button to prove CDP injection works.",
        actions: [
          { type: "CLICK", x: Math.round(250 * dpr), y: Math.round(250 * dpr) },
          { type: "FINISH" }
        ]
      };

      console.log(`[Mock Backend] Instructing Agent to CLICK physical coordinates (${Math.round(250 * dpr)}, ${Math.round(250 * dpr)}) based on DPR ${dpr}`);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(response));
    });
  } else {
    res.writeHead(404);
    res.end();
  }
});

const PORT = 8000;
server.listen(PORT, () => {
  console.log(`========================================================`);
  console.log(` Member 4 Mock Backend running on http://localhost:${PORT}`);
  console.log(`========================================================`);
  console.log(`Waiting for LensAgent to send visual state...`);
});
