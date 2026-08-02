/**
 * Turn the development realm into the one production is allowed to import.
 *
 * ── 🔴 WHY THIS EXISTS ─────────────────────────────────────────────────────
 *
 * `realm-autoworkshop.json` is the realm developers run against, so it carries
 * nine DEVELOPMENT redirect URIs — `http://localhost:3000-3006/*` for the seven
 * web clients, and `exp://localhost:8081/*` plus `exp://127.0.0.1:8081/*` for
 * the mobile one. Shipping those to production is not cosmetic:
 *
 *   * Every one of these clients is PUBLIC (no secret; PKCE is the protection).
 *     A redirect allow-list is the only thing deciding where an authorization
 *     code may be delivered.
 *   * `localhost` resolves to the VICTIM'S OWN MACHINE. An attacker who can get
 *     something listening on the right port during a login — a malicious local
 *     app, another dev tool — receives the code for a production session.
 *   * The `exp://` entries are worse, because Expo Go is a general-purpose
 *     runtime: anyone's project can claim that scheme.
 *
 * This was already recorded as an open hardening item on 2026-08-01. It is
 * closed here, at the only point where it can be closed automatically — the
 * image build — rather than by remembering to edit a realm by hand.
 *
 * ⚠️ IT REFUSES RATHER THAN WARNS. If a dev URI survives, or a client ends up
 * with NO redirect URI at all (which would break sign-in for that app), the
 * build fails. A realm that silently lost its production redirect would deploy
 * green and be unusable.
 *
 *   node build-prod-realm.mjs <in.json> <out.json> <public-base-domain>
 */
import { readFileSync, writeFileSync } from 'node:fs';

const [, , inPath, outPath, baseDomain] = process.argv;
if (!inPath || !outPath || !baseDomain) {
  console.error('usage: build-prod-realm.mjs <in.json> <out.json> <base-domain>');
  process.exit(1);
}

const realm = JSON.parse(readFileSync(inPath, 'utf8'));

/** A URI that must never reach production. */
function isDev(uri) {
  return (
    uri.includes('localhost') ||
    uri.includes('127.0.0.1') ||
    uri.startsWith('exp://') ||
    /\/\/(10|192\.168)\./.test(uri) ||
    /\/\/172\.(1[6-9]|2\d|3[01])\./.test(uri)
  );
}

/**
 * A production address to fall back on when stripping leaves a client with
 * NONE — never something to add on top of what the realm already says.
 *
 * 🔴 THE FIRST VERSION OF THIS ADDED A DERIVED URI UNCONDITIONALLY, and it was
 * wrong in a way that widened two allow-lists. It assumed `workshop` sat on the
 * apex and everything else on a subdomain. The realm says the opposite: the
 * apex `autoworkshop.aiappinvent.com` belongs to CUSTOMER-web, and workshop-web
 * lives at `workshop.`. Merging the guess in gave `autoworkshop-workshop-web`
 * the customer site's origin — two different public clients accepting the same
 * redirect, which is exactly the confusion a redirect allow-list exists to
 * prevent.
 *
 * The realm is the authority on where each app is deployed. This only supplies
 * a value when there is otherwise nothing, and says so loudly when it does.
 */
function fallbackUris(clientId) {
  if (clientId === 'autoworkshop-mobile') {
    // A shipped Android build uses the custom scheme; `exp://` is a
    // development runtime and has no place in production.
    return { redirectUris: ['autoworkshop://auth', 'autoworkshop://auth/*'], webOrigins: [] };
  }
  const m = /^autoworkshop-([a-z]+)-web$/.exec(clientId);
  if (!m) return null;
  const host = `${m[1]}.${baseDomain}`;
  return { redirectUris: [`https://${host}/*`], webOrigins: [`https://${host}`] };
}

let stripped = 0;
const substituted = [];
const problems = [];

for (const client of realm.clients ?? []) {
  const before = (client.redirectUris ?? []).length;
  const kept = (client.redirectUris ?? []).filter((u) => !isDev(u));
  stripped += before - kept.length;

  client.redirectUris = kept;
  client.webOrigins = (client.webOrigins ?? []).filter((u) => !isDev(u));

  // Only when stripping emptied the list does a fallback get used.
  if (client.redirectUris.length === 0) {
    const prod = fallbackUris(client.clientId);
    if (prod) {
      client.redirectUris = prod.redirectUris;
      client.webOrigins = prod.webOrigins;
      substituted.push(`${client.clientId} -> ${prod.redirectUris.join(', ')}`);
    }
  }

  // Only clients that actually take part in a browser/native login need a
  // redirect. A bearer-only or service client legitimately has none.
  const needsRedirect = client.publicClient === true && client.standardFlowEnabled !== false;
  if (needsRedirect && client.redirectUris.length === 0) {
    problems.push(`${client.clientId} has NO redirect URI left — sign-in would be impossible`);
  }
  for (const u of client.redirectUris) {
    if (isDev(u)) problems.push(`${client.clientId} still carries a dev redirect: ${u}`);
    if (u === '*' || u === 'https://*') {
      problems.push(`${client.clientId} has a WILDCARD redirect (${u}) — refusing`);
    }
  }
}

// Users are seeded by a script against a running realm, never imported. An
// account baked into an image is a credential in a build artefact.
if (Array.isArray(realm.users) && realm.users.length > 0) {
  problems.push(`realm carries ${realm.users.length} user(s) — production must import none`);
}

if (problems.length) {
  console.error('REFUSING to build a production realm:');
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}

writeFileSync(outPath, `${JSON.stringify(realm, null, 2)}\n`);
console.log(`production realm written: ${outPath}`);
console.log(`  dev redirect URIs stripped: ${stripped}`);
console.log(`  clients: ${(realm.clients ?? []).length}`);
if (substituted.length) {
  // Named, never silent: a substituted address is a GUESS about where an app is
  // deployed, and it belongs in the deploy log where somebody will see it.
  console.log('  clients left with none, given a derived address:');
  for (const s of substituted) console.log(`    ${s}`);
}
