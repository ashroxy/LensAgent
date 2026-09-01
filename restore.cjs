const fs = require('fs');
const oldHtml = fs.readFileSync('8f10b6a.html', 'utf8');
const curHtml = fs.readFileSync('popup/popup.html', 'utf8');

const getSection = (html, id) => {
   const start = html.indexOf('<section id=\"' + id + '\"');
   let nextStart = html.indexOf('<section id=\"', start + 1);
   if (nextStart === -1) nextStart = html.indexOf('</main>', start);
   return html.substring(start, nextStart);
};

const oldAgent = getSection(oldHtml, 'tab-agent');
const curAgent = getSection(curHtml, 'tab-agent');

const newHtml = curHtml.replace(curAgent, oldAgent);
fs.writeFileSync('popup/popup.html', newHtml, 'utf8');
console.log('Replaced tab-agent with 8f10b6a version');
