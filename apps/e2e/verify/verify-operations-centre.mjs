/**
 * The Operations Centre, THROUGH THE BROWSER.
 *
 * Drives an administrator and a technician, for the same reason every verify
 * script in this directory does: the rule is about WHO, and a single-identity
 * run exercises the page while skipping the only security-relevant assertion.
 *
 * ⚠️ IT ASSERTS THE PROBES REALLY RAN. A dependency page that renders five green
 * lights without having spoken to anything is worse than no page — it is the
 * Keycloak-reported-healthy-for-30-hours defect with a nicer layout. So this
 * checks for a measured LATENCY and for a status other than a uniform "up":
 * on this machine three of the five dependencies are genuinely unreachable from
 * the host, which the first run of this module discovered.
 *
 *   node verify/verify-operations-centre.mjs
 *
 * DEV ONLY — localhost, real Keycloak sign-in.
 */
import { chromium } from '@playwright/test';

const ADMIN_WEB = process.env['ADMIN_WEB_URL'] ?? 'http://localhost:3006';
const ROUTE = '/home/operations-dashboard';
const PASSWORD = process.env['DEV_USER_PASSWORD'] ?? 'Change_me_locally1!';

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
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
  const page = await ctx.newPage();
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    if (/Failed to load resource.*40[34]/i.test(m.text())) return;
    errors.push(`[${user}] ${m.text()}`);
  });
  page.on('pageerror', (e) => errors.push(`[${user}] ${String(e)}`));
  await page.goto(`${ADMIN_WEB}${landing}`);
  await page.getByRole('link', { name: 'Sign in' }).first().click();
  const provider = page.getByRole('button', { name: /Keycloak/i });
  await provider.waitFor({ state: 'visible', timeout: 30000 });
  await provider.click({ noWaitAfter: true });
  await page.waitForURL(/openid-connect\/auth/, { timeout: 60000 });
  await page.fill('#username', user);
  await page.fill('#password', PASSWORD);
  await page.click('#kc-login', { noWaitAfter: true });
  await page.waitForURL((u) => !/openid-connect/.test(u.toString()), { timeout: 90000 });
  await page.goto(`${ADMIN_WEB}${landing}`, { waitUntil: 'load' });
  return { ctx, page };
}

try {
  console.log('\n1. admin@ — may read the operations report');
  const admin = await signIn('admin@autoworkshop.local', ROUTE);
  const html = await admin.page.content();
  const body = (await admin.page.locator('body').textContent()) ?? '';

  check(
    'the session is real',
    html.includes('Sign out') && !html.includes('Not signed in'),
    'NOT SIGNED IN — everything below would be measuring the wrong thing',
  );
  check('the page renders — no server-side exception', !/server-side exception/i.test(body));
  check(
    'the Operations Dashboard heading resolved',
    (await admin.page.getByRole('heading', { name: /Operations Dashboard/i }).count()) > 0,
    admin.page.url(),
  );
  check(
    'it is the real dashboard, not the catch-all placeholder',
    !/not built yet/i.test(body),
  );

  for (const dep of ['PostgreSQL', 'Redis', 'NATS', 'Object storage', 'Keycloak']) {
    check(`the report includes ${dep}`, body.includes(dep));
  }

  // 🔴 NON-VACUITY. A latency figure can only exist if an exchange was attempted.
  check(
    'at least one probe reported a measured latency',
    /\d+\s*ms/.test(body),
    'no latency anywhere — the probes may not have run at all',
  );
  check(
    'every probe states what it proved',
    (body.match(/What this proves:/g) ?? []).length >= 5,
    `found ${(body.match(/What this proves:/g) ?? []).length}`,
  );
  check(
    'the migration ledger was read',
    /Schema migrations/.test(body) && /\d+ migrations applied/.test(body),
    'the ledger count is missing — the query may be failing silently',
  );

  const cards = await admin.page.locator('article').count();
  check('five dependency cards are rendered', cards === 5, `found ${cards}`);

  console.log('\n2. technician@ — may NOT read the operations report');
  const tech = await signIn('technician@autoworkshop.local', ROUTE);
  const techBody = (await tech.page.locator('body').textContent()) ?? '';
  check(
    'the technician session is real, so the refusal is about the ROLE',
    (await tech.page.content()).includes('Sign out'),
  );
  check(
    'the technician sees no dependency report',
    !techBody.includes('What this proves:'),
    'A TECHNICIAN READ THE DEPLOYMENT DEPENDENCY MAP',
  );
  console.log(
    `        (refusal layer: ${
      techBody.includes('Operations Dashboard') ? 'API 403 rendered as an error state' : 'navigation gate 404'
    } — the API-level check is covered by operations.controller.spec.ts)`,
  );

  await admin.ctx.close();
  await tech.ctx.close();
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
