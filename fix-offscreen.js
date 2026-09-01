-const fs = require('fs');
let js = fs.readFileSync('e:/SIH-171/offscreen/offscreen.js', 'utf8');
const oldBlock =   function connectPort() {
    try {
      // This will throw if the extension context is invalidated (e.g. extension was reloaded)
      if (!chrome.runtime || !chrome.runtime.id) {
        console.warn("[Offscreen] chrome.runtime unavailable.");
        return;
      }
    } catch (e) {
      console.log("[Offscreen] Extension context invalidated. Self-destructing...");
      window.close();
      return;
    };
const newBlock =   function connectPort() {;
js = js.replace(oldBlock, newBlock);
fs.writeFileSync('e:/SIH-171/offscreen/offscreen.js', js, 'utf8');
