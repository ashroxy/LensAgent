const fs = require('fs');
const jsdom = require('jsdom');
const { JSDOM } = jsdom;

const html = fs.readFileSync('popup/popup.html', 'utf8');
let js = fs.readFileSync('popup/popup.js', 'utf8');

js = js.replace(/import\s+\{[\s\S]*?\}\s+from\s+['"].*?['"];/g, '');

const dom = new JSDOM(html, { runScripts: 'outside-only' });
dom.window.chrome = {
  runtime: {
    sendMessage: () => {},
    onMessage: { addListener: () => {} }
  }
};
dom.window.fetch = () => Promise.resolve({ json: () => Promise.resolve({}) });

try {
  dom.window.eval(js);
  console.log('Script executed successfully!');
} catch (e) {
  console.log('Error executing script:', e.message);
  console.log(e.stack);
}
