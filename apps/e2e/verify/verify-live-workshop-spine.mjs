/** The workshop spine, on PRODUCTION, as the real owner. Creates real data. */
import { chromium } from '@playwright/test';
/**
 * ⚠️ CREDENTIALS COME FROM THE ENVIRONMENT. They used to be written into this
 * file, and this repository is PUBLIC — so the owner's live Keycloak password
 * was readable by anyone who found the repo, and remains in git history for
 * anyone who looks. Removing it here stops it spreading; only ROTATING it
 * actually fixes the exposure.
 *
 * Run with:
 *   LIVE_OWNER_EMAIL=... LIVE_OWNER_PASSWORD=... node verify/verify-live-workshop-spine.mjs
 */
const LIVE_USER = process.env['LIVE_OWNER_EMAIL'] ?? '';
const LIVE_PASSWORD = process.env['LIVE_OWNER_PASSWORD'] ?? '';
if (!LIVE_USER || !LIVE_PASSWORD) {
  // SKIPPED, not failed. Without a session every authenticated check reports
  // "that screen is not in your menu", which reads as a product defect and is
  // not one — exactly the false conclusion this repo has recorded four times.
  console.log('SKIPPED: set LIVE_OWNER_EMAIL and LIVE_OWNER_PASSWORD. Nothing was attempted.');
  process.exit(0);
}

const L='https://autoworkshop.aiappinvent.com';
let pass=0,fail=0; const fails=[];
const check=(n,ok,d='')=>{ if(ok)pass++; else{fail++;fails.push(`${n}${d?` — ${d}`:''}`);} };
const b=await chromium.launch();
const c=await b.newContext({viewport:{width:1440,height:1000}});
const p=await c.newPage();
await p.goto(`${L}/home/dashboard`,{waitUntil:'load',timeout:180000});
const si=p.getByRole('link',{name:'Sign in'}).first();
if(await si.count()){await si.click();const pr=p.getByRole('button',{name:/Keycloak/i});
await pr.waitFor({state:'visible',timeout:120000});await pr.click({noWaitAfter:true});
await p.waitForURL(/openid-connect\/auth/,{timeout:180000});
await p.fill('#username', LIVE_USER); await p.fill('#password', LIVE_PASSWORD);
await p.click('#kc-login',{noWaitAfter:true});await p.waitForURL(u=>!/openid-connect/.test(u.toString()),{timeout:180000});}
await p.goto(`${L}/home/dashboard`,{waitUntil:'networkidle',timeout:180000});
await p.waitForTimeout(2500);
check('signed in on production',/Sign out/i.test(await p.content()));

const stamp=Date.now();
// 1. customer
await p.goto(`${L}/customers-and-vehicles/register-customer`,{waitUntil:'networkidle',timeout:180000});
await p.waitForTimeout(1500);
if(await p.locator('#displayName').count()){
  await p.fill('#displayName',`Kofi Mensah ${stamp}`);
  if(await p.locator('#phone').count()) await p.fill('#phone','+233 24 111 2222');
  await p.getByRole('button',{name:/Register|Save|Add/i}).first().click();
  await p.waitForTimeout(7000);
  check('customer registered',/Registered/i.test(await p.content()));
} else check('customer form present',false,'no #displayName');

// 2. vehicle
await p.goto(`${L}/customers-and-vehicles/register-vehicle`,{waitUntil:'networkidle',timeout:180000});
await p.waitForTimeout(1500);
if(await p.locator('#registrationNumber').count()){
  await p.fill('#registrationNumber',`GT ${String(stamp).slice(-4)}-25`);
  await p.selectOption('#customerId',{index:0});
  await p.selectOption('#makeId',{index:0});
  await p.getByRole('button',{name:/Register|Save|Add/i}).first().click();
  await p.waitForTimeout(7000);
  check('vehicle registered',/Registered/i.test(await p.content()));
} else check('vehicle form present',false,'no #registrationNumber');

// 3. job card — the thing that was impossible before today
await p.goto(`${L}/workshop-operations/vehicle-intake`,{waitUntil:'networkidle',timeout:180000});
await p.waitForTimeout(1500);
check('create-job-card screen renders',(await p.locator('#vehicleId').count())>0,
      (await p.locator('main').innerText()).slice(0,200));
if(await p.locator('#vehicleId').count()){
  await p.selectOption('#vehicleId',{index:0});
  await p.fill('#complaint',`Live smoke ${stamp}: knocking from the front over bumps, worse when cold.`);
  await p.selectOption('#priority','high').catch(()=>{});
  await p.getByRole('button',{name:/Open the job card/i}).click();
  await p.waitForTimeout(8000);
  check('job card opened on production',/Opened job card/i.test(await p.content()));
}

// 4. it is on the owner's board
await p.goto(`${L}/workshop-operations/job-cards`,{waitUntil:'networkidle',timeout:180000});
await p.waitForTimeout(2000);
const board=await p.locator('body').innerText();
check('the card is on the board',/JC-\d+/.test(board),'no job number on the list');

// 5. the dashboard counts it
await p.goto(`${L}/home/dashboard`,{waitUntil:'networkidle',timeout:180000});
await p.waitForTimeout(2000);
const dash=await p.locator('body').innerText();
check('the dashboard is no longer all zeroes',!/ACTIVE JOB CARDS\s*\n\s*0/i.test(dash),
      dash.slice(dash.indexOf('ACTIVE JOB CARDS'),dash.indexOf('ACTIVE JOB CARDS')+40));

console.log(`\n${pass} passed · ${fail} failed`);
if(fails.length){console.log('FAILURES:');fails.forEach(f=>console.log('  ✗',f));}
await p.screenshot({path:'live-final.png',fullPage:true});
await b.close();
process.exit(fail===0?0:1);
