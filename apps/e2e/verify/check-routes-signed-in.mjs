import { chromium } from '@playwright/test';
const BASE='http://localhost:3001';
const PASSWORD='Change_me_locally1!';
const WHO = process.argv[2] ?? 'technician@autoworkshop.local';
const ROUTES = process.argv.slice(3);
const b = await chromium.launch();
const c = await b.newContext({ viewport:{width:1280,height:900} });
const p = await c.newPage();
await p.goto(`${BASE}/home/dashboard`);
await p.getByRole('link',{name:'Sign in'}).first().click();
const pv = p.getByRole('button',{name:/Keycloak/i}); if (await pv.count()) await pv.first().click({noWaitAfter:true});
await p.waitForURL(/openid-connect\/auth/,{timeout:60000});
await p.fill('#username', WHO); await p.fill('#password', PASSWORD);
await p.click('#kc-login',{noWaitAfter:true});
await p.waitForURL(u=>!/openid-connect/.test(u.toString()),{timeout:90000});
console.log(`\nSigned in as ${WHO}\n`);
for (const r of ROUTES) {
  const res = await p.goto(`${BASE}${r}`, { waitUntil:'load' });
  const h1 = (await p.locator('h1').first().textContent().catch(()=>null)) ?? '(no h1)';
  const body = (await p.locator('main').innerText().catch(()=>'')).slice(0,60).replace(/\n/g,' ');
  console.log(`${String(res?.status()).padEnd(4)} ${r.padEnd(42)} ${h1.trim().slice(0,32).padEnd(34)} ${body}`);
}
await b.close();
