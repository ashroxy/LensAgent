/**
 * Focused test: vault tab scrollability & bottom-button reachability,
 * plus the "below history button" sidebar check.
 */
const { chromium } = require('playwright');

function chromeMockScript(vaultData) {
  const vault = vaultData || { full_name:'John Doe', email:'john@example.com', phone:'+919876543210', address:'123 Main St', city:'Mumbai', state:'Maharashtra', pincode:'400001', dob:'1990-01-01', gender:'Male' };
  return `(function(){const VAULT=Object.assign({},${JSON.stringify(vault)});window.__TEST_VAULT=VAULT;window.chrome={runtime:{id:'t',getURL:p=>'chrome-extension://t/'+p,lastError:null,sendMessage:(m,cb)=>{let r={status:'OK'};if(m.type==='POPUP_VAULT_GET')r=Object.assign({},VAULT);else if(m.type==='POPUP_VAULT_SET')VAULT[m.key]=m.value;else if(m.type==='POPUP_VAULT_DELETE')delete VAULT[m.key];else if(m.type==='POPUP_VAULT_FLUSH')Object.keys(VAULT).forEach(k=>delete VAULT[k]);else if(m.type==='POPUP_GET_HISTORY')r=[{goal:'A',state:'FINISHED',steps:3,durationMs:5000,startedAt:Date.now()}];else if(m.type==='POPUP_GET_SETTINGS')r={backendUrl:'http://localhost:8000',maxSteps:30,captureQuality:75,serverTimeoutMs:10000,stabilizeDelayMs:250,humanizeInputs:true,enableDeltaFrames:true,enableAuditStream:true};else if(m.type==='POPUP_GET_STATUS')r={state:'IDLE'};else if(m.type==='POPUP_EXPORT_LOG')r={text:'log'};if(typeof cb==='function')cb(r);},onMessage:{addListener:()=>{},removeListener:()=>{}}},tabs:{query:(q,cb)=>cb([{id:1,title:'T',url:'https://example.com',active:false}]),create:()=>{},get:(id,cb)=>cb({id,url:'https://example.com'})},storage:{local:{get:(k,cb)=>{const o={};if(typeof k==='string')o[k]=VAULT[k];else if(Array.isArray(k))k.forEach(x=>o[x]=VAULT[x]);else if(k&&typeof k==='object')Object.entries(k).forEach(([x,d])=>o[x]=VAULT[x]!==undefined?VAULT[x]:d);else Object.assign(o,VAULT);cb(o);},set:(o,cb)=>{Object.assign(VAULT,o);cb&&cb();},remove:(k,cb)=>{if(typeof k==='string')delete VAULT[k];else k.forEach(x=>delete VAULT[x]);cb&&cb();}},session:{get:(k,cb)=>cb({}),set:(o,cb)=>cb&&cb(),remove:(k,cb)=>cb&&cb(),clear:()=>{}}},action:{setBadgeText:()=>{},setBadgeBackgroundColor:()=>{}},debugger:{attach:()=>{},detach:()=>{},sendCommand:()=>{},onEvent:{addListener:()=>{},removeListener:()=>{}},onDetach:{addListener:()=>{},removeListener:()=>{}}},alarms:{create:()=>{},onAlarm:{addListener:()=>{}}}};})();`;
}

async function run() {
  const browser = await chromium.launch({ channel: 'chrome' });
  const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
  await page.addInitScript(chromeMockScript({}));
  await page.goto('http://localhost:8123/popup/popup.html');
  await page.waitForTimeout(1200);

  await page.click('.nav-btn[data-tab="vault"]');
  await page.waitForTimeout(300);

  const vault = await page.evaluate(() => {
    const contentScroll = document.querySelector('.content-scroll');
    const sec = document.querySelector('#tab-vault');
    const saveBtn = document.getElementById('saveVaultBtn');
    const flushBtn = document.getElementById('flushVaultBtn');
    const scroll = contentScroll;
    return {
      contentScrollScrollHeight: scroll.scrollHeight,
      contentScrollClientHeight: scroll.clientHeight,
      scrollable: scroll.scrollHeight > scroll.clientHeight,
      overflowY: getComputedStyle(scroll).overflowY,
      sectionTop: sec.getBoundingClientRect().top,
      saveBtnRect: saveBtn.getBoundingClientRect().toJSON ? null : null,
      saveBtnVisible: saveBtn.getBoundingClientRect(),
      contentScrollRect: scroll.getBoundingClientRect(),
    };
  });
  console.log('VAULT SCROLL:', JSON.stringify(vault, null, 2));

  // Try to scroll the content-scroll to reveal the bottom buttons
  await page.evaluate(() => {
    const sc = document.querySelector('.content-scroll');
    sc.scrollTo(0, sc.scrollHeight);
  });
  await page.waitForTimeout(200);
  const afterScroll = await page.evaluate(() => {
    const saveBtn = document.getElementById('saveVaultBtn').getBoundingClientRect();
    const flushBtn = document.getElementById('flushVaultBtn').getBoundingClientRect();
    return {
      saveBtnVisible: saveBtn.top < window.innerHeight && saveBtn.bottom > 0,
      saveBtnRect: { top: Math.round(saveBtn.top), bottom: Math.round(saveBtn.bottom) },
      flushBtnRect: { top: Math.round(flushBtn.top), bottom: Math.round(flushBtn.bottom) },
      winH: window.innerHeight,
    };
  });
  console.log('AFTER SCROLL:', JSON.stringify(afterScroll, null, 2));

  // Sidebar vault button position
  const sidebar = await page.evaluate(() => {
    const navBtns = Array.from(document.querySelectorAll('.nav-btn'));
    return navBtns.map(b => ({ tab: b.dataset.tab, top: Math.round(b.getBoundingClientRect().top), bottom: Math.round(b.getBoundingClientRect().bottom), outerText: b.innerText }));
  });
  console.log('SIDEBAR BTNS:', JSON.stringify(sidebar, null, 2));

  console.log('ERRORS:', errors);
  await browser.close();
}

run().catch((e) => { console.error('FATAL:', e); process.exit(1); });
