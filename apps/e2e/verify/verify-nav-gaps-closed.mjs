/**
 * The seven navigation gaps, closed — proposal Option A, owner-approved.
 *
 * `docs/03-ui-ux/NAVIGATION-GAPS-PROPOSAL.md` recorded seven places where a role
 * was permitted by the API to do something and had no way to reach it by
 * clicking. This proves each is now reachable BY THE ROLE THAT WAS BLOCKED —
 * which is the only thing that matters, and is not what `next build` showed.
 *
 * ⚠️ A ROUTE THAT COMPILES IS NOT A ROUTE A ROLE CAN REACH. `requireNavRoute`
 * 404s anything outside the viewer's tree, so a page can build perfectly and
 * still be invisible to the person it was added for. That gap is the whole
 * subject of this file, so checking the build would be checking the wrong layer.
 *
 * ⚠️ AND IT CHECKS THE MENU, NOT ONLY THE URL. The original complaint was "I
 * cannot find it", not "the URL 404s" — so each case asserts the entry is
 * present in the rendered navigation as well as the page resolving.
 *
 *   node verify/verify-nav-gaps-closed.mjs
 *
 * DEV ONLY — localhost, real Keycloak sign-in.
 */
import { chromium } from '@playwright/test';

const WORKSHOP = process.env['WORKSHOP_WEB_URL'] ?? 'http://localhost:3001';
const PASSWORD = process.env['DEV_USER_PASSWORD'] ?? 'Change_me_locally1!';

/**
 * The seven gaps. `role` is the membership to resolve as — `switchTo` is set
 * where the identity holds several and would otherwise default to a stronger one.
 */
const CASES = [
  { gap: 'customer/owner', user: 'owner@autoworkshop.local', switchTo: 'workshop_owner',
    route: '/customers-and-vehicles/register-customer', menu: 'Register Customer' },
  { gap: 'vehicle/owner', user: 'owner@autoworkshop.local', switchTo: 'workshop_owner',
    route: '/customers-and-vehicles/register-vehicle', menu: 'Register Vehicle' },
  { gap: 'customer/manager', user: 'manager@autoworkshop.local',
    route: '/requests-and-reception/register-customer', menu: 'Register Customer' },
  { gap: 'vehicle/manager', user: 'manager@autoworkshop.local',
    route: '/requests-and-reception/register-vehicle', menu: 'Register Vehicle' },
  // The DEFAULT tree — where platform_administrator, supervisor, QC inspector,
  // storekeeper and cashier all land because their nav ids have no tree.
  { gap: 'customer/default', user: 'admin@autoworkshop.local',
    route: '/customer-reception/register-customer', menu: 'Register Customer' },
  { gap: 'vehicle/default', user: 'admin@autoworkshop.local',
    route: '/customer-reception/register-vehicle', menu: 'Register Vehicle' },
  { gap: 'pricing/default', user: 'admin@autoworkshop.local',
    route: '/settings/pricing', menu: 'Pricing' },
];

let failures = 0;
let checks = 0;
function check(label, ok, detail) {
  checks += 1;
  if (ok) console.log(`  PASS  ${label}`);
  else {
    failures += 1;
    console.log(`  FAIL  ${label}`);
    if (detail !== undefined) console.log(`        ${detail}`);
  }
}

const browser = await chromium.launch();
const errors = [];

async function signIn(user, landing) {
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 1100 } });
  const page = await ctx.newPage();
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    if (/Failed to load resource.*40[134]/i.test(m.text())) return;
    errors.push(`[${user}] ${m.text()}`);
  });
  page.on('pageerror', (e) => errors.push(`[${user}] ${String(e)}`));
  await page.goto(`${WORKSHOP}${landing}`);
  await page.getByRole('link', { name: 'Sign in' }).first().click();
  const provider = page.getByRole('button', { name: /Keycloak/i });
  await provider.waitFor({ state: 'visible', timeout: 30000 });
  await provider.click({ noWaitAfter: true });
  await page.waitForURL(/openid-connect\/auth/, { timeout: 60000 });
  await page.fill('#username', user);
  await page.fill('#password', PASSWORD);
  await page.click('#kc-login', { noWaitAfter: true });
  await page.waitForURL((u) => !/openid-connect/.test(u.toString()), { timeout: 90000 });
  return { ctx, page };
}

