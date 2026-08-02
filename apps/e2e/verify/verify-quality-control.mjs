/**
 * The independent quality inspection, THROUGH THE BROWSER — slice 9 (`2.txt` §563).
 *
 * 🔴 THE RULE IS ABOUT WHO, SO THIS DRIVES THREE IDENTITIES:
 *
 *   · a technician  — did the work, and may not inspect ANY repair (the ROLE half)
 *   · the owner     — may inspect, but is refused on cards THEY worked on
 *                     (the IDENTITY half)
 *   · a supervisor  — the independent inspector who can actually complete one
 *
 * A single-identity run would exercise the form and skip both halves of the only
 * rule this slice exists for.
 *
 * ⚠️ AND IT READS THE VERDICT BACK. "Submitted" is a claim; the row is the
 * evidence. A refused write matches zero rows and raises nothing, so every
 * decision here is followed by a reload.
 *
 * 🔴 IT CONSUMES ITS FIXTURE, AND THAT IS WHY THE SEED STEP IS NOT OPTIONAL.
 * Section 6 PASSES an inspection, and a passed repair leaves the queue by
 * design — so the second run of the day found an empty queue and reported two
 * failures that were not defects. That is the harness measuring the residue of
 * its own previous run, a shape this repository has paid for before.
 *
 * The alternative — not completing an inspection — would be worse: completing
 * one is the only thing that proves a verdict reaches the database.
 *
 *   bash scripts/seed-qc-fixture.sh      # ← REQUIRED before each run
 *   node verify/verify-quality-control.mjs
 *
 * DEV ONLY — localhost, real Keycloak sign-in.
 */
import { chromium } from '@playwright/test';

const WORKSHOP = process.env['WORKSHOP_WEB_URL'] ?? 'http://localhost:3001';
const PASSWORD = process.env['DEV_USER_PASSWORD'] ?? 'Change_me_locally1!';

/** The three routes, one per role tree. All already in the approved navigation. */
const DEFAULT_ROUTE = '/repair-services/quality-control';
const OWNER_ROUTE = '/repair-control/quality-control';
const MANAGER_ROUTE = '/repair-control/quality-control-queue';

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
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 1100 } });
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

/** Switches the active role, then lands on `route`. Returns whether it took. */
async function switchRoleTo(page, role, route) {
  const sw = page.locator('#aw-role-switcher');
  if ((await sw.count()) === 0) return false;
  await sw.selectOption(role).catch(() => undefined);
  await page.waitForTimeout(3000);
  await page.goto(`${WORKSHOP}${route}`, { waitUntil: 'load' });
  await page.waitForTimeout(1200);
  return (await page.locator('#aw-role-switcher').inputValue().catch(() => '')) === role;
}

const bodyText = async (page) => (await page.locator('body').textContent()) ?? '';

