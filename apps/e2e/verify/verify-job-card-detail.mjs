/**
 * The WEB job-card detail screen, THROUGH THE BROWSER — Phase 5, J1.
 *
 * 🔴 IT DRIVES FOUR IDENTITIES, AND THAT IS THE ENTIRE POINT.
 *
 * The fourteen job queues sit across five navigation trees that disagree about
 * where job cards live, and every page opens with `requireNavRoute`, which
 * 404s a route the viewer's own tree does not carry. So a single hardcoded
 * detail href would work perfectly for whoever the author happened to test as,
 * and 404 the technician and the receptionist on the primary action of the
 * screen they were just reading.
 *
 * That failure already happened here once, backwards: on 2026-08-02 a queue
 * check reported 1/14 because it drove every route as a platform administrator,
 * and the thirteen "failures" were thirteen CORRECT refusals. The lesson
 * written down that day was **drive each route as the role whose tree owns
 * it** — this script is that lesson executed.
 *
 * It also asserts the refusal in the other direction: a technician typing the
 * MANAGER's detail URL must still get nothing. If that passed, the per-role
 * href would be decoration rather than a rule.
 *
 *   node verify/verify-job-card-detail.mjs
 *
 * DEV ONLY — localhost, real Keycloak sign-in.
 */
import { chromium } from '@playwright/test';

const WORKSHOP = process.env['WORKSHOP_WEB_URL'] ?? 'http://localhost:3001';
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
    if (/Failed to load resource.*40[134]/i.test(m.text())) return;
    errors.push(`[${user}] ${m.text()}`);
  });
  page.on('pageerror', (e) => errors.push(`[${user}] ${String(e)}`));
  await page.goto(`${WORKSHOP}${landing}`);
  await page.getByRole('link', { name: 'Sign in' }).first().click();
  // `waitFor`, not `count()` — count does not auto-wait, and a run that
  // continues SIGNED OUT reports product defects that do not exist.
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

/** Switch the active role, for an identity holding several memberships. */
async function switchRole(page, role, landing) {
  const switcher = page.locator('#aw-role-switcher');
  if ((await switcher.count()) === 0) return false;
  await switcher.selectOption(role);
  await page.waitForTimeout(3000);
  await page.goto(`${WORKSHOP}${landing}`, { waitUntil: 'load' });
  await page.waitForTimeout(1000);
  return (await page.locator('#aw-role-switcher').inputValue().catch(() => '')) === role;
}

/**
 * Switch the active ORGANISATION by its visible name.
 *
 * 🔴 RECEPTION NEEDS THIS AND DISCOVERING THAT WAS A FINDING.
 * `reception@autoworkshop.local` holds memberships in TWO organisations —
 * Alpha Motors and Alpha Parts Supply — and lands on the parts supplier, which
 * owns no job cards. Their queue therefore renders "No open jobs", correctly.
 * Without this switch the run below would exercise an empty screen and report
 * a link defect that does not exist.
 */
async function switchOrganisation(page, name, landing) {
  const switcher = page.locator('#aw-org-switcher');
  if ((await switcher.count()) === 0) return false;
  await switcher.selectOption({ label: name });
  await page.waitForTimeout(3000);
  await page.goto(`${WORKSHOP}${landing}`, { waitUntil: 'load' });
  await page.waitForTimeout(1000);
  const chosen = await page
    .locator('#aw-org-switcher option:checked')
    .textContent()
    .catch(() => '');
  return (chosen ?? '').trim() === name;
}

/**
 * THE MAIN REGION'S TEXT, NEVER THE WHOLE BODY.
 *
 * 🔴 `body.textContent()` INCLUDES `<style>` AND `<script>` CONTENT. The first
 * version of this script tested the body for the substring "404" and matched a
 * hex colour in the theme's inline stylesheet — so it reported "the detail
 * screen did not render" about two pages that had rendered perfectly, while the
 * four checks immediately after it passed on the very same page.
 *
 * A loose pattern over text that is not page copy is not a check; it is a coin
 * toss that happens to be readable. Falls back to the body only for Next's
 * not-found page, which has no `main`.
 */
async function mainText(page) {
  const main = page.locator('main');
  if ((await main.count()) > 0) return (await main.textContent()) ?? '';
  return (await page.locator('body').textContent()) ?? '';
}

/**
 * The shared assertions for one identity: their queue links a job number, the
 * link goes to THEIR tree's route, and the detail screen really renders.
 *
 * Returns the detail URL it reached, so the caller can reuse it.
 */
