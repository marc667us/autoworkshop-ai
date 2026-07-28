/**
 * Sign in through the REAL Keycloak and print what a page actually renders.
 *
 * Every serious defect this project has had was green on typecheck, lint and the
 * unit suite first. The only check that has consistently caught them is opening
 * the page as a signed-in human, so this makes that check one command instead of
 * a manual browser session — and therefore something that gets run every time.
 *
 *   node verify/read-page-signed-in.mjs --url http://localhost:3006/directory/organizations
 *   node verify/read-page-signed-in.mjs --url ... --user technician@autoworkshop.local
 *
 * It prints the MAIN region's text, not the whole document, because the shell
 * chrome is identical on every page and drowns the part under test.
 *
 * `--expect <substring>` and `--reject <substring>` turn it into a gate: reject
 * is the one that matters for tenant isolation, where the failure mode is an
 * EXTRA row appearing rather than a missing one, and a test that only asserts
 * presence would pass while leaking another tenant's data.
 *
 * DEV ONLY. It refuses any URL that is not localhost so it can never be aimed at
 * a deployed environment, where it would be typing a real password into a real
 * login form.
 */
import { chromium } from '@playwright/test';

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : process.argv[i + 1];
}
function argAll(name) {
  return process.argv.reduce(
    (acc, v, i) => (v === `--${name}` ? [...acc, process.argv[i + 1]] : acc),
    [],
  );
}

const url = arg('url');
const user = arg('user', 'admin@autoworkshop.local');
const password = process.env['DEV_USER_PASSWORD'] ?? 'Change_me_locally1!';
const expects = argAll('expect');
const rejects = argAll('reject');
/** A route the signed-out shell renders a sign-in link on. See the note below. */
const landing = arg('landing', '/home/dashboard');

if (!url) {
  console.error('usage: read-page-signed-in.mjs --url <url> [--user <email>] [--expect s] [--reject s]');
  process.exit(2);
}
// Not a nicety: this script types a password into whatever login form it is
// given, so the host is checked before the browser ever launches.
const host = new URL(url).hostname;
if (host !== 'localhost' && host !== '127.0.0.1') {
  console.error(`refusing to sign in against a non-local host: ${host}`);
  process.exit(2);
}

const browser = await chromium.launch();
const page = await browser.newPage();
let failed = false;

try {
  // ⚠️ SIGN IN ON THE LANDING PAGE FIRST, NOT ON THE TARGET.
  //
  // This script used to open the target URL and sign in only if it found a
  // "Sign in" link there. That silently produced FALSE RESULTS on exactly the
  // pages worth testing: when the target 404s, the shell renders no sign-in
  // link, so no sign-in happened and the script reported an ANONYMOUS visitor's
  // 404 as though it were the named user's. Every "role X is refused" claim it
  // made was really "an anonymous visitor is refused" — which is true of every
  // gated route and proves nothing about the role.
  //
  // The landing page is a route every workshop role can reach, so the sign-in
  // link is always there.
  const origin = new URL(url).origin;
  await page.goto(`${origin}${landing}`, { waitUntil: 'domcontentloaded' });

  const signIn = page.getByRole('link', { name: 'Sign in' });
  if (await signIn.count()) {
    await signIn.first().click();
    const provider = page.getByRole('button', { name: /Keycloak/i });
    // `noWaitAfter`: this button submits a form that redirects to Keycloak, and
    // Playwright's default post-click wait for "scheduled navigations to finish"
    // times out on that hand-off rather than following it. The `waitForURL`
    // below is the real signal, so the click does not need to wait as well.
    if (await provider.count()) await provider.first().click({ noWaitAfter: true });
    await page.waitForURL(/openid-connect\/auth/, { timeout: 60000 });
    await page.fill('#username', user);
    await page.fill('#password', password);
    await page.click('#kc-login');
    await page.waitForURL((u) => u.toString().startsWith(origin), { timeout: 30000 });
  }

  // Assert the sign-in actually took, BEFORE reading the target. Otherwise a
  // failed login degrades into "the page 404s", which reads as a working gate.
  const session = await page.evaluate(async () =>
    fetch('/api/auth/session').then((r) => r.json()).catch(() => null),
  );
  if (!session?.user) {
    console.error(`FAILED TO SIGN IN as ${user} — refusing to report on an anonymous session`);
    process.exit(3);
  }

  // Only now the page under test.
  await page.goto(url, { waitUntil: 'domcontentloaded' });

  // Suspense streams the data in after the shell, so wait for the boundary to
  // resolve rather than racing it — otherwise this reports the loading state.
  await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {});

  const main = page.locator('main');
  const text = (await main.count())
    ? (await main.first().innerText()).trim()
    : (await page.locator('body').innerText()).trim();

  console.log(`--- ${url}  as ${user} ---`);
  console.log(text);
  console.log('--- end ---');

  for (const e of expects) {
    const ok = text.includes(e);
    console.log(`${ok ? 'PASS' : 'FAIL'}  expect "${e}"`);
    if (!ok) failed = true;
  }
  for (const r of rejects) {
    const ok = !text.includes(r);
    console.log(`${ok ? 'PASS' : 'FAIL'}  reject "${r}"`);
    if (!ok) failed = true;
  }
} finally {
  await browser.close();
}

process.exit(failed ? 1 : 0);
