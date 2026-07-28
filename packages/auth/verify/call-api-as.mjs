/**
 * Call the API with a REAL captured session's access token, bypassing the UI.
 *
 * WHY THIS EXISTS. CLAUDE.md §8 is blunt — "Hidden ≠ secure" — and every page
 * gate in this codebase carries a comment saying it is not the control. That
 * claim is worth exactly nothing until somebody points a request at the API
 * without a browser and sees what comes back. This is that request.
 *
 *   (cd apps/e2e && node verify/capture-session.mjs --url http://localhost:3001 \
 *        --user technician@autoworkshop.local)
 *   (cd packages/auth && node verify/call-api-as.mjs /customers)
 *
 * The page may 404 a technician while the API hands the same technician the
 * whole customer book. Those are different answers to different questions, and
 * only this script asks the second one.
 *
 * Uses the same cookie-file seam as `try-refresh.mjs`, for the same reason:
 * Playwright resolves from `apps/e2e` and `next-auth/jwt` from `packages/auth`,
 * and under pnpm's isolated stores no single file can import both.
 *
 * DEV ONLY — it decrypts a session and refuses to run without an explicit
 * secret, so it can never be pointed at a deployed environment by accident.
 */
import { readFileSync } from 'node:fs';
import { getToken } from 'next-auth/jwt';

const SEAM = new URL('../../../.verify-session-cookies.json', import.meta.url);

const SECRET = process.env['AUTH_SECRET'];
if (!SECRET) {
  console.error('AUTH_SECRET must be set (source the repo .env)');
  process.exit(2);
}

const path = process.argv[2] ?? '/customers';
const base = process.env['API_BASE_URL'] ?? 'http://localhost:4000';

const cookies = JSON.parse(readFileSync(SEAM, 'utf-8'));
const header = cookies.map((c) => `${c.name}=${c.value}`).join('; ');
const t = await getToken({
  req: { headers: new Headers({ cookie: header }) },
  secret: SECRET,
  // The captured session came from http://localhost, so Auth.js used the
  // NON-secure cookie name. Getting this wrong reads as "no session" rather
  // than as an error — the exact defect found on 2026-07-28.
  secureCookie: false,
});

const accessToken = t?.keycloak?.accessToken;
if (!accessToken) {
  console.log('NO access token in the captured session — nothing can be proven');
  process.exit(1);
}

const res = await fetch(`${base}/api/v1${path}`, {
  headers: { Authorization: `Bearer ${accessToken}` },
});
const body = await res.text();

console.log(`GET /api/v1${path} -> HTTP ${res.status}`);
// Truncated: the question is WHETHER rows come back and how many, not their
// contents — and this output is pasted into review notes.
let summary = body.slice(0, 400);
try {
  const parsed = JSON.parse(body);
  if (Array.isArray(parsed)) {
    summary = `array of ${parsed.length}: ${parsed
      .map((r) => r.displayName ?? r.registrationNumber ?? r.name ?? r.id)
      .join(', ')}`;
  }
} catch {
  /* not JSON — print the raw prefix above */
}
console.log(summary);