async function openFromQueue(name, page, queueRoute, expectedBase) {
  console.log(`\n${name} — from ${queueRoute}`);

  await page.goto(`${WORKSHOP}${queueRoute}`, { waitUntil: 'load' });
  await page.waitForTimeout(800);

  const html = await mainText(page);
  check(
    `${name}: the session is real`,
    (await page.getByRole('button', { name: /Sign out/i }).count()) > 0 ||
      /Sign out/.test(await page.content()),
    'NOT SIGNED IN — every check below would fail for the wrong reason',
  );
  check(
    `${name}: ${queueRoute} resolved (not the catch-all)`,
    !/not built yet|scheduled for a later phase/i.test(html),
    page.url(),
  );

  /**
   * 🔴 PROVE THERE ARE ROWS BEFORE JUDGING THE LINK.
   *
   * The first version of this script asserted "the job number is a LINK" with
   * no such check, and reported TWO defects that did not exist: the owner's
   * queue filters to stages no seeded card was at, and reception lands on an
   * organisation that owns no job cards. Both screens were rendering their
   * empty state, correctly — and the harness called it "still plain text",
   * a confident and specific falsehood about code that was right.
   *
   * That is the same class of mistake this repository has now recorded three
   * times. An empty queue must be reported as an EMPTY QUEUE.
   */
  const rows = await page.locator('tbody tr').count();
  if (rows === 0) {
    check(
      `${name}: ${queueRoute} has at least one job card to open`,
      false,
      'the queue rendered its EMPTY STATE — nothing here is evidence about links either way. ' +
        'Seed a card at one of this queue\'s stages, or point this identity at a queue that has rows.',
    );
    return null;
  }

  // The job number must be a LINK now, not the plain text it used to be.
  const jobLink = page.getByRole('link', { name: /^JC-\d+$/ }).first();
  const linked = (await jobLink.count()) > 0;
  check(
    `${name}: the job number is a LINK (${rows} row${rows === 1 ? '' : 's'} on the queue)`,
    linked,
    'the queue has rows but no link — the primary action is dead',
  );
  if (!linked) return null;

  const href = await jobLink.getAttribute('href');
  check(
    `${name}: the link points into THEIR tree (${expectedBase})`,
    typeof href === 'string' && href.startsWith(`${expectedBase}/`),
    `href was ${href}, expected to start with ${expectedBase}/`,
  );

  await jobLink.click();
  await page.waitForURL((u) => /job-cards\/|my-assigned-work\/|my-tasks\//.test(u.toString()), {
    timeout: 30000,
  });
  await page.waitForTimeout(800);

  const detail = await mainText(page);
  check(
    `${name}: the detail screen rendered, not a refusal or the placeholder`,
    // No loose "404" test — see `mainText`. A refused route renders Next's
    // not-found page, which carries none of this screen's own copy, so the
    // presence of the section heading is the precise signal and the substring
    // was only ever noise.
    /Move this job on/.test(detail) && !/not built yet|scheduled for a later phase/i.test(detail),
    page.url(),
  );
  check(`${name}: it shows the complaint in full`, /Complaint/.test(detail));
  check(`${name}: it shows who the job is assigned to`, /Assigned to/.test(detail));
  check(
    `${name}: it names the records that live elsewhere rather than faking them`,
    /recorded on\s+their own screens|their own screens/i.test(detail),
  );
  // The back link must exist and point at a route this viewer can reach.
  const back = page.getByRole('link', { name: /Back to job cards/i }).first();
  check(`${name}: there is a way back`, (await back.count()) > 0);
  if ((await back.count()) > 0) {
    check(
      `${name}: the way back is into their own tree`,
      (await back.getAttribute('href')) === expectedBase,
      `back href was ${await back.getAttribute('href')}, expected ${expectedBase}`,
    );
  }

  return page.url();
}

