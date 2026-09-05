function lum(hex) {
  const rgb = hex.replace("#", "").match(/.{2}/g).map(x => parseInt(x, 16) / 255);
  const a = rgb.map(c => c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  return 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2];
}

function ratio(hex1, hex2) {
  const l1 = lum(hex1);
  const l2 = lum(hex2);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

const colors = [
  ["#ffffff", "Pure White background"],
  ["#f7f9fd", "Neumorphic flat/recessed background"],
  ["#e5edff", "Neumorphic button gradient start"],
  ["#c0d3fa", "Neumorphic button gradient end"],
  ["#dce1eb", "Shadow light grey"],
  ["#1a1c1e", "Dark text surface"]
];

console.log("=== WCAG 2.1 AA Non-text Contrast (Requirement: >= 3.0:1) ===");
for (const [bg, desc] of colors) {
  const r = ratio("#305f9f", bg);
  const pass = r >= 3.0 ? "PASS" : "FAIL";
  console.log(`#305f9f vs ${bg} (${desc}): ${r.toFixed(2)}:1 [${pass}]`);
}
