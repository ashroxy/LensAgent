
const fs = require("fs");
let html = fs.readFileSync("e:/SIH-171/popup/popup.html", "utf8");

html = html.replace(
  /\s*<\/div>\s*<div class="flex gap-4 w-full mt-4 col-span-2">\s*<button id="demoHitlBtn"[\s\S]*?<\/button>\s*<\/div>/,
  ""
);

fs.writeFileSync("e:/SIH-171/popup/popup.html", html, "utf8");
console.log("Done");

