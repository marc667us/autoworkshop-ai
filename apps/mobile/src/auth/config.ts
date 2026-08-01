import Constants from 'expo-constants';

/**
 * Where the mobile app finds Keycloak and the API.
 *
 * ⚠️ `10.0.2.2`, NOT `localhost`, IS THE DEVELOPMENT DEFAULT — and this is the
 * single most common way a working backend looks broken from a phone.
 * `localhost` inside the Android emulator is the EMULATED DEVICE, not the
 * developer's machine, so every request resolves to a port nothing is listening
 * on and the app reports a network failure that has nothing to do with the
 * server. `10.0.2.2` is the emulator's alias for the host loopback.
 *
 * On a PHYSICAL device neither works: the phone is a separate machine on the
 * network and needs the host's LAN address. That is why these are configurable
 * rather than constants — set them in `app.json`'s `extra`, or per-run through
 * the environment.
 */
function fromExtra(key: string, fallback: string): string {
  const extra = (Constants.expoConfig?.extra ?? {}) as Record<string, unknown>;
  const value = extra[key];
  return typeof value === 'string' && value.length > 0 ? value : fallback;
}

export const KEYCLOAK_URL = fromExtra('keycloakUrl', 'http://10.0.2.2:8080');
export const KEYCLOAK_REALM = fromExtra('keycloakRealm', 'autoworkshop');
export const API_BASE_URL = fromExtra('apiBaseUrl', 'http://10.0.2.2:4000');

/**
 * The realm's OIDC endpoints.
 *
 * Derived from the realm name for the same reason `clientIdForWorkspace` derives
 * the web client ids: every independently-configured copy of a URL is another
 * chance to typo one into a realm that does not exist, and that failure surfaces
 * at the Keycloak redirect after the user has already left the app.
 */
export const ISSUER = `${KEYCLOAK_URL.replace(/\/$/, '')}/realms/${KEYCLOAK_REALM}`;

export const DISCOVERY = {
  authorizationEndpoint: `${ISSUER}/protocol/openid-connect/auth`,
  tokenEndpoint: `${ISSUER}/protocol/openid-connect/token`,
  revocationEndpoint: `${ISSUER}/protocol/openid-connect/revoke`,
  endSessionEndpoint: `${ISSUER}/protocol/openid-connect/logout`,
  userInfoEndpoint: `${ISSUER}/protocol/openid-connect/userinfo`,
} as const;

/**
 * ⚠️ A PUBLIC CLIENT WITH NO SECRET, AND THAT IS THE CORRECT SHAPE RATHER THAN
 * A WEAKER ONE.
 *
 * A shipped Android binary cannot keep a secret — anyone may pull the APK and
 * read any string compiled into it. RFC 8252 (OAuth 2.0 for Native Apps) is
 * explicit: native apps are public clients, and the protection comes from PKCE
 * rather than from a credential. Embedding a client secret here would not add
 * security; it would create a shared secret that is published with every
 * install and can never be rotated without shipping a new release.
 *
 * The realm declares this client with `pkce.code.challenge.method: S256`, so
 * Keycloak REFUSES an authorization request that arrives without a code
 * challenge. That is what makes PKCE a control rather than a convention: it
 * cannot be silently dropped by a client-side mistake.
 */
export const CLIENT_ID = 'autoworkshop-mobile';

/**
 * The redirect target.
 *
 * A custom scheme, not an `http` URL: there is no web origin on a phone for the
 * authorization code to come back to. `autoworkshop://auth` is registered in
 * `app.json` and in the realm's `redirectUris`; the two must agree or Keycloak
 * refuses the request with an invalid redirect_uri, which is the correct
 * behaviour and the reason the value is stated once here.
 */
export const REDIRECT_PATH = 'auth';

/**
 * `offline_access` is requested so the app can hold a refresh token and not
 * demand a full browser sign-in every time the access token expires — the
 * difference between an app a technician uses in a workshop and one they give
 * up on. `openid profile email` are the claims `/me` resolves an identity from.
 */
export const SCOPES = ['openid', 'profile', 'email', 'offline_access'];
