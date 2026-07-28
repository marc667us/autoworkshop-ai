// Take the captured cookie, decrypt the session, and ask Keycloak to use the
// refresh token. Run once WITHOUT a prior sign-out and once WITH one: the
// difference is the whole claim of T-0005 finding 5.
import { readFileSync } from 'node:fs';
import { getToken } from 'next-auth/jwt';

// The seam: written by `apps/e2e/verify/capture-session.mjs`. Gitignored.
const SEAM = new URL('../../../.verify-session-cookies.json', import.meta.url);


const SECRET = process.env['AUTH_SECRET'];
if (!SECRET) {
  // No default. This script decrypts a session; a baked-in secret is how a dev
  // helper quietly becomes usable against something that is not dev.
  console.error('AUTH_SECRET must be set (source the repo .env)');
  process.exit(2);
}
const KC = (process.env['KEYCLOAK_URL'] ?? 'http://localhost:8080') + '/realms/' + (process.env['KEYCLOAK_REALM'] ?? 'autoworkshop') + '/protocol/openid-connect/token';
const CLIENT = 'autoworkshop-customer-web';

const cookies = JSON.parse(readFileSync(SEAM, 'utf-8'));
const header = cookies.map((c) => `${c.name}=${c.value}`).join('; ');
const t = await getToken({ req: { headers: new Headers({ cookie: header }) }, secret: SECRET, secureCookie: false });
const rt = t?.keycloak?.refreshToken;
if (!rt) { console.log('NO refresh token in the session — cannot prove anything'); process.exit(1); }

const r = await fetch(KC, {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ grant_type: 'refresh_token', client_id: CLIENT, refresh_token: rt }),
});
const b = await r.json().catch(() => ({}));
console.log(`refresh grant -> HTTP ${r.status} ${b.error ?? 'SUCCESS (token still usable)'}${b.error_description ? ' — ' + b.error_description : ''}`);