try {
  // ═══ 1. the screen exists on the DEFAULT tree ════════════════════════════
  console.log('\n1. supervisor@ — the §34 default tree route');
  // The supervisor resolves to a nav id with no tree of its own, so it falls
  // back to the DEFAULT tree. That is where the dedicated QC inspector lands too.
  const sup = await signIn('supervisor@autoworkshop.local', DEFAULT_ROUTE);
  const supHtml = await sup.page.content();
  const supBody = await bodyText(sup.page);

  check(
    'the session is real',
    supHtml.includes('Sign out') && !supHtml.includes('Not signed in'),
    'NOT SIGNED IN — everything below would fail for the wrong reason',
  );
  check('the page renders — no server-side exception', !/server-side exception/i.test(supBody));
  check(
    'the Quality Control heading resolved on the DEFAULT tree',
    (await sup.page.getByRole('heading', { name: /Quality[- ]Control/i }).count()) > 0,
    sup.page.url(),
  );
  check('it is the real screen, not the catch-all placeholder', !/not built yet/i.test(supBody));

  const hasQueue = /Awaiting inspection|Inspection open|Nothing is waiting/i.test(supBody);
  check('the queue rendered one of its real states', hasQueue, supBody.slice(0, 200));

  // ═══ 2. §563's question is actually on screen ════════════════════════════
  console.log('\n2. the inspector can see what they are being asked to verify');
  const hasCards = /Awaiting inspection|Inspection open/i.test(supBody);
  if (hasCards) {
    check(
      'the ORIGINAL COMPLAINT is shown — §563 asks whether it was addressed',
      /original complaint/i.test(supBody),
      'an inspector cannot verify a complaint they cannot see',
    );
  } else {
    console.log('        (queue empty on this database — complaint display not exercised)');
  }

  // ═══ 3. THE ROLE HALF — a technician may not inspect ═════════════════════
  console.log('\n3. technician@ — the ROLE half of §563');
  const tech = await signIn('technician@autoworkshop.local', DEFAULT_ROUTE);
  const techBody = await bodyText(tech.page);
  check(
    'the technician session is real, so the refusal is about the ROLE',
    (await tech.page.content()).includes('Sign out'),
  );
  check(
    'a technician gets NO way to start or submit an inspection',
    !/Start inspection/i.test(techBody) && !/Submit inspection result/i.test(techBody),
    'A TECHNICIAN WAS OFFERED A QUALITY-CONTROL CONTROL',
  );
  console.log(
    `        (refusal layer: ${
      /Quality[- ]Control/i.test(techBody) ? 'screen — read-only with an explanation' : 'navigation gate 404'
    })`,
  );

  // ═══ 4. THE IDENTITY HALF — you cannot inspect your own work ═════════════
  console.log('\n4. admin@ — the IDENTITY half: refused on a repair THEY worked on');
  //
  // 🔴 THE IDENTITY MUST ISOLATE THE IDENTITY HALF, AND CHOOSING IT WRONG MAKES
  // THE CHECK VACUOUS. This ran against `owner@` first and reported "this
  // identity did not work on a queued repair" — so the most important rule in
  // the slice was never exercised in the browser at all, while the run still
  // said 13/13.
  //
  // `admin@` is the right one, verified against the database: it holds
  // `platform_administrator`, which MAY inspect, and it IS recorded on a repair
  // currently in the queue. So the role half admits it and only the identity
  // half can refuse — which is exactly the isolation this check needs. Driving a
  // technician here would prove nothing, because the role half refuses them
  // first and masks the rule under test.
  const worker = await signIn('admin@autoworkshop.local', DEFAULT_ROUTE);
  const workerBody = await bodyText(worker.page);

  check(
    'the worker-inspector reaches the screen',
    /Quality[- ]Control/i.test(workerBody),
    worker.page.url(),
  );
  check(
    'the queue is not empty, or this check would prove nothing',
    /Awaiting inspection|Inspection open/i.test(workerBody),
    'no repairs queued — the identity half cannot be observed',
  );
  check(
    'a repair they worked on is EXPLAINED, naming §563',
    /worked on this repair/i.test(workerBody) &&
      /independent check/i.test(workerBody),
    `expected the independence explanation. First 300 chars: ${workerBody.slice(0, 300)}`,
  );
  check(
    'and they are NOT offered a Start inspection button for it',
    !/Start inspection/i.test(workerBody),
    'A USER WHO DID THE WORK WAS OFFERED AN INSPECTION CONTROL',
  );

  // ═══ 5. the owner and manager tree routes both resolve ═══════════════════
  console.log('\n5. all three role-tree routes resolve');
  // owner@ defaults to platform_administrator (strongest by ROLE_PRECEDENCE),
  // which resolves to the DEFAULT tree — so reaching the §46 owner route means
  // switching role first. That is the real flow for a person holding both.
  const owner = await signIn('owner@autoworkshop.local', '/home/dashboard');
  const ownerTreeOk = await switchRoleTo(owner.page, 'workshop_owner', OWNER_ROUTE);
  check(
    'the §46 OWNER route resolves for workshop_owner',
    ownerTreeOk && /Quality[- ]Control/i.test(await bodyText(owner.page)),
    `switched=${ownerTreeOk} url=${owner.page.url()}`,
  );

  const mgr = await signIn('manager@autoworkshop.local', MANAGER_ROUTE);
  const mgrBody = await bodyText(mgr.page);
  check(
    'the §47 MANAGER route resolves — note the different slug',
    /Quality[- ]Control/i.test(mgrBody),
    `the manager tree says "quality-control-queue"; url=${mgr.page.url()}`,
  );
  check('the manager page renders cleanly', !/server-side exception/i.test(mgrBody));

  // ═══ 6. THE HAPPY PATH, END TO END ═══════════════════════════════════════
  console.log('\n6. supervisor@ — opens an inspection and records a verdict');
  //
  // `supervisor@` is independent of every queued repair (verified against the
  // database), so this is the one identity that can complete the flow. Without
  // this section every check above would be satisfied by a screen that renders
  // correctly and cannot actually inspect anything.
  const insp = await signIn('supervisor@autoworkshop.local', DEFAULT_ROUTE);
  const start = insp.page.getByRole('button', { name: /Start inspection/i }).first();

  if ((await start.count()) === 0) {
    check(
      'an independent inspector is offered a Start inspection button',
      false,
      'no startable repair in the queue — the happy path could not be exercised',
    );
  } else {
    await start.click();
    await insp.page.waitForTimeout(3500);
    await insp.page.reload({ waitUntil: 'load' });
    await insp.page.waitForTimeout(1500);

    const opened = await bodyText(insp.page);
    check(
      'the inspection opened and is held by THIS inspector',
      /Inspection open/i.test(opened) && /yours/i.test(opened),
      opened.slice(0, 250),
    );
    check(
      'both §563 questions are asked, separately',
      // Matched against the legends the form actually renders — "Has the
      // original complaint been addressed?" and "Was a new defect introduced by
      // the repair?". The first version of this check looked for "new defect was
      // introduced", which the screen never says.
      /original complaint been addressed/i.test(opened) &&
        /new defect introduced/i.test(opened),
      'one combined pass/fail control would make "fixed it but broke something else" unsayable',
    );
    check(
      'there is NO pass/fail control — the verdict is derived',
      !/\bMark as passed\b|\bPass\b\s*\/\s*\bFail\b/i.test(opened),
    );

    // 🔴 THE DERIVED VERDICT, SHOWN BEFORE SUBMITTING. Answer "yes" then "yes"
    // — complaint fixed, but a new defect — which must read as a FAIL even
    // though the first answer is positive.
    await insp.page.locator('input[name="complaintAddressed"][value="true"]').check();
    await insp.page.locator('input[name="newDefectFound"][value="true"]').check();
    await insp.page.waitForTimeout(400);
    const verdict = await insp.page.locator('[data-testid="qc-derived-verdict"]').textContent();
    check(
      'complaint fixed + new defect reads as a FAIL, not a pass',
      /FAIL/i.test(verdict ?? ''),
      `derived verdict said: ${verdict}`,
    );

    // Now record a genuine pass and prove it PERSISTS.
    await insp.page.locator('input[name="newDefectFound"][value="false"]').check();
    await insp.page.waitForTimeout(400);
    const passVerdict = await insp.page.locator('[data-testid="qc-derived-verdict"]').textContent();
    check('and complaint fixed + no new defect reads as a PASS', /PASS/i.test(passVerdict ?? ''));

    await insp.page.fill('#notes', 'verify-qc: checked on the ramp.');
    await insp.page.getByRole('button', { name: /Submit inspection result/i }).click();
    await insp.page.waitForTimeout(3500);

    // ⚠️ READ BACK. A refused write matches zero rows and raises nothing, so
    // the confirmation message is not evidence. A passed repair LEAVES the
    // queue, so its disappearance is what proves the row changed.
    await insp.page.reload({ waitUntil: 'load' });
    await insp.page.waitForTimeout(1500);
    const after = await bodyText(insp.page);
    check(
      'the passed repair LEFT the queue — the verdict really landed',
      !/yours/i.test(after),
      'the inspection is still shown as open, so the decision did not persist',
    );
  }

  await sup.ctx.close();
  await tech.ctx.close();
  await worker.ctx.close();
  await owner.ctx.close();
  await mgr.ctx.close();
  await insp.ctx.close();
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
