const fs=require('fs');
const lines=fs.readFileSync('popup/popup.html','utf8').split('\n');
const i=lines.findIndex(l=>l.includes('stepCount'));
console.log(lines.slice(Math.max(0,i-10),i+20).join('\n'));