try {
  // ═══ 1. platform administrator — the §34 DEFAULT tree ═════════════════════
  const admin = await signIn('admin@autoworkshop.local', '/home/dashboard');
  await openFromQueue(
    'platform_administrator',
    admin.page,
    '/home/tasks',
    '/workshop-floor/job-cards',
  );

  // ═══ 2. the owner — §46, a DIFFERENT route for the same screen ════════════
  const owner = await signIn('owner@autoworkshop.local', '/home/dashboard');
  // ⚠️ `owner@` defaults to platform_administrator by ROLE_PRECEDENCE and lands
  // on the DEFAULT tree. Switching is the real flow for that person, and
  // without it this would silently re-test identity 1.
  const switched = await switchRole(owner.page, 'workshop_owner', '/home/dashboard');
  check('owner: the role switch to workshop_owner took', switched, 'everything below would measure the wrong tree');
  /**
   * ⚠️ THE OWNER'S SURFACE HERE IS THEIR JOB-CARD LIST, NOT ONE OF THEIR QUEUES,
   * AND THAT IS DELIBERATE — it is the only owner-tree surface that ALWAYS has
   * rows. Every §46/§47 queue filters to a slice of the lifecycle, so which of
   * them is populated depends on where the seeded cards happen to sit, and
   * step 7 below deliberately moves one to a terminal stage. An assertion whose
   * subject can empty itself is an assertion that fails for the wrong reason.
   *
   * Queue linking is still proven twice over, by identities whose surface IS a
   * queue: the platform administrator on `/home/tasks` and reception on
   * `/home/my-tasks`, both of which show every stage.
   */
  await openFromQueue(
    'workshop_owner',
    owner.page,
    '/workshop-operations/job-cards',
    '/workshop-operations/job-cards',
  );

  // ═══ 3. the technician — §49, NO job-cards route anywhere in their tree ════
  const tech = await signIn('technician@autoworkshop.local', '/home/dashboard');
  const techDetail = await openFromQueue(
    'technician',
    tech.page,
    '/home/my-assigned-work',
    '/home/my-assigned-work',
  );

  // ═══ 4. reception — §48, whose ONLY job-card surface is a queue ═══════════
  const reception = await signIn('reception@autoworkshop.local', '/home/dashboard');
  // They land on Alpha Parts Supply, which owns no job cards. Switching is the
  // real flow for a person who works across two organisations.
  const orgSwitched = await switchOrganisation(reception.page, 'Alpha Motors', '/home/dashboard');
  check('reception: the organisation switch to Alpha Motors took', orgSwitched, 'the queue below would be empty for a reason that has nothing to do with this slice');
  await openFromQueue('reception_staff', reception.page, '/home/my-tasks', '/home/my-tasks');

  // ═══ 5. THE REFUSAL IS REAL ═══════════════════════════════════════════════
  //
  // If a technician could simply open the manager's URL, the per-role href
  // would be a cosmetic nicety rather than the thing that stops a 404. This
  // asserts `requireNavRoute` still says no — the same fail-closed gate, just
  // approached deliberately instead of by accident.
  console.log('\n5. the cross-tree refusal still holds');
  if (techDetail) {
    const id = techDetail.split('/').pop();
    const managerUrl = `${WORKSHOP}/workshop-floor/job-cards/${id}`;

    /**
     * 🔴 THE POSITIVE CONTROL COMES FIRST. Raised by Codex: "the page does not
     * say 'Move this job on'" is true of a refusal, and equally true of a
     * broken route, an API outage, a placeholder, or a typo in the URL. Without
     * proving that this EXACT url works for somebody, the refusal check passes
     * for any reason at all — a check that walks through its own gap.
     *
     * So: the platform administrator, whose default tree DOES carry
     * `/workshop-floor/job-cards`, must render the real screen at this very
     * address first.
     */
    await admin.page.goto(managerUrl, { waitUntil: 'load' });
    await admin.page.waitForTimeout(700);
    const control = await mainText(admin.page);
    check(
      'CONTROL: the same URL renders for a role whose tree carries it',
      /Move this job on/.test(control),
      `${managerUrl} did not render for the platform administrator either — the refusal below would prove nothing`,
    );

    await tech.page.goto(managerUrl, { waitUntil: 'load' });
    await tech.page.waitForTimeout(700);
    const refused = await mainText(tech.page);
    check(
      'a technician opening the MANAGER detail URL is refused',
      !/Move this job on/.test(refused),
      'the technician reached a route their tree does not carry',
    );
    // And refused by the GATE, not by an error. `app/not-found.tsx` carries
    // this copy; an API failure or a placeholder would not.
    check(
      'the refusal is the navigation gate, not an error or a placeholder',
      /not in your menu/i.test(refused),
      `expected the not-found screen; got: ${refused.slice(0, 300)}`,
    );
  } else {
    check('a technician opening the MANAGER detail URL is refused', false, 'no technician detail URL was reached, so this could not be tested');
  }

  // ═══ 6. A STAGE MOVE LANDS, AND IS RE-READ ═══════════════════════════════
  //
  // 🔴 "Moved" is a claim. The stage the next person sees is whatever the
  // database holds, so this reloads and reads the badge back — the same rule
  // the pricing screen and the mobile detail screen were both built on.
  console.log('\n6. a stage move reaches the database');
  const page = owner.page;
  await page.goto(`${WORKSHOP}/workshop-operations/job-cards`, { waitUntil: 'load' });
  await page.waitForTimeout(600);
  const firstJob = page.getByRole('link', { name: /^JC-\d+$/ }).first();
  await firstJob.click();
  await page.waitForTimeout(1200);
  const movedFrom = page.url();

  const select = page.locator('select[name="toStage"]');
  const hasMoves = (await select.count()) > 0;
  check('the owner is offered at least one move', hasMoves, await mainText(page).then((t) => t.slice(0, 300)));

  if (hasMoves) {
    const options = await select.locator('option').evaluateAll((os) =>
      os.map((o) => o.value).filter((v) => v !== ''),
    );
    check('the offered list is not empty', options.length > 0, 'an empty menu would render as "no moves"');

    if (options.length > 0) {
      const target = options[0];
      await select.selectOption(target);
      await page.getByRole('button', { name: /^Move$/i }).click();
      await page.waitForTimeout(3500);

      // The re-read. `router.refresh()` re-runs the server component, but this
      // reloads outright so nothing client-side can be mistaken for the truth.
      await page.goto(movedFrom, { waitUntil: 'load' });
      await page.waitForTimeout(1000);
      const after = await mainText(page);
      const label = target.replace(/_/g, ' ');
      check(
        `the card is now at "${target}" after a full reload`,
        new RegExp(label, 'i').test(after),
        `expected the stage badge to read ${label}; page said: ${after.slice(0, 400)}`,
      );
    }
  }

  // ═══ 7. A CLOSED CARD THAT STILL HAS A MOVE ══════════════════════════════
  //
  // 🔴 THE CASE CODEX FOUND. `closed_at` is stamped the moment a card reaches
  // `completed`, and the lifecycle permits `completed → warranty_follow_up`, so
  // "closed" and "has a next stage" are BOTH true at once. The first version of
  // this screen branched on `closed` first and announced "this job is closed,
  // so it has no next stage" — false, and it hid a real action.
  //
  // ⚠️ THIS STEP CONSUMES ITS FIXTURE. It moves a card to `completed`, which is
  // terminal apart from warranty follow-up, so the card does not come back to
  // `ready_for_collection`. If a later run reports no such card, that is this
  // step having run before — re-seed with `bash scripts/seed-dev-core.sh`.
  console.log('\n7. a CLOSED card still offers its warranty follow-up');
  await page.goto(`${WORKSHOP}/repair-control/ready-for-collection`, { waitUntil: 'load' });
  await page.waitForTimeout(800);
  const readyRows = await page.locator('tbody tr').count();
  if (readyRows === 0) {
    // Reported, never silently skipped, and NOT counted as a pass.
    console.log('  SKIP  no card at ready_for_collection — re-seed with scripts/seed-dev-core.sh');
    console.log('        (the closed-card rendering was NOT exercised this run)');
  } else {
    await page.getByRole('link', { name: /^JC-\d+$/ }).first().click();
    await page.waitForTimeout(1200);
    const closedUrl = page.url();
    await page.locator('select[name="toStage"]').selectOption('completed');
    await page.getByRole('button', { name: /^Move$/i }).click();
    await page.waitForTimeout(3500);

    await page.goto(closedUrl, { waitUntil: 'load' });
    await page.waitForTimeout(1000);
    const closedText = await mainText(page);

    check('the card reads as closed', /Closed/.test(closedText), closedText.slice(0, 300));
    check(
      'a closed card does NOT claim it has no next stage while one is offered',
      !/has no further stage/i.test(closedText),
      'the screen suppressed a move the API was offering — Codex finding 3 has regressed',
    );
    const closedSelect = page.locator('select[name="toStage"]');
    check(
      'the warranty follow-up move is still offered on the closed card',
      (await closedSelect.count()) > 0 &&
        (await closedSelect.locator('option').evaluateAll((os) => os.map((o) => o.value))).includes(
          'warranty_follow_up',
        ),
      closedText.slice(0, 400),
    );
  }

  // ═══ 8. no client-side errors anywhere ════════════════════════════════════
  console.log('\n8. the browser console');
  check('no page errors across any identity', errors.length === 0, errors.slice(0, 5).join('\n        '));
} finally {
  await browser.close();
}

console.log(`\n${checks - failures}/${checks} checks passed`);
process.exit(failures === 0 ? 0 : 1);
