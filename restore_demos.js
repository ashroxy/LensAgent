const fs = require('fs');

// 1. Update popup.html
let html = fs.readFileSync('popup/popup.html', 'utf8');

const demoBtns = `
                    <!-- DEMO BUTTONS -->
                    <div class="flex gap-4 w-full mt-4">
                        <button id="demoHitlBtn" class="flex-1 neu-btn px-4 py-2 rounded-lg font-label-md text-[11px] text-tertiary uppercase flex items-center justify-center gap-1">
                            <span class="material-symbols-outlined text-[16px]">chat</span> Demo HITL
                        </button>
                        <button id="demoApproveBtn" class="flex-1 neu-btn px-4 py-2 rounded-lg font-label-md text-[11px] text-warning uppercase flex items-center justify-center gap-1">
                            <span class="material-symbols-outlined text-[16px]">warning</span> Demo Auth
                        </button>
                    </div>`;

// Insert the demo buttons after the Start/Halt buttons div
// In the current layout, it looks like:
//                         <button id="stopBtn" class="neu-btn text-error px-6 py-3 rounded-xl font-label-md text-label-md flex items-center gap-2 uppercase tracking-wider" disabled>
//                             <span class="material-symbols-outlined">stop</span> Halt
//                         </button>
//                     </div>
//                 </div>
// 
//                 <!-- Video Feeds -->

html = html.replace(
  '<span class="material-symbols-outlined">stop</span> Halt\n                        </button>\n                    </div>\n                </div>',
  '<span class="material-symbols-outlined">stop</span> Halt\n                        </button>\n                    </div>' + demoBtns + '\n                </div>'
);

fs.writeFileSync('popup/popup.html', html, 'utf8');

// 2. Update popup.js
let js = fs.readFileSync('popup/popup.js', 'utf8');

const demoJS = `
// ==========================================
// DEMO BUTTON INJECTIONS
// ==========================================
const demoHitlBtn = document.getElementById("demoHitlBtn");
if (demoHitlBtn) {
  demoHitlBtn.addEventListener("click", () => {
    document.getElementById("hitlOverlay").hidden = false;
    document.getElementById("hitlQuestion").textContent = "Please enter your permanent Pincode.";
    document.getElementById("hitlVaultKeyLabel").hidden = false;
    document.getElementById("hitlVaultKey").textContent = "VAULT_PINCODE";
  });
}

const demoApproveBtn = document.getElementById("demoApproveBtn");
if (demoApproveBtn) {
  demoApproveBtn.addEventListener("click", () => {
    document.getElementById("approvalOverlay").hidden = false;
    document.getElementById("approvalContext").textContent = "Agent wants to confirm the payment of ₹500.";
    document.getElementById("approvalDetail").textContent = "Clicking Approve will finalize the transaction on your behalf.";
  });
}
`;

// Only add if it doesn't already exist
if (!js.includes('demoHitlBtn.addEventListener')) {
  js += '\n' + demoJS;
  fs.writeFileSync('popup/popup.js', js, 'utf8');
}

console.log('Successfully injected demo buttons and logic!');
