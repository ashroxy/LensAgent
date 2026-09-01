
const fs = require("fs");

// 1. Remove from HTML
let html = fs.readFileSync("e:/SIH-171/popup/popup.html", "utf8");
html = html.replace(/\s*<!- DEMO BUTTONS ->[\s\S]*?<\/button>\s*<\/div>/, "");
fs.writeFileSync("e:/SIH-171/popup/popup.html", html, "utf8");

// 2. Remove from JS
let js = fs.readFileSync("e:/SIH-171/popup/popup.js", "utf8");
js = js.replace(/\s*\/\/ - DEMO BUTTONS -[\s\S]*?\/\/ -/, "");
fs.writeFileSync("e:/SIH-171/popup/popup.js", js, "utf8");

console.log("Done reverting demo buttons");

