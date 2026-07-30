import { chromium } from '@playwright/test';
const BASE='http://localhost:3001', PASSWORD='Change_me_locally1!';
const b=await chromium.launch(); const c=await b.newContext(); const p=await c.newPage();
await p.goto(`${BASE}/home/dashboard`);
await p.getByRole('link',{name:'Sign in'}).first().click();
let kc=p.getByRole('button',{name:/Keycloak/i}); if(await kc.count()) await kc.first().click({noWaitAfter:true});
await p.waitForURL(/openid-connect\/auth/,{timeout:60000});
await p.fill('#username','technician@autoworkshop.local'); await p.fill('#password',PASSWORD);
await p.click('#kc-login',{noWaitAfter:true});
await p.waitForURL(u=>!/openid-connect/.test(u.toString()),{timeout:90000});
await p.goto(`${BASE}/api/auth/signin`,{waitUntil:'load'});
kc=p.getByRole('button',{name:/Keycloak/i}); if(await kc.count()) await kc.first().click({noWaitAfter:true});
await p.waitForURL(/openid-connect/,{timeout:60000}).catch(()=>{});
await p.waitForTimeout(1500);
console.log('URL:', p.url().slice(0,120));
console.log('--- visible text ---');
console.log((await p.locator('body').innerText()).slice(0,600));
console.log('--- links ---');
for (const l of await p.locator('a').all()) {
  const t=(await l.textContent()??'').trim(); const h=await l.getAttribute('href');
  if(t) console.log(` "${t}" -> ${(h??'').slice(0,80)}`);
}
console.log('--- inputs ---');
for (const i of await p.locator('input').all()) console.log(` id=${await i.getAttribute('id')} name=${await i.getAttribute('name')} type=${await i.getAttribute('type')}`);
await b.close();
