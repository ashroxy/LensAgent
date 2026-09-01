const { chromium } = require('playwright');
const fs = require('fs');

function chromeMockScript(vaultData) {
  const vault = vaultData || { full_name:'John Doe', email:'john@example.com', phone:'+919876543210', address:'123 Main St', city:'Mumbai', state:'Maharashtra', pincode:'400001', dob:'1990-01-01', gender:'Male' };
  return '(function(){const VAULT=Object.assign({},' + JSON.stringify(vault) + ');window.__TEST_VAULT=VAULT;window.chrome={runtime:{id:	,getURL:p=>chrome-extension://t/+p,lastError:null,sendMessage:(m,cb)=>{let r={status:OK};if(m.type===POPUP_VAULT_GET)r=Object.assign({},VAULT);else if(m.type===POPUP_VAULT_SET)VAULT[m.key]=m.value;else if(m.type===POPUP_VAULT_DELETE)delete VAULT[m.key];else if(m.type===POPUP_VAULT_FLUSH)Object.keys(VAULT).forEach(k=>delete VAULT[k]);else if(m.type===POPUP_GET_HISTORY)r=[{goal:A,state:FINISHED,steps:3,durationMs:5000,startedAt:Date.now()}];else if(m.type===POPUP_GET_SETTINGS)r={backendUrl:http://localhost:8000,maxSteps:30,captureQuality:75,serverTimeoutMs:10000,stabilizeDelayMs:250,humanizeInputs:true,enableDeltaFrames:true,enableAuditStream:true};else if(m.type===POPUP_GET_STATUS)r={state:IDLE};else if(m.type===POPUP_EXPORT_LOG)r={text:log};if(typeof cb===unction)cb(r);},onMessage:{addListener:()=>{},removeListener:()=>{}}},tabs:{query:(q,cb)=>cb([{id:1,title:T,url:https://example.com,active:false}]),create:()=>{},get:(id,cb)=>cb({id,url:https://example.com})},storage:{local:{get:(k,cb)=>{const o={};if(typeof k===string)o[k]=VAULT[k];else if(Array.isArray(k))k.forEach(x=>o[x]=VAULT[x]);else if(k&&typeof k===object)Object.entries(k).forEach(([x,d])=>o[x]=VAULT[x]!==undefined?VAULT[x]:d);else Object.assign(o,VAULT);cb(o);},set:(o,cb)=>{Object.assign(VAULT,o);cb&&cb();},remove:(k,cb)=>{if(typeof k===string)delete VAULT[k];else k.forEach(x=>delete VAULT[x]);cb&&cb();}},session:{get:(k,cb)=>cb({}),set:(o,cb)=>cb&&cb(),remove:(k,cb)=>cb&&cb(),clear:()=>{}}},action:{setBadgeText:()=>{},setBadgeBackgroundColor:()=>{}},debugger:{attach:()=>{},detach:()=>{},sendCommand:()=>{},onEvent:{addListener:()=>{},removeListener:()=>{}},onDetach:{addListener:()=>{},removeListener:()=>{}}},alarms:{create:()=>{},onAlarm:{addListener:()=>{}}}};})();';
}

async function run() {
  const browser = await chromium.launch({ channel: 'chrome' });
  const page = await browser.newPage({ viewport: { width: 400, height: 600 } });
  
  await page.addInitScript(chromeMockScript({}));
  await page.goto('http://localhost:8123/popup/popup.html');
  await page.waitForTimeout(1000);

  // 1. Show HITL Overlay
  await page.evaluate(() => {
    window.showHitlPrompt({
      correlationId: 123,
      question: "What is the OTP sent to your phone ending in 9012?",
      suggestedVaultKey: null
    });
  });
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'C:/Users/User/.gemini/antigravity/brain/16ddbe87-7e27-48fa-bc7e-9e681645d240/hitl-otp.png' });

  // Reset
  await page.evaluate(() => { document.getElementById('hitlOverlay').hidden = true; });

  // 2. Show HITL with Vault Suggestion
  await page.evaluate(() => {
    window.showHitlPrompt({
      correlationId: 124,
      question: "Please enter your permanent Pincode.",
      suggestedVaultKey: "VAULT_PINCODE"
    });
  });
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'C:/Users/User/.gemini/antigravity/brain/16ddbe87-7e27-48fa-bc7e-9e681645d240/hitl-vault.png' });

  // Reset
  await page.evaluate(() => { document.getElementById('hitlOverlay').hidden = true; });

  // 3. Show Action Approval Modal
  await page.evaluate(() => {
    window.showApprovalPrompt({
      correlationId: 125,
      context: "Agent wants to confirm the payment of ?500.",
      detail: "Clicking this button will finalize the transaction on your behalf."
    });
  });
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'C:/Users/User/.gemini/antigravity/brain/16ddbe87-7e27-48fa-bc7e-9e681645d240/approval.png' });

  await browser.close();
  console.log('Done screenshots');
}
run().catch(console.error);
