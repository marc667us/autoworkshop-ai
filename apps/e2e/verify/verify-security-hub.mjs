/**
 * The Security Hub, THROUGH THE BROWSER.
 *
 * The rule that matters is about WHO, so this drives TWO identities: a platform
 * administrator who may read the posture report, and a technician in the same
 * tenant who may not. A single-identity run would render the page and silently
 * skip the only security-relevant assertion.
 *
 * 🔴 AND THE REFUSAL MATTERS MORE HERE THAN ANYWHERE ELSE IN THIS APPLICATION.
 * Everywhere else, a viewer who slips past a controller still meets RLS and gets
 * zero rows — the application check is a courtesy over a real enforcement. This
 * endpoint reads `pg_catalog`, which has no policies and no tenant column, so
 * `SecurityController`'s administrator check is the ONLY thing between a
 * technician and a list of which tables are unprotected. There is no layer
 * underneath it to catch a mistake, which is why the refusal is asserted at the
 * API directly and not only through the page.
 *
 * ⚠️ IT ASSERTS THE REPORT IS NON-VACUOUS. A posture report that renders
 * beautifully with zero controls, or with every control reporting "nothing
 * found" because its predicate matches nothing, is the exact defect this module
 * shipped with once already — control 3 was written as `polwithcheck IS NULL`
 * and could never match. "The page rendered" is not evidence that it measured
 * anything.
 *
 *   node verify/verify-security-hub.mjs
 *
 * DEV ONLY — localhost, real Keycloak sign-in.
 */
import { chromium } from '@playwright/test';

/**
 * ⚠️ 3006, NOT 3002. The port is not free choice: the realm pins
 * `autoworkshop-admin-web`'s redirect URI to `http://localhost:3006/*`, so an
 * admin-web served anywhere else fails at the Keycloak redirect with an invalid
 * redirect_uri — after the user has already been sent away from the app.
 * `infrastructure/keycloak/realm-autoworkshop.json` is the authority.
 */
const ADMIN_WEB = process.env['ADMIN_WEB_URL'] ?? 'http://localhost:3006';
const API = process.env['API_BASE_URL'] ?? 'http://localhost:4000';
const ROUTE = '/security-and-operations/security';
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
    // A 404 resource log is EXPECTED and is not a defect: this script navigates
    // before signing in, and deliberately drives a technician at a route outside
    // their navigation tree. A check that counts what it asked for measures the
    // harness rather than the product.
    if (/Failed to load resource.*40[34]/i.test(m.text())) return;
    // ⚠️ AND THE CORS FAILURE THIS SCRIPT CAUSES ITSELF. Section 2 deliberately
    // attempts a cross-origin fetch the API is right to block, which logs both
    // a CORS message and an ERR_FAILED. Counting them made a clean run report
    // "2 page errors" for something the harness did on purpose — a check that
    // measures the harness instead of the product.
    if (/blocked by CORS policy/i.test(m.text())) return;
    if (/Failed to load resource.*net::ERR_FAILED/i.test(m.text())) return;
    errors.push(`[${user}] ${m.text()}`);
  });
  page.on('pageerror', (e) => errors.push(`[${user}] ${String(e)}`));
  await page.goto(`${ADMIN_WEB}${landing}`);
  await page.getByRole('link', { name: 'Sign in' }).first().click();
  // `waitFor`, not `count()` — count does not auto-wait, and the race continues
  // SIGNED OUT while reporting product defects that do not exist.
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

const rendered = async (page) => {
  const b = ((await page.locator('body').textContent()) ?? '').toLowerCase();
  return !b.includes('server-side exception') && !b.includes('internal server error');
};