try {
  // One session per identity, reused across that identity's cases.
  const sessions = new Map();

  for (const c of CASES) {
    console.log(`\n${c.gap}  —  ${c.user}${c.switchTo ? ` as ${c.switchTo}` : ''}`);

    let s = sessions.get(`${c.user}|${c.switchTo ?? ''}`);
    if (!s) {
      s = await signIn(c.user, '/home/dashboard');
      if (c.switchTo) {
        // ⚠️ SIGNED IN AT THE DASHBOARD FIRST. A 404 page carries no shell, so
        // there is no role switcher on it — landing straight on the target route
        // would leave nothing to switch with.
        const sw = s.page.locator('#aw-role-switcher');
        if ((await sw.count()) > 0) {
          await sw.selectOption(c.switchTo).catch(() => undefined);
          await s.page.waitForTimeout(3000);
        }
      }
      sessions.set(`${c.user}|${c.switchTo ?? ''}`, s);
    }

    await s.page.goto(`${WORKSHOP}${c.route}`, { waitUntil: 'load' });
    await s.page.waitForTimeout(1000);
    const body = (await s.page.locator('body').textContent()) ?? '';

    check(
      `${c.route} RESOLVES for this role`,
      !/not found|404/i.test(body.slice(0, 400)) && !/server-side exception/i.test(body),
      `still 404 or crashing. url=${s.page.url()}`,
    );

    // 🔴 THE MENU, NOT JUST THE URL. "I cannot find it" is the complaint this
    // whole change answers; a reachable URL nobody is shown fixes nothing.
    check(
      `"${c.menu}" appears in the navigation`,
      (await s.page.getByRole('link', { name: new RegExp(`^${c.menu}$`, 'i') }).count()) > 0,
      'the page resolves but the menu never offers it — the original complaint',
    );
  }

  // ═══ THE MIRROR: not offered to roles that could not use it ══════════════
  //
  // 🔴 CODEX FOUND THIS AS A DEFECT IN THE FIRST VERSION OF THIS VERY CHANGE.
  // The DEFAULT tree is the fallback for FIVE roles, but only
  // `platform_administrator` among them holds `CAN_CREATE_CUSTOMER`. Added
  // ungated, the entry offered the other four a menu item that could only ever
  // be refused — the exact mirror of the gap being closed, and it falsified the
  // "grants nothing new" claim the proposal was approved on.
  //
  // Fixed by gating both DEFAULT entries on `organization.admin`, which among
  // those five roles exactly one holds. Asserted here rather than assumed,
  // because a permission key that silently stopped matching would restore the
  // defect with every check above still green.
  console.log('\nmirror — supervisor@ must NOT be offered what it cannot use');
  const sup = await signIn('supervisor@autoworkshop.local', '/home/dashboard');
  const supBody = (await sup.page.locator('body').textContent()) ?? '';
  check(
    'the supervisor session is real, so an absence means something',
    (await sup.page.content()).includes('Sign out'),
  );
  for (const label of ['Register Customer', 'Register Vehicle', 'Pricing']) {
    check(
      `"${label}" is NOT offered to a supervisor`,
      (await sup.page.getByRole('link', { name: new RegExp(`^${label}$`, 'i') }).count()) === 0,
      `a supervisor was offered "${label}", which the API would refuse`,
    );
  }
  // CONTROL: the supervisor still has a working menu, so the four checks above
  // are not passing because the navigation failed to render at all.
  check(
    'and the supervisor still has a navigation to speak of',
    (await sup.page.getByRole('link').count()) > 5,
    `only ${await sup.page.getByRole('link').count()} links — the menu may be broken`,
  );
  await sup.ctx.close();

  for (const s of sessions.values()) await s.ctx.close();
} finally {
  await browser.close();
}

if (errors.length > 0) {
  console.log('\nconsole/page errors:');
  for (const e of errors) console.log(`  ${e}`);
}

// READ THE COUNT, NEVER THE EXIT CODE.
console.log(`\n${checks - failures}/${checks} checks passed, ${errors.length} page errors`);
process.exit(failures === 0 && errors.length === 0 ? 0 : 1);
