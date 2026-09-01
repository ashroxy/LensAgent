-
const fs = require("fs");
let js = fs.readFileSync("e:/SIH-171/popup/popup.js", "utf8");

const wireStr = `
const btnRawFullscreen = document.getElementById("btnRawFullscreen");
const btnSanitizedFullscreen = document.getElementById("btnSanitizedFullscreen");
const fullscreenModal = document.getElementById("fullscreenModal");
const btnCloseModal = document.getElementById("btnCloseModal");
const modalTitle = document.getElementById("modalTitle");
const modalFeed = document.getElementById("modalFeed");

let activeFullscreenInterval = null;

if (btnRawFullscreen) {
  btnRawFullscreen.addEventListener("click", () => {
    modalTitle.innerHTML = "<span class=\\"material-symbols-outlined text-primary\\">visibility</span> Raw Viewport - Fullscreen";
    fullscreenModal.classList.remove("opacity-0", "pointer-events-none");
    fullscreenModal.classList.add("opacity-100");
    if (activeFullscreenInterval) clearInterval(activeFullscreenInterval);
    activeFullscreenInterval = setInterval(() => {
      const rawFeed = document.getElementById("rawFeed");
      if (rawFeed && rawFeed.src) modalFeed.src = rawFeed.src;
    }, 100);
  });
}

if (btnSanitizedFullscreen) {
  btnSanitizedFullscreen.addEventListener("click", () => {
    modalTitle.innerHTML = "<span class=\\"material-symbols-outlined text-primary\\">security</span> Sanitized Stream - Fullscreen";
    fullscreenModal.classList.remove("opacity-0", "pointer-events-none");
    fullscreenModal.classList.add("opacity-100");
    if (activeFullscreenInterval) clearInterval(activeFullscreenInterval);
    activeFullscreenInterval = setInterval(() => {
      const redactedFeed = document.getElementById("redactedFeed");
      if (redactedFeed && redactedFeed.src) modalFeed.src = redactedFeed.src;
    }, 100);
  });
}

if (btnCloseModal) {
  btnCloseModal.addEventListener("click", () => {
    fullscreenModal.classList.remove("opacity-100");
    fullscreenModal.classList.add("opacity-0", "pointer-events-none");
    if (activeFullscreenInterval) {
      clearInterval(activeFullscreenInterval);
      activeFullscreenInterval = null;
    }
  });
}
`;

js = js + "\n" + wireStr;
fs.writeFileSync("e:/SIH-171/popup/popup.js", js, "utf8");
console.log("Wired fullscreen buttons");

