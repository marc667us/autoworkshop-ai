/**
 * THE TOP BAR TELLS THE TRUTH ABOUT WHO IS SIGNED IN — owner report 2026-08-03.
 *
 * ── THE TWO DEFECTS THIS MEASURES ──────────────────────────────────────────
 *
 * 1. 🔴 **EVERY ACCOUNT DISPLAYED THE SAME NAME.** `seed-dev-identity.sh`
 *    defaulted `DEV_LAST` to the constant `Technician`, and every documented
 *    multi-identity seed command overrides `DEV_USER_ROLE` and `DEV_USER_EMAIL`
 *    and nothing else — so all eight identities were written with
 *    `display_name = 'A. Technician'`. Measured in the dev database before the
 *    fix: eight rows, one name. The owner's report was exact.
 *
 * 2. 🔴 **THE ROLE WAS NOT SHOWN AT ALL** to most viewers. It appeared only in
 *    the `<option>` text of the role switcher, and that control returns `null`
 *    below two roles — the state of six of the seven dev identities.
 *
 * ── WHY IT ASSERTS THE WAY IT DOES ─────────────────────────────────────────
 *
 * · Anchored on the `banner` landmark, NOT `body`. `body.textContent()` includes
 *   the inline `<style>` block, which is how a `/404/` test matched a hex colour
 *   on 2026-08-02 and reported two rendered pages as broken.
 * · Proves the SESSION IS REAL before judging anything. A signed-out viewer
 *   correctly has no chips at all, so every assertion below would fail as a
 *   product defect when the harness is what broke.
 * · Asserts the chips are DIFFERENT ACROSS IDENTITIES, not merely non-empty.
 *   The original bug produced a perfectly populated, perfectly wrong chip: any
 *   per-identity check that only asked "is something there" passed throughout.
 * · Asserts EXACTLY ONE role statement — chip or switcher, never both, never
 *   neither. Two controls naming the same role is the ambiguity the switcher's
 *   own header warns about; zero is the bug being fixed.
 *
 *   node verify/verify-top-bar-identity.mjs
 *
 * DEV ONLY — the canonical LAN host, real Keycloak sign-in. `localhost` gives
 * `MissingCSRF` because `AUTH_URL` is the LAN host (start-local.sh).
 */
import { chromium } from '@playwright/test';

const WORKSHOP = process.env['WORKSHOP_WEB_URL'] ?? 'http://192.168.0.124:3001';
const PASSWORD = process.env['DEV_USER_PASSWORD'] ?? 'Change_me_locally1!';

/**
 * What each account should say, derived from what `seed-dev-identity.sh` writes.
 *
 * `owner@` is the interesting one and is deliberately included: it holds THREE
 * roles in Alpha Motors, so `resolveTenantContext` resolves the STRONGEST by
 * `ROLE_PRECEDENCE` — `platform_administrator`, not `workshop_owner` — and the
 * switcher renders in place of the chip. An expectation of "Workshop owner"
 * here would be wrong about the product, not about the code.
 */
const IDENTITIES = [
  { user: 'technician@autoworkshop.local', name: 'Dev Technician', role: 'Technician', control: 'chip' },
  { user: 'manager@autoworkshop.local', name: 'Dev Workshop Manager', role: 'Workshop manager', control: 'chip' },
  { user: 'supervisor@autoworkshop.local', name: 'Dev Workshop Supervisor', role: 'Workshop supervisor', control: 'chip' },
  { user: 'reception@autoworkshop.local', name: 'Dev Reception Staff', role: 'Reception staff', control: 'chip' },
  { user: 'admin@autoworkshop.local', name: 'Dev Platform Administrator', role: 'Platform administrator', control: 'chip' },
  { user: 'owner@autoworkshop.local', name: 'Dev Workshop Owner', role: 'Platform administrator', control: 'switcher' },
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

async function signIn(user) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`[${user}] ${String(e)}`));

  await page.goto(`${WORKSHOP}/home/dashboard`);
  await page.getByRole('link', { name: 'Sign in' }).first().click();

  // ⚠️ `waitFor`, NOT `if (await count())` — `count()` does not auto-wait, and
  // returning 0 before the provider page loads leaves the run signed OUT while
  // every assertion below reports a product defect that does not exist. This
  // repo has paid for that once already (verify-role-switcher.mjs).
  const provider = page.getByRole('button', { name: /Keycloak/i });
  await provider.waitFor({ state: 'visible', timeout: 30000 });
  await provider.click({ noWaitAfter: true });

  await page.waitForURL(/openid-connect\/auth/, { timeout: 60000 });
  await page.fill('#username', user);
  await page.fill('#password', PASSWORD);
  await page.click('#kc-login', { noWaitAfter: true });
  await page.waitForURL((u) => !/openid-connect/.test(u.toString()), { timeout: 90000 });
  await page.goto(`${WORKSHOP}/home/dashboard`, { waitUntil: 'load' });
  return { ctx, page };
}

