/**
 * The repair variation screen, THROUGH THE BROWSER — slice 7b (`07.txt` §14).
 *
 * 🔴 THE RULE THIS SCREEN MAKES VISIBLE is §3766 step 12: "the technician pauses
 * chargeable additional work until approval is received." A technician cannot
 * pause on a rule whose state they cannot see, so the assertions below are about
 * the AUTHORISATION being stated in words — not merely about the page rendering.
 *
 * Drives THREE identities, because the flow is a relay:
 *   · technician — RAISES, and must be told they cannot review their own
 *   · supervisor — reviews internally, sends, records the answer
 *   · owner      — the tree route added with this screen
 *
 *   node verify/verify-variation-screen.mjs
 *
 * DEV ONLY — localhost, real Keycloak sign-in.
 */
import { chromium } from '@playwright/test';

const WORKSHOP = process.env['WORKSHOP_WEB_URL'] ?? 'http://localhost:3001';
const PASSWORD = process.env['DEV_USER_PASSWORD'] ?? 'Change_me_locally1!';

const TECH_ROUTE = '/record-work/variation-requests';
const DEFAULT_ROUTE = '/solution-and-approval/variations';
const OWNER_ROUTE = '/repair-control/variations';

// Distinctive per run, so a pass can never be residue from a previous one.
const STAMP = `VAR-${Date.now().toString(36).toUpperCase()}`;

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
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 1200 } });
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
  await page.goto(`${WORKSHOP}${landing}`, { waitUntil: 'load' });
  return { ctx, page };
}

const bodyText = async (page) => (await page.locator('body').textContent()) ?? '';

try {
  // ═══ 1. the technician's route ═══════════════════════════════════════════
  console.log('\n1. technician@ — the §49 route, where variations are RAISED');
  const tech = await signIn('technician@autoworkshop.local', TECH_ROUTE);
  const techBody = await bodyText(tech.page);

  check(
    'the session is real',
    (await tech.page.content()).includes('Sign out'),
    'NOT SIGNED IN — everything below would fail for the wrong reason',
  );
  check('the page renders — no server-side exception', !/server-side exception/i.test(techBody));
  check(
    'the Variation Requests heading resolved',
    (await tech.page.getByRole('heading', { name: /Variation/i }).count()) > 0,
    tech.page.url(),
  );
  check('it is the real screen, not the catch-all placeholder', !/not built yet/i.test(techBody));
  check(
    'the raise section is present — a technician must be able to record what they found',
    /Found additional work/i.test(techBody),
  );

  // ═══ 2. the chargeable warning is live, before submitting ════════════════
  console.log('\n2. the screen says what a chargeable variation means BEFORE it is raised');
  const canRaise = (await tech.page.locator('#additionalCost').count()) > 0;
  if (!canRaise) {
    console.log('        (no repair in progress — the raise form is not offered)');
    check(
      'and the reason is stated rather than the section being blank',
      /No repair is currently in progress/i.test(techBody),
      'a technician who cannot raise one must be told why',
    );
  } else {
    await tech.page.fill('#additionalCost', '0');
    await tech.page.waitForTimeout(300);
    const free = await tech.page.locator('[data-testid="variation-chargeable-note"]').textContent();
    check('a zero cost reads as NO CHARGE', /No charge/i.test(free ?? ''), free ?? '');

    await tech.page.fill('#additionalCost', '450');
    await tech.page.waitForTimeout(300);
    const paid = await tech.page.locator('[data-testid="variation-chargeable-note"]').textContent();
    check(
      'a positive cost warns DO NOT START and names the approval',
      /CHARGEABLE/i.test(paid ?? '') && /do not start/i.test(paid ?? ''),
      paid ?? '',
    );

    // ═══ 3. raise it, and read it back ═════════════════════════════════════
    console.log('\n3. raising one, and reading it back');
    await tech.page.fill('#newFinding', `${STAMP} offside drop link worn`);
    await tech.page.fill('#additionalWork', 'Replace offside drop link.');
    await tech.page.getByRole('button', { name: /Raise variation/i }).click();
    await tech.page.waitForTimeout(3500);
    await tech.page.reload({ waitUntil: 'load' });
    await tech.page.waitForTimeout(1500);

    const after = await bodyText(tech.page);
    check('the variation SURVIVED a reload — it really landed', after.includes(STAMP), STAMP);
    check(
      '🔴 it says NOT AUTHORISED, in words',
      /NOT AUTHORISED/i.test(after) && /do not start this work/i.test(after),
      'the one thing this screen exists to make visible',
    );

    // 🔴 §3792's independence, on screen.
    check(
      'the raiser is told somebody ELSE must review it',
      /you raised this/i.test(after) && /independent/i.test(after),
      'the technician was not told why they cannot move it themselves',
    );
    check(
      'and is offered NO review or decision control',
      !/Review and send to the customer/i.test(after) &&
        !/Record the customer/i.test(after),
      'A RAISER WAS OFFERED THE REVIEW CONTROL FOR THEIR OWN VARIATION',
    );
  }

  // ═══ 4. the supervisor CAN review it ═════════════════════════════════════
  console.log('\n4. supervisor@ — the reviewer, on the §34 default route');
  const sup = await signIn('supervisor@autoworkshop.local', DEFAULT_ROUTE);
  const supBody = await bodyText(sup.page);
  check('the supervisor reaches the screen', /Variations/i.test(supBody), sup.page.url());

  if (supBody.includes(STAMP)) {
    check(
      'the supervisor IS offered the review control for a variation they did not raise',
      /Review and send to the customer/i.test(supBody),
      'the independent reviewer got no control — the flow would be stuck',
    );
  } else {
    console.log('        (the new variation is not in this viewer scope — review not exercised)');
  }

  // ═══ 5. the owner/manager route added with this screen ═══════════════════
  console.log('\n5. the §46/§47 route added by the navigation audit');
  const owner = await signIn('owner@autoworkshop.local', '/home/dashboard');
  const sw = owner.page.locator('#aw-role-switcher');
  if ((await sw.count()) > 0) {
    await sw.selectOption('workshop_owner').catch(() => undefined);
    await owner.page.waitForTimeout(3000);
  }
  await owner.page.goto(`${WORKSHOP}${OWNER_ROUTE}`, { waitUntil: 'load' });
  await owner.page.waitForTimeout(1200);
  const ownerBody = await bodyText(owner.page);
  check(
    'the §46 owner route resolves — it did not exist before this slice',
    /Variations/i.test(ownerBody) && !/not built yet/i.test(ownerBody),
    owner.page.url(),
  );
  check(
    'and "Variations" is in the owner navigation, not just reachable by URL',
    (await owner.page.getByRole('link', { name: /^Variations$/i }).count()) > 0,
    'the entry is missing from the menu — the original complaint shape',
  );

  await tech.ctx.close();
  await sup.ctx.close();
  await owner.ctx.close();
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
