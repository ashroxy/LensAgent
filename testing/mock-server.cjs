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

  if (req.method === 'POST' && req.url === '/api/v1/infer') {
    let body = '';
    req.on('data', chunk => body += chunk.toString());
    req.on('end', () => {
      console.log(`\n[Mock Backend] Received Request from LensAgent!`);
      const payload = JSON.parse(body);
      
      console.log(`- Goal: "${payload.task}"`);
      console.log(`- Session: ${payload.session_id}`);
      console.log(`- UI Elements detected: ${payload.browser_state?.elements?.length || 0}`);
      console.log(`- Redacted Image Size: ${payload.screenshot?.data ? Math.round(payload.screenshot.data.length / 1024) + ' KB' : 'Missing'}`);

      // We send back a mock command to terminate successfully
      const response = {
        thought: "I see the test sandbox. I will finish the task successfully.",
        action_plan: { type: "FINISH", detail: "Task successfully executed!" }
      };

      console.log(`[Mock Backend] Instructing Agent to FINISH successfully.`);

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