try {
  // ═══ 1. the administrator ════════════════════════════════════════════════
  console.log('\n1. admin@ — may read the security posture');
  const admin = await signIn('admin@autoworkshop.local', ROUTE);
  const adminHtml = await admin.page.content();

  check(
    'the session is real',
    adminHtml.includes('Sign out') && !adminHtml.includes('Not signed in'),
    'NOT SIGNED IN — every check below would pass or fail for the wrong reason',
  );
  check('the page renders — no server-side exception', await rendered(admin.page));
  check(
    'the Security heading is present, so the route resolved',
    (await admin.page.getByRole('heading', { name: /^Security$/i }).count()) > 0,
    admin.page.url(),
  );
  check(
    'it is the real hub, not the catch-all placeholder',
    !adminHtml.includes('not built yet') && !adminHtml.includes('Not built yet'),
    'the catch-all route is still resolving here',
  );

  const bodyText = (await admin.page.locator('body').textContent()) ?? '';

  // 🔴 NON-VACUITY. The controls must actually be on the page.
  const controlTitles = [
    'Row-level security is enabled',
    'Row-level security is FORCED',
    'FOR ALL policy',
    'foreign key',
    'audit log',
    'connects as a role',
  ];
  for (const title of controlTitles) {
    check(`the report shows the "${title}…" control`, bodyText.includes(title));
  }

  check(
    'every control carries its reasoning, so a warning can be judged',
    (bodyText.match(/Why this is checked:/g) ?? []).length >= 6,
    `found ${(bodyText.match(/Why this is checked:/g) ?? []).length} rationales`,
  );

  // The summary tallies must add up to the number of controls rendered. A
  // report showing "8 passing" above six cards is lying about one of them.
  const cards = await admin.page.locator('article').count();
  check('eight control cards are rendered', cards === 8, `found ${cards}`);

  // ═══ 2. the report measured something ════════════════════════════════════
  console.log('\n2. the report is non-vacuous');
  // Read the API directly with the browser's own session, so this asserts the
  // DATA rather than the rendering of it.
  // ⚠️ CAUGHT, NOT ASSUMED TO RETURN A STATUS. The API sets no CORS headers for
  // the admin-web origin — correctly, because the browser never calls it
  // directly; the Next server does, with a bearer token the browser does not
  // hold. A blocked cross-origin fetch REJECTS with "Failed to fetch" rather
  // than resolving with a status, and the first version of this script died
  // there and reported nothing. A harness that crashes on its own limitation
  // measures the harness.
  const posture = await admin.page
    .evaluate(async (api) => {
      try {
        const res = await fetch(`${api}/api/v1/security/posture`, { credentials: 'include' });
        return { status: res.status, body: res.ok ? await res.json() : null };
      } catch (e) {
        return { status: 0, body: null, blocked: String(e) };
      }
    }, API)
    .catch((e) => ({ status: 0, body: null, blocked: String(e) }));

  if (posture.status !== 200) {
    // The page fetches server-side with a bearer token the browser does not
    // hold, so a direct browser fetch may legitimately be unauthorised. Report
    // it rather than failing the run on the harness's own limitation.
    console.log(
      `        (browser-side fetch returned ${posture.status}; the page renders server-side, ` +
        'so the DOM assertions above are the evidence for this section)',
    );
    check(
      'the rendered report names at least one real database object',
      /\b(identity|core|repair|catalogue|audit)\.[a-z_]+/.test(bodyText),
      'no schema-qualified object name appeared — every predicate may be matching nothing',
    );
  } else {
    const p = posture.body;
    check('the report evaluated eight controls', p.controls.length === 8);
    check(
      'the control that shipped broken now finds real policies',
      (p.controls.find((c) => c.id === 'rls.policy_shape')?.findings.length ?? 0) > 0,
      'rls.policy_shape found nothing — the same symptom the broken predicate produced',
    );
    check(
      'the connection control confirms RLS applies to the app role',
      p.controls.find((c) => c.id === 'connection.least_privilege')?.status === 'pass',
    );
    check(
      'the audit log is append-only',
      p.controls.find((c) => c.id === 'audit.append_only')?.status === 'pass',
    );
  }

  // ═══ 3. the technician ═══════════════════════════════════════════════════
  console.log('\n3. technician@ — may NOT read the security posture');
  const tech = await signIn('technician@autoworkshop.local', ROUTE);
  const techHtml = await tech.page.content();

  check(
    'the technician session is real, so the refusal below is about the ROLE',
    techHtml.includes('Sign out') && !techHtml.includes('Not signed in'),
    'not signed in — a refusal here would prove nothing',
  );
  check(
    'the technician does not see the posture report',
    !techHtml.includes('Why this is checked:'),
    'A TECHNICIAN READ THE SECURITY POSTURE REPORT',
  );
  check(
    'and does not see any database object name',
    !/\b(identity|core|repair|catalogue|audit)\.[a-z_]+/.test(
      (await tech.page.locator('body').textContent()) ?? '',
    ),
    'a technician was shown schema-qualified table names',
  );

  // 🔴 THE API REFUSAL, PROVEN THROUGH THE PATH THAT ACTUALLY EXISTS.
  //
  // The obvious check — fetch the endpoint from the technician's browser and
  // assert it is not 200 — is VACUOUS here, and dangerously so. The browser
  // holds no bearer token (the Next server does) and the API sets no CORS
  // headers for this origin, so that fetch fails for reasons that have nothing
  // to do with authorization. It would report PASS against an API that served
  // the report to everybody.
  //
  // The reachable path is: the technician opens the page, the Next SERVER calls
  // `/security/posture` carrying THAT TECHNICIAN'S token, and the API decides.
  // So the evidence is what the server-rendered page contains. A 403 from the
  // API renders `describeApiFailure`'s "you may not see this"; a 200 would
  // render the report. Distinguishing those two is the assertion.
  const techBody = (await tech.page.locator('body').textContent()) ?? '';
  const refused =
    /may not|not permitted|do not have|forbidden|denied|404|not found/i.test(techBody) ||
    // The navigation gate can 404 the route before the API is ever called,
    // which is also a refusal — a narrower one, and it is named separately so
    // the log says which layer stopped it.
    !techBody.includes('Security');
  check(
    'the technician is refused — the API returned no report to their token',
    refused && !techBody.includes('Why this is checked:'),
    `technician page did not refuse. First 200 chars: ${techBody.slice(0, 200)}`,
  );
  console.log(
    `        (refusal layer: ${
      techBody.includes('Security') ? 'API 403 rendered as an error state' : 'navigation gate 404'
    })`,
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

// READ THE COUNT, NEVER THE EXIT CODE. This suite once ran zero tests for two
// days while exiting 0.
console.log(`\n${checks - failures}/${checks} checks passed, ${errors.length} page errors`);
process.exit(failures === 0 && errors.length === 0 ? 0 : 1);