/** The top bar only — never the whole document. */
function banner(page) {
  return page.locator('header').first();
}

const seenNames = new Map();
const seenRoles = new Map();

try {
  for (const id of IDENTITIES) {
    console.log(`\n── ${id.user}`);
    const { ctx, page } = await signIn(id.user);

    // The harness guard. Everything below is meaningless without it.
    const bannerText = await banner(page).innerText();
    check(
      `${id.user}: the session is real`,
      bannerText.includes('Sign out') && !bannerText.includes('Not signed in'),
      `banner said: ${JSON.stringify(bannerText.slice(0, 160))}`,
    );

    // ── 1. WHO ──────────────────────────────────────────────────────────────
    const userChip = banner(page).locator('[aria-label^="User: "]');
    const userName = (await userChip.count()) ? (await userChip.first().innerText()).trim() : null;
    check(
      `${id.user}: the user chip names THIS person — "${id.name}"`,
      userName === id.name,
      `chip read ${JSON.stringify(userName)}`,
    );
    // The whole defect: a populated chip that is the same for everybody.
    const nameClash = seenNames.get(userName);
    check(
      `${id.user}: that name is not already in use by another account`,
      userName !== null && nameClash === undefined,
      nameClash ? `"${userName}" was ALSO shown for ${nameClash}` : undefined,
    );
    if (userName !== null) seenNames.set(userName, id.user);

    // ── 2. AS WHAT ──────────────────────────────────────────────────────────
    const roleChip = banner(page).locator('[aria-label^="Acting as: "]');
    const roleSelect = banner(page).locator('select#aw-role-switcher');
    const chips = await roleChip.count();
    const selects = await roleSelect.count();

    check(
      `${id.user}: the role is stated EXACTLY ONCE (chip or switcher, not both)`,
      chips + selects === 1,
      `chips=${chips} switchers=${selects}`,
    );
    check(
      `${id.user}: and by the expected control — ${id.control}`,
      id.control === 'chip' ? chips === 1 : selects === 1,
      `chips=${chips} switchers=${selects}`,
    );

    let statedRole = null;
    if (chips === 1) {
      statedRole = (await roleChip.first().innerText()).trim();
    } else if (selects === 1) {
      // The SELECTED option, not the first: the switcher's whole job is to show
      // the role actually resolved, and a `defaultValue` that fails to apply is
      // a real defect this repo has already shipped once.
      statedRole = (
        await roleSelect.first().locator('option:checked').innerText()
      ).replace(/^Acting as /, '').trim();
    }
    check(
      `${id.user}: the role shown is "${id.role}"`,
      statedRole === id.role,
      `top bar said ${JSON.stringify(statedRole)}`,
    );

    // Roles legitimately repeat across accounts (owner@ and admin@ both resolve
    // as platform_administrator), so this records rather than asserts — but a
    // role identical for EVERY account is the failure mode being fixed.
    seenRoles.set(id.user, statedRole);

    await ctx.close();
  }

  // ── 3. THE DEFECT, STATED AS ONE ASSERTION ────────────────────────────────
  check(
    'across all six accounts the user chip is not a constant',
    new Set(seenNames.keys()).size === IDENTITIES.length,
    `distinct names: ${new Set(seenNames.keys()).size} of ${IDENTITIES.length}`,
  );
  check(
    'across all six accounts the role shown is not a constant',
    new Set(seenRoles.values()).size > 1,
    `distinct roles: ${JSON.stringify([...new Set(seenRoles.values())])}`,
  );
} finally {
  await browser.close();
}

if (errors.length) {
  console.log('\nPage errors observed:');
  for (const e of errors) console.log(`  ${e}`);
}
console.log(`\n${checks - failures}/${checks} checks passed`);
process.exit(failures === 0 && errors.length === 0 ? 0 : 1);
