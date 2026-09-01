-const fs = require('fs');
let js = fs.readFileSync('e:/SIH-171/popup/popup.js', 'utf8');

const oldBlock =       let input;
      if (field.type === "select") {
        input = document.createElement("select");
        const opt1 = document.createElement("option"); opt1.value = ""; opt1.textContent = field.placeholder;
        const opt2 = document.createElement("option"); opt2.value = "Male"; opt2.textContent = "Male";
        const opt3 = document.createElement("option"); opt3.value = "Female"; opt3.textContent = "Female";
        const opt4 = document.createElement("option"); opt4.value = "Other"; opt4.textContent = "Other";
        input.appendChild(opt1); input.appendChild(opt2); input.appendChild(opt3); input.appendChild(opt4);
      } else {
        input = document.createElement("input");
        input.type = field.type;
        input.placeholder = field.placeholder;
      }
      
      input.id = \ault_\\;
      input.className = "neu-recessed w-full rounded-xl px-4 py-3 text-body-md text-primary font-bold border-none outline-none";;

const newBlock =       let input;
      if (field.type === "select") {
        input = document.createElement("select");
        input.className = "neu-recessed w-full rounded-xl px-4 py-3 text-body-md text-primary font-bold border-none outline-none appearance-none bg-transparent cursor-pointer";
        const opt1 = document.createElement("option"); opt1.value = ""; opt1.textContent = field.placeholder;
        const opt2 = document.createElement("option"); opt2.value = "Male"; opt2.textContent = "Male";
        const opt3 = document.createElement("option"); opt3.value = "Female"; opt3.textContent = "Female";
        const opt4 = document.createElement("option"); opt4.value = "Other"; opt4.textContent = "Other";
        input.appendChild(opt1); input.appendChild(opt2); input.appendChild(opt3); input.appendChild(opt4);
        const icon = document.createElement("span");
        icon.className = "material-symbols-outlined absolute right-3 pointer-events-none text-on-surface-variant";
        icon.textContent = "expand_more";
        // icon will be appended after input
        input.id = \ault_\\;
        inner.appendChild(input);
        inner.appendChild(icon);
      } else {
        input = document.createElement("input");
        input.type = field.type;
        input.placeholder = field.placeholder;
        input.id = \ault_\\;
        input.className = "neu-recessed w-full rounded-xl px-4 py-3 text-body-md text-primary font-bold border-none outline-none";
        inner.appendChild(input);
      };

js = js.replace(oldBlock, newBlock);
js = js.replace('inner.appendChild(input);', ''); // Remove the old appendChild since it's now handled
fs.writeFileSync('e:/SIH-171/popup/popup.js', js, 'utf8');
