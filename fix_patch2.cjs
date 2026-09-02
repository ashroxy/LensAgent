const fs = require('fs');
let content = fs.readFileSync('patch_sw_final3.cjs', 'utf8');

content = content.replace(
  \"content = content.replace(\\n  'activeAgent = new AgentLoop({',\\n  'const activeAgent = new AgentLoop({'\\n);\",
  \"\"
);

fs.writeFileSync('patch_sw_final3.cjs', content);
