
const fs = require("fs");
let html = fs.readFileSync("e:/SIH-171/popup/popup.html", "utf8");

html = html.replace(
  /<span class="font-mono text-\[9px\] text-tertiary uppercase tracking-widest">Live<\/span>\s*<\/div>\s*<div class="flex-1 bg-black rounded-xl overflow-hidden relative group">/,
  `<span class="font-mono text-[9px] text-tertiary uppercase tracking-widest">Live</span>
                              </div>
                          </div></div>
                          <div class="flex-1 bg-black rounded-xl overflow-hidden relative group">`
);

fs.writeFileSync("e:/SIH-171/popup/popup.html", html, "utf8");
console.log("Done DIV");

