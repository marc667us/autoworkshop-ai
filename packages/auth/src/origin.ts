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

  // ⚠️ AUTH_URL IS NOT ALWAYS SET — `render.yaml` does not set it — so this
  // fallback is a live code path, not a theoretical one. An earlier version of
  // this comment asserted the opposite and used that to justify trusting `Host`
  // without inspection. (Supervisor review, 2026-07-28.)
  const requestHeaders = await headers();
  const host = sanitiseHost(requestHeaders.get('host'));
  // `x-forwarded-proto` is what Render and any reverse proxy set; without it a
  // production sign-out would post back an `http://` URL that is not in the
  // allow-list, and Keycloak would refuse the redirect after already having
  // ended the session — leaving the user on a Keycloak error page, signed out.
  const forwarded = requestHeaders.get('x-forwarded-proto');
  // The LAST entry when proxies chain — the one the terminating proxy added.
  // The first is the one nearest the client, and therefore the untrusted one.
  const proto = forwarded
    ? (forwarded.split(',').pop()?.trim() ?? 'https')
    : host.startsWith('localhost') || host.startsWith('127.0.0.1')
      ? 'http'
      : 'https';
  return `${proto}://${host}`;
}

/**
 * Reduce a `Host` header to a bare host[:port], or fail.
 *
 * DEFENCE IN DEPTH, because the Keycloak allow-list is currently the ONLY
 * control on this value and a single control on an attacker-supplied string is
 * one revision away from being none. `Host: good.example.com:@evil.com` parses
 * as authority `evil.com` while string-matching a check written against the
 * prefix — the class of trick that turns "validated elsewhere" into an open
 * redirect off a post-authentication endpoint.
 *
 * `new URL()` does the parsing, so the result is whatever a browser and Keycloak
 * would actually resolve, not what a regex hopes they resolve. Anything that
 * will not parse as a plain authority is rejected outright rather than
 * normalised into something plausible.
 */
function sanitiseHost(rawHost: string | null): string {
  const fallback = 'localhost:3000';
  if (!rawHost) return fallback;
  let parsed: URL;
  try {
    parsed = new URL(`https://${rawHost}`);
  } catch {
    return fallback;
  }
  // Credentials, a path, a query or a fragment in a Host header are not a host.
  if (parsed.username || parsed.password || parsed.pathname !== '/' || parsed.search || parsed.hash) {
    return fallback;
  }
  return parsed.host;
}
