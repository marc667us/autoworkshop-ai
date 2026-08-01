/**
 * The workshop pricing screen, THROUGH THE BROWSER — Slice D.
 *
 * Drives TWO identities, because the rule is about WHO: the owner who may set
 * the rates, and a technician in the same workshop who may not. A
 * single-identity run would exercise the form and skip the only
 * security-relevant assertion — the failure mode recorded against three earlier
 * slices in this repository.
 *
 * 🔴 AND IT READS THE VALUE BACK. "Saved" is a claim. Migration 029's policies
 * refuse a write by matching ZERO ROWS, which raises nothing — so a screen that
 * says "Saved" proves precisely nothing on its own. Every save here is followed
 * by a reload and a check of what the field actually contains.
 *
 *   node verify/verify-pricing-screen.mjs
 *
 * DEV ONLY — localhost, real Keycloak sign-in.
 */
import { chromium } from '@playwright/test';

const WORKSHOP = process.env['WORKSHOP_WEB_URL'] ?? 'http://localhost:3001';
const ROUTE = '/workshop-management/pricing-rules';
const PASSWORD = process.env['DEV_USER_PASSWORD'] ?? 'Change_me_locally1!';

// A distinctive rate per run, so a pass can never be residue from a previous
// one. Slice 3b lost time to a harness measuring what it had left behind.
const RATE = String(100 + (Date.now() % 800) / 10);

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
    if (/Failed to load resource.*40[134]/i.test(m.text())) return;
    errors.push(`[${user}] ${m.text()}`);
  });
  page.on('pageerror', (e) => errors.push(`[${user}] ${String(e)}`));
  await page.goto(`${WORKSHOP}${landing}`);
  await page.getByRole('link', { name: 'Sign in' }).first().click();
  // `waitFor`, not `count()` — count does not auto-wait and the run continues
  // SIGNED OUT, reporting product defects that do not exist.
  const provider = page.getByRole('button', { name: /Keycloak/i });
  await provider.waitFor({ state: 'visible', timeout: 30000 });
  await provider.click({ noWaitAfter: true });
  await page.waitForURL(/openid-connect\/auth/, { timeout: 60000 });
  await page.fill('#username', user);
  await page.fill('#password', PASSWORD);
  await page.click('#kc-login', { noWaitAfter: true });
  await page.waitForURL((u) => !/openid-connect/.test(u.toString()), { timeout: 90000 });
  await page.goto(`${WORKSHOP}${landing}`, { waitUntil: 'load' });
  return { ctx, page };
}

const valueOf = (page, id) => page.locator(`#${id}`).inputValue();

