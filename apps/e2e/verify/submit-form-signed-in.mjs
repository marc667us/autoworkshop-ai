/**
 * Sign in, FILL A FORM, SUBMIT IT, and report what the screen said.
 *
 * The read-side script proves a page renders data. This proves the write path:
 * browser → server action → API → service → Postgres, and the outcome banner
 * the user actually sees. A form that renders is not a form that works, and the
 * difference has cost this project real time before.
 *
 *   node verify/submit-form-signed-in.mjs \
 *     --url http://localhost:3001/customers/register-customer \
 *     --user reception@autoworkshop.local \
 *     --fill displayName="Test Person" --fill phone="+233 20 000 0000" \
 *     --expect "Registered"
 *
 * `--select name=label` picks a dropdown option BY ITS VISIBLE LABEL, because
 * the values are uuids that differ on every database reset.
 *
 * DEV ONLY — refuses any non-localhost host, since it types a password into
 * whatever login form it is given AND writes real records.
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
/** `name=value`, where value may itself contain `=`. */
function pairs(list) {
  return list.map((raw) => {
    const at = raw.indexOf('=');
    return [raw.slice(0, at), raw.slice(at + 1)];
  });
}

const url = arg('url');
const user = arg('user', 'reception@autoworkshop.local');
const landing = arg('landing', '/home/dashboard');
const password = process.env['DEV_USER_PASSWORD'] ?? 'Change_me_locally1!';
const fills = pairs(argAll('fill'));
const selects = pairs(argAll('select'));
const expects = argAll('expect');
const rejects = argAll('reject');
const submitLabel = new RegExp(arg('submit', 'Register|Save|Submit|Add'), 'i');

if (!url) {
  console.error('usage: submit-form-signed-in.mjs --url <url> [--fill n=v] [--select n=label] [--expect s]');
  process.exit(2);
}
const host = new URL(url).hostname;
if (host !== 'localhost' && host !== '127.0.0.1') {
  console.error(`refusing to sign in and write against a non-local host: ${host}`);
  process.exit(2);
}

const origin = new URL(url).origin;
const browser = await chromium.launch();
const page = await browser.newPage();
let failed = false;

try {
  // Sign in on the LANDING page, never on the target — the target may 404 for
  // this role, and a 404 renders no sign-in link, so signing in there silently
  // tests an anonymous visitor instead. That mistake made an earlier version of
  // the read script report meaningless results.
  await page.goto(`${origin}${landing}`, { waitUntil: 'domcontentloaded' });
  const signIn = page.getByRole('link', { name: 'Sign in' });
  if (await signIn.count()) {
    await signIn.first().click();
    const provider = page.getByRole('button', { name: /Keycloak/i });
    if (await provider.count()) await provider.first().click({ noWaitAfter: true });
    await page.waitForURL(/openid-connect\/auth/, { timeout: 60000 });
    await page.fill('#username', user);
    await page.fill('#password', password);
    await page.click('#kc-login');
    await page.waitForURL((u) => u.toString().startsWith(origin), { timeout: 30000 });
  }

  const session = await page.evaluate(async () =>
    fetch('/api/auth/session').then((r) => r.json()).catch(() => null),
  );
  if (!session?.user) {
    console.error(`FAILED TO SIGN IN as ${user} — refusing to report on an anonymous session`);
    process.exit(3);
  }

  await page.goto(url, { waitUntil: 'domcontentloaded' });
  // The form is interactive only after hydration — this is a client component,
  // and submitting before React attaches would post nothing.
  await page.waitForSelector('form', { timeout: 20000 });

  for (const [name, value] of fills) {
    await page.fill(`[name="${name}"]`, value);
  }
  for (const [name, label] of selects) {
    await page.selectOption(`[name="${name}"]`, { label });
  }

  // `--submit` overrides the label when a form's button says something else.
  // The default list is not a guess at every future verb — a form whose button
  // is not matched FAILS LOUDLY here rather than silently submitting nothing.
  await page.getByRole('button', { name: submitLabel }).first().click();

  // SCOPED TO THE FORM. An unscoped `[role="status"]` also matches the app
  // shell's own live region, which is present and EMPTY on every page — so the
  // harness read that empty element and reported a working write as a failure.
  // The banner this cares about is the one the form renders.
  const banner = page.locator('form [role="status"], form [role="alert"]').first();
  await banner.waitFor({ timeout: 30000 }).catch(() => {});
  const outcome = (await banner.count()) ? (await banner.innerText()).trim() : '(no outcome banner rendered)';

  console.log(`--- submitted ${url} as ${user} ---`);
  console.log(outcome);
  console.log('--- end ---');

  for (const e of expects) {
    const ok = outcome.includes(e);
    console.log(`${ok ? 'PASS' : 'FAIL'}  expect "${e}"`);
    if (!ok) failed = true;
  }
  for (const r of rejects) {
    const ok = !outcome.includes(r);
    console.log(`${ok ? 'PASS' : 'FAIL'}  reject "${r}"`);
    if (!ok) failed = true;
  }
} finally {
  await browser.close();
}

process.exit(failed ? 1 : 0);
