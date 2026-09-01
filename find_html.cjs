const fs = require('fs');
const lines = fs.readFileSync('C:/Users/User/.gemini/antigravity/brain/16ddbe87-7e27-48fa-bc7e-9e681645d240/.system_generated/logs/transcript.jsonl', 'utf8').split('\n').filter(Boolean);
let html = '';
for (const line of lines) {
  const obj = JSON.parse(line);
  if (obj.step_index === 1415) {
    console.log("Time:", obj.created_at);
    fs.writeFileSync('user_html.html', obj.content);
    break;
  }
}
