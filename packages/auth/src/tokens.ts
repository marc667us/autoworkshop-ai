import { keycloakIssuer } from './config';

/**
 * The Keycloak tokens carried by a session.
 *
 * Kept separate from Auth.js's own types so the refresh logic below is a plain
 * function over plain data and can be tested without standing up a provider,
 * a request, or a cookie.
 */
export interface KeycloakTokenSet {
  accessToken: string;
  /**
   * Absent when Keycloak declined to issue one. Treated as "cannot refresh"
   * rather than "refresh with undefined", which would send the string
   * "undefined" to the token endpoint and get a 400 that reads like a
   * credential fault.
   */
  refreshToken?: string;
  /** Absolute expiry in epoch SECONDS — the unit Keycloak's `exp` uses. */
  expiresAt: number;
  /** Needed at sign-out: Keycloak's end-session endpoint wants `id_token_hint`. */
  idToken?: string;
}

/**
 * Refresh a little BEFORE expiry, not at it.
 *
 * The realm issues 300-second access tokens. A token that is valid when the
 * server component starts rendering can be expired by the time the `/me` call
 * reaches the API, and the failure is a 401 on a page that had a perfectly good
 * session a moment earlier. Thirty seconds covers request latency and modest
 * clock skew between this host and Keycloak.
 */
export const REFRESH_SKEW_SECONDS = 30;

export function isExpired(
  tokenSet: Pick<KeycloakTokenSet, 'expiresAt'>,
  nowSeconds: number = Math.floor(Date.now() / 1000),
  skewSeconds: number = REFRESH_SKEW_SECONDS,
): boolean {
  return nowSeconds >= tokenSet.expiresAt - skewSeconds;
}

/** Raised when a refresh cannot succeed and the user must sign in again. */
export class RefreshFailedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RefreshFailedError';
  }
}

interface TokenEndpointResponse {
  access_token?: string;
  refresh_token?: string;
  id_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
}

/**
 * Exchange a refresh token for a fresh access token.
 *
 * ⚠️ THE REALM ROTATES REFRESH TOKENS. `realm-autoworkshop.json` sets
 * `revokeRefreshToken: true` with `refreshTokenMaxReuse: 0`, so the token
 * presented here is revoked the instant this call succeeds and the response's
 * NEW refresh token is the only usable one. Two consequences that are easy to
 * get wrong:
 *
 *   · the caller must persist `refreshToken` from the result — keeping the old
 *     one turns the next refresh into a hard sign-out, roughly five minutes
 *     later, which is far enough from the cause to look unrelated;
 *   · two concurrent refreshes with the same token cannot both win. The loser
 *     gets `invalid_grant`. Auth.js serialises this per request, but a caller
 *     that fans out must not.
 *
 * No client secret is sent: these are PUBLIC clients (PKCE S256), so the token
 * endpoint authenticates the request by the refresh token alone.
 */
export async function refreshAccessToken(
  clientId: string,
  refreshToken: string,
  fetchImpl: typeof fetch = fetch,
  /**
   * The id token currently held, kept if the refresh response omits one. See
   * the note at the return statement — losing it silently breaks sign-out.
   */
  previousIdToken?: string,
): Promise<KeycloakTokenSet> {
  const response = await fetchImpl(`${keycloakIssuer()}/protocol/openid-connect/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: clientId,
      refresh_token: refreshToken,
    }),
  });

  const payload = (await response.json().catch(() => ({}))) as TokenEndpointResponse;

  if (!response.ok || !payload.access_token) {
    // `error_description` is Keycloak's own text ("Token is not active", say).
    // It describes the grant, not the user, so it is safe to surface into a
    // server log — and without it every refresh failure looks identical.
    throw new RefreshFailedError(
      payload.error_description ?? payload.error ?? `token endpoint returned ${response.status}`,
    );
  }

  return {
    accessToken: payload.access_token,
    // Fall back to the presented token only if Keycloak returned none. With
    // rotation on it always does; without this the field would silently become
    // undefined on a realm configured differently.
    refreshToken: payload.refresh_token ?? refreshToken,
    expiresAt: Math.floor(Date.now() / 1000) + (payload.expires_in ?? 300),
    // CARRIED FORWARD, like the refresh token above, and for a sharper reason.
    // The id token is what `id_token_hint` on Keycloak's end-session endpoint is
    // built from. A refresh response that omits `id_token` would otherwise strip
    // it from the session PERMANENTLY, and every later sign-out would ask
    // Keycloak to end a session it can no longer identify. The symptom is a
    // sign-out that clears the local cookie, reports success, and leaves the SSO
    // session alive — the shared-terminal takeover this whole change exists to
    // prevent, arriving minutes after login rather than never.
    idToken: payload.id_token ?? previousIdToken,
  };
}

/**
 * Revoke a refresh token at Keycloak's revocation endpoint (RFC 7009).
 *
 * WHY THIS IS NOT OPTIONAL
 *
 * Auth.js's `signOut()` deletes this app's cookie. It does not tell Keycloak
 * anything, so a refresh token captured before sign-out stays valid and can be
 * rotated indefinitely until the realm's session or token lifespan expires.
 * Clearing a cookie is not revocation, and CLAUDE.md §9 requires the real
 * thing: "logout endpoint · refresh token revocation · session invalidation ·
 * backend rejection of revoked tokens".
 *
 * On a shared workshop terminal that gap is the whole risk.
 *
 * FAILS SOFT, DELIBERATELY. If revocation fails, sign-out must still proceed —
 * a user who cannot sign out because an upstream call failed is left MORE
 * exposed than one whose token outlives the session. The boolean is returned so
 * the caller can log or audit the difference rather than discover it later.
 *
 * No client secret: these are PUBLIC clients (PKCE S256), so the endpoint
 * authenticates the request by the token itself.
 */
export async function revokeRefreshToken(
  clientId: string,
  refreshToken: string,
  fetchImpl: typeof fetch = fetch,
): Promise<boolean> {
  try {
    const response = await fetchImpl(`${keycloakIssuer()}/protocol/openid-connect/revoke`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        token: refreshToken,
        // Without the hint Keycloak guesses, and guesses wrong often enough
        // that a revoke can silently no-op while returning 200.
        token_type_hint: 'refresh_token',
      }),
    });
    // RFC 7009: a revocation endpoint returns 200 even for an already-invalid
    // token, on purpose — so a non-2xx here is a real failure, not "the token
    // was already dead".
    return response.ok;
  } catch {
    return false;
  }
}