try {
  // ═══ 1. the owner ═════════════════════════════════════════════════════════
  console.log('\n1. owner@ — may set the rates');
  // ⚠️ LANDS ON THE DASHBOARD, NOT ON THE PRICING ROUTE. `requireNavRoute`
  // 404s a route outside the viewer's tree, and the 404 page carries NO SHELL —
  // so there is no role switcher on it to use. Signing in at a route this
  // identity can already reach is what makes the switch below possible.
  const owner = await signIn('owner@autoworkshop.local', '/home/dashboard');

  // 🔴 THE ROLE MUST BE SWITCHED FIRST, AND DISCOVERING THAT IS A FINDING.
  //
  // `owner@autoworkshop.local` holds THREE active memberships —
  // platform_administrator, workshop_owner and technician — and
  // `resolveTenantContext` defaults to the strongest by ROLE_PRECEDENCE, which
  // is platform_administrator. `navRoleFor('platform_administrator')` returns
  // undefined, resolving to the §34 DEFAULT tree, and that tree carries no
  // pricing entry at all. So this identity lands on a 404 and sees no form.
  //
  // That is not a harness problem, it is the product's behaviour: an owner who
  // also holds platform_administrator opens the app, finds no Pricing anywhere,
  // and concludes the feature does not exist. Recorded in
  // `.claude/CURRENT_TASK.md` as a navigation decision for the owner.
  //
  // Switching to `workshop_owner` here is the REAL user flow for that person,
  // not a workaround — and it exercises the role switcher on the way.
  const switcher = owner.page.locator('#aw-role-switcher');
  if ((await switcher.count()) > 0) {
    await switcher.selectOption('workshop_owner');
    // The switch re-resolves the context server-side and re-renders the shell.
    await owner.page.waitForTimeout(3000);
    await owner.page.goto(`${WORKSHOP}${ROUTE}`, { waitUntil: 'load' });
    await owner.page.waitForTimeout(1200);
  }
  check(
    'the active role is workshop_owner after switching',
    (await owner.page.locator('#aw-role-switcher').inputValue().catch(() => '')) === 'workshop_owner',
    'the switcher did not take — everything below would measure the wrong role',
  );

  const ownerHtml = await owner.page.content();

  check(
    'the session is real',
    ownerHtml.includes('Sign out') && !ownerHtml.includes('Not signed in'),
    'NOT SIGNED IN — everything below would fail for the wrong reason',
  );
  check(
    'the Pricing heading is present, so the route resolved',
    (await owner.page.getByRole('heading', { name: /^Pricing$/i }).count()) > 0,
    owner.page.url(),
  );
  check(
    'it is the real screen, not the catch-all placeholder',
    !/not built yet/i.test(await owner.page.locator('body').textContent()),
  );

  // Every field the API requires must be present, or the save below would fail
  // for a reason that has nothing to do with authorization.
  for (const id of [
    'currency',
    'defaultLabourRate',
    'taxName',
    'taxRatePercent',
    'defaultValidityDays',
  ]) {
    check(`the form has ${id}`, (await owner.page.locator(`#${id}`).count()) === 1);
  }

  check(
    'the owner may edit — the labour rate field is enabled',
    await owner.page.locator('#defaultLabourRate').isEnabled(),
    'the owner got a read-only form',
  );

  // ═══ 2. the save actually lands ═══════════════════════════════════════════
  console.log('\n2. the save reaches the database');
  await owner.page.fill('#defaultLabourRate', RATE);
  await owner.page.fill('#currency', 'GHS');
  await owner.page.fill('#taxName', 'VAT');
  await owner.page.fill('#taxRatePercent', '15');
  await owner.page.fill('#defaultValidityDays', '14');
  await owner.page.getByRole('button', { name: /Save pricing|Set pricing/i }).click();
  await owner.page.waitForTimeout(3500);

  const saidSaved = /Saved\./i.test((await owner.page.locator('body').textContent()) ?? '');
  check('the screen reports a save', saidSaved);

  // 🔴 THE READ-BACK. A refused write matches zero rows and raises nothing, so
  // the message above is not evidence. Only a reload is.
  await owner.page.reload({ waitUntil: 'load' });
  await owner.page.waitForTimeout(1200);
  const persisted = await valueOf(owner.page, 'defaultLabourRate');
  check(
    'the rate SURVIVED a reload — the row really changed',
    Number(persisted) === Number(RATE),
    `wrote ${RATE}, read back ${persisted}`,
  );
  check(
    'the "no pricing set" warning is gone once pricing exists',
    !/has no pricing set/i.test((await owner.page.locator('body').textContent()) ?? ''),
  );

  // ═══ 3. validation refuses an empty rate rather than writing zero ═════════
  console.log('\n3. an empty labour rate is refused, not read as zero');
  // 🔴 `Number('')` is 0. If the field were coerced anywhere along the path, a
  // cleared field would silently set the rate to zero and every later quotation
  // would price labour at nothing.
  await owner.page.fill('#defaultLabourRate', '');
  await owner.page.getByRole('button', { name: /Save pricing|Set pricing/i }).click();
  await owner.page.waitForTimeout(3000);

  // ⚠️ THE BROWSER REFUSES FIRST, AND THE FIRST VERSION OF THIS CHECK GOT THAT
  // WRONG. The input carries `required`, so native constraint validation blocks
  // the submit before the server action runs — there is no server message to
  // look for, and asserting one failed against correct behaviour.
  //
  // So the assertion is what actually holds: the field reports itself invalid,
  // and nothing was submitted. The API's own guard against `Number('') === 0`
  // is NOT proven here — it is proven by `pricing.spec.ts`, which calls
  // `parsePricingInput` with an empty string directly. Two layers, each tested
  // where it can actually be observed.
  const blockedByBrowser = await owner.page.evaluate(() => {
    const el = document.querySelector('#defaultLabourRate');
    return el instanceof HTMLInputElement ? !el.checkValidity() : false;
  });
  check(
    'clearing the rate is refused — the browser blocks the submit',
    blockedByBrowser,
    'the empty field was considered valid; the submit may have reached the server',
  );
  await owner.page.reload({ waitUntil: 'load' });
  await owner.page.waitForTimeout(1200);
  check(
    'and the stored rate is UNCHANGED — no zero was written',
    Number(await valueOf(owner.page, 'defaultLabourRate')) === Number(RATE),
    `expected ${RATE}, found ${await valueOf(owner.page, 'defaultLabourRate')}`,
  );

  // ═══ 4. the technician ════════════════════════════════════════════════════
  console.log('\n4. technician@ — may SEE the rates but not change them');
  const tech = await signIn('technician@autoworkshop.local', ROUTE);
  const techBody = (await tech.page.locator('body').textContent()) ?? '';
  check(
    'the technician session is real, so the refusal is about the ROLE',
    (await tech.page.content()).includes('Sign out'),
  );

  const techSeesForm = (await tech.page.locator('#defaultLabourRate').count()) === 1;
  if (techSeesForm) {
    // Reads are tenant-wide BY DESIGN: quotation.service.ts prices from these as
    // whichever role prepares the quotation, so the people who use the numbers
    // should see them.
    check(
      'the technician SEES the rate — reads are tenant-wide by design',
      Number(await valueOf(tech.page, 'defaultLabourRate')) === Number(RATE),
    );
    check(
      'but the field is DISABLED for them',
      await tech.page.locator('#defaultLabourRate').isDisabled(),
      'A TECHNICIAN GOT AN EDITABLE LABOUR RATE FIELD',
    );
    check(
      'and there is no save button',
      (await tech.page.getByRole('button', { name: /Save pricing|Set pricing/i }).count()) === 0,
    );
  } else {
    // The navigation gate 404s the route for this role. Also a refusal — a
    // narrower one — and named rather than counted as the same thing.
    check(
      'the technician is refused at the navigation gate (no form rendered)',
      !techBody.includes('Save pricing'),
    );
    console.log('        (refusal layer: navigation gate — pricing-rules is not in the technician tree)');
  }

  await owner.ctx.close();
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
