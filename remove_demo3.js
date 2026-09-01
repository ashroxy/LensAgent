
const fs = require("fs");
let js = fs.readFileSync("e:/SIH-171/popup/popup.js", "utf8");

js = js.replace(/const demoHitlBtn = document\.getElementById\("demoHitlBtn"\);[\s\S]*?\}\n\}/, "");

fs.writeFileSync("e:/SIH-171/popup/popup.js", js.trim() + "\n", "utf8");
console.log("Done");

