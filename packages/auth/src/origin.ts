import { headers } from 'next/headers';

/**
 * Kept in its OWN module, away from `sign-out.ts`, and that is not tidiness.
 *
 * `sign-out.ts` imports `workspaceAuth`, which pulls in `next-auth`, which
 * imports `next/server` — unresolvable under vitest in this package's isolated
 * pnpm store. Importing this function from there dragged the whole chain into
 * the unit suite and every test in the file failed at module load, including
 * the ones that had passed for weeks. One file's worth of separation keeps the
 * testable half testable.
 */

/**
 * Where Keycloak sends the browser after it has ended the SSO session.
 *
 * `AUTH_URL` FIRST, and the request's own Host only as a fallback. The Host
 * header is client-supplied; `AUTH_URL` is set per service by
 * `provision-web-service.yml` and is the same value Auth.js already builds its
 * callback URLs from, so preferring it keeps sign-in and sign-out landing on one
 * origin instead of two that agree until a proxy is added.
 *
 * A FORGED HOST CANNOT REDIRECT THE USER ANYWHERE. Keycloak validates
 * `post_logout_redirect_uri` against the client's allow-list — the realm sets
 * `post.logout.redirect.uris: "+"`, which means "the `redirectUris` list", and
 * that list is `http://localhost:<port>/*` plus the production hostnames. An
 * origin outside it is refused by Keycloak before the browser is sent anywhere.
 * Same reasoning as `trustHost` in `workspace-auth.ts`, and it depends on the
 * same allow-list staying tight: widening it to a wildcard would make this an
 * open redirect.
 */
export async function postLogoutOrigin(): Promise<string> {
  const configured = process.env['AUTH_URL'];
  if (configured) return configured.replace(/\/$/, '');

  const requestHeaders = await headers();
  const host = requestHeaders.get('host') ?? 'localhost:3000';
  // `x-forwarded-proto` is what Render and any reverse proxy set; without it a
  // production sign-out would post back an `http://` URL that is not in the
  // allow-list, and Keycloak would refuse the redirect after already having
  // ended the session — leaving the user on a Keycloak error page, signed out.
  const proto = requestHeaders.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https');
  return `${proto}://${host}`;
}
