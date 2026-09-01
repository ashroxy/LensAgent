const fs = require('fs');
const file = 'e:/SIH-171/rubrics/SIH_EVALUATION_TRACKER.md';
let c = fs.readFileSync(file, 'utf8');
c = c.replace(/??/g, '??');
c = c.replace(/?/g, '?');
c = c.replace(/dY",/g, '??'); 
fs.writeFileSync(file, c, 'utf8');
