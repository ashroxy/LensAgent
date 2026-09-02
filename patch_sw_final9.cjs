const fs = require('fs');
const content = fs.readFileSync('background/service-worker.js', 'utf8');
const lines = content.split('\n');
const newLines = lines.map(line => {
  if (line.includes('if (activeAgent && activeAgent.state === AgentState.RUNNING) {') && line.includes('return { status: \"ERROR\"') === false) {
    return '      // Removed crashy activeAgent check';
  }
  if (line.includes('return { status: "ERROR", error: "An agent session is already running. Stop it first." };')) {
    return '      // Removed crashy activeAgent check return';
  }
  if (line.includes('      } // End of multi-session prevention')) { // won't match exactly, I'll just remove lines
    return line;
  }
  return line;
});
fs.writeFileSync('background/service-worker.js', newLines.join('\n'));
