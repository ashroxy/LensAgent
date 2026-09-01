const fs = require('fs');
const lines = fs.readFileSync('C:/Users/User/.gemini/antigravity/brain/16ddbe87-7e27-48fa-bc7e-9e681645d240/.system_generated/logs/transcript.jsonl', 'utf8').split('\n');
const target = lines.findIndex(l => l.includes('"step_index":2746,'));
console.log(lines.slice(target - 15, target + 5).join('\n'));
