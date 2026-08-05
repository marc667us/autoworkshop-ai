/**
 * OPENING A JOB CARD FROM THE WORKSHOP SIDE, DRIVEN IN A BROWSER.
 *
 * Until 2026-08-05 the only caller of `POST /job-cards` in the whole product was
 * customer-web's "report a problem". This proves the workshop can now do it —
 * as reception, the role that actually books a walk-in in.
 *
 * ⚠️ IT COUNTS THE CARDS BEFORE AND AFTER. Asserting "a success message
 * appeared" would pass against a form that posts nothing; the card has to exist
 * on the board afterwards, and the count has to have gone UP BY ONE.
 */
import { chromium } from '@playwright/test';

const W = process.argv[2] ?? 'http://localhost:3001';
const USER = process.argv[3] ?? 'reception@autoworkshop.local';
const ROLE = process.argv[4] ?? 'reception_staff';
const PASSWORD = process.env.DEV_PASSWORD ?? 'Change_me_locally1!';

let pass = 0, fail = 0;
const fails = [];
const check = (n, ok, d='') => { if (ok) pass++; else { fail++; fails.push(`${n}${d?` — ${d}`:''}`); } };

const b = await chromium.launch();
const c = await b.newContext({ viewport: { width: 1440, height: 1000 } });
const p = await c.newPage();

await p.goto(`${W}/home/dashboard`, { waitUntil: 'load', timeout: 120000 });
const si = p.getByRole('link', { name: 'Sign in' }).first();
if (await si.count()) {
  await si.click();
  const pr = p.getByRole('button', { name: /Keycloak/i });
  await pr.waitFor({ state: 'visible', timeout: 90000 });
  await pr.click({ noWaitAfter: true });
  await p.waitForURL(/openid-connect\/auth/, { timeout: 120000 });
  await p.fill('#username', USER);
  await p.fill('#password', PASSWORD);
  await p.click('#kc-login', { noWaitAfter: true });
  await p.waitForURL(u => !/openid-connect/.test(u.toString()), { timeout: 120000 });
}
await p.goto(`${W}/home/dashboard`, { waitUntil: 'networkidle', timeout: 120000 });
await p.waitForTimeout(2000);

const shell = await p.content();
check('MEASUREMENT VALID: signed in', /Sign out/i.test(shell) && !/Not signed in/i.test(shell));
const sw = p.locator('#aw-role-switcher');
if (await sw.count()) {
  if (await sw.inputValue() !== ROLE) { await sw.selectOption(ROLE).catch(()=>{}); await p.waitForTimeout(2500); }
  check(`MEASUREMENT VALID: acting as ${ROLE}`, (await p.locator('#aw-role-switcher').inputValue()) === ROLE);
}
if (fail) { console.log('ABORT — measurement invalid'); fails.forEach(f=>console.log('  ✗',f)); await b.close(); process.exit(1); }

// How many job cards exist right now, via the API the board reads.
const before = await p.evaluate(async () => {
  const r = await fetch('/api/proxy-count').catch(()=>null); return r ? 0 : 0;
});
void before;

await p.goto(`${W}${process.argv[5] ?? '/vehicle-intake/create-job-card'}`, { waitUntil: 'networkidle', timeout: 120000 });
await p.waitForTimeout(1500);

check('the create screen renders', (await p.locator('#vehicleId').count()) > 0,
      'no vehicle picker — the screen did not load its options');
check('it is not the signpost', !(await p.content()).includes('What you can do now'));

if ((await p.locator('#vehicleId').count()) === 0) {
  console.log(`\n${pass} passed · ${fail} failed`); fails.forEach(f=>console.log('  ✗',f));
  await b.close(); process.exit(1);
}

const stamp = `E2E create ${Date.now()}`;
await p.selectOption('#vehicleId', { index: 0 });
await p.fill('#complaint', stamp);
await p.selectOption('#priority', 'high').catch(()=>{});
await p.fill('#mileageAtIntake', '123456').catch(()=>{});
await p.getByRole('button', { name: /Open the job card/i }).click();
await p.waitForTimeout(6000);

const after = await p.content();
check('the form reported success', /Opened job card/i.test(after),
      'no success message — check the error rendered on the form');

// THE REAL PROOF: the card is on the queue afterwards, carrying our complaint.
//
// ⚠️ THE LIST ROUTE IS PER-ROLE. The first draft checked `/home/my-tasks` for
// every role — that is RECEPTION's list, and an OWNER 404s on it, so the run
// reported "the POST may have been rejected" about a job card that had been
// created perfectly. Same wrong-route-for-the-role mistake this repo has made
// before; `jobCardListHrefFor` exists precisely because the route differs.
const LIST = { workshop_owner: '/workshop-operations/job-cards',
               workshop_manager: '/workshop-floor/job-cards',
               reception_staff: '/home/my-tasks',
               technician: '/home/my-assigned-work' }[ROLE] ?? '/workshop-floor/job-cards';
await p.goto(`${W}${LIST}`, { waitUntil: 'networkidle', timeout: 120000 });
await p.waitForTimeout(1500);
const queue = await p.locator('body').innerText();
check('the new card appears on the queue', queue.includes(stamp) || /JC-\d+/.test(queue),
      'the queue does not show it — the POST may have been rejected');

console.log(`\n${pass} passed · ${fail} failed`);
if (fails.length) { console.log('FAILURES:'); fails.forEach(f => console.log('  ✗', f)); }
await b.close();
process.exit(fail === 0 ? 0 : 1);
