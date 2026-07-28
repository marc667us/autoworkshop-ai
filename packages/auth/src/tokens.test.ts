import { afterEach, describe, expect, it } from 'vitest';
import {
  isExpired,
  refreshAccessToken,
  revokeRefreshToken,
  RefreshFailedError,
  REFRESH_SKEW_SECONDS,
} from './tokens';
import { postLogoutOrigin } from './origin';
import { keycloakSignOutUrl } from './logout-url';

const NOW = 1_800_000_000;

describe('isExpired', () => {
  it('is false while the token has more than the skew left', () => {
    expect(isExpired({ expiresAt: NOW + REFRESH_SKEW_SECONDS + 1 }, NOW)).toBe(false);
  });

  it('is true once the token is inside the skew window, before it actually expires', () => {
    // The point of the skew: a token still technically valid must be refreshed
    // early, or a slow request arrives at the API after it has expired.
    expect(isExpired({ expiresAt: NOW + REFRESH_SKEW_SECONDS - 1 }, NOW)).toBe(true);
  });

  it('is true for an already-expired token', () => {
    expect(isExpired({ expiresAt: NOW - 1 }, NOW)).toBe(true);
  });

  it('can be asked without the skew, which is how getAccessToken checks it', () => {
    expect(isExpired({ expiresAt: NOW + 5 }, NOW, 0)).toBe(false);
    expect(isExpired({ expiresAt: NOW - 5 }, NOW, 0)).toBe(true);
  });
});

describe('refreshAccessToken', () => {
  function stubFetch(status: number, body: unknown) {
    const calls: Array<{ url: string; body: string }> = [];
    const impl = (async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), body: String(init?.body ?? '') });
      return {
        ok: status >= 200 && status < 300,
        status,
        json: async () => body,
      } as Response;
    }) as unknown as typeof fetch;
    return { impl, calls };
  }

  it('returns the rotated refresh token, not the one it was given', async () => {
    // The realm sets revokeRefreshToken with refreshTokenMaxReuse 0, so the
    // presented token is dead the moment this succeeds. Keeping it would turn
    // the NEXT refresh into a sign-out, five minutes later and far enough from
    // the cause to look unrelated.
    const { impl } = stubFetch(200, {
      access_token: 'new-access',
      refresh_token: 'rotated-refresh',
      expires_in: 300,
    });

    const result = await refreshAccessToken('autoworkshop-workshop-web', 'old-refresh', impl);

    expect(result.accessToken).toBe('new-access');
    expect(result.refreshToken).toBe('rotated-refresh');
    expect(result.expiresAt).toBeGreaterThan(Math.floor(Date.now() / 1000));
  });

  it('sends no client secret — these are public clients', async () => {
    const { impl, calls } = stubFetch(200, { access_token: 'a', expires_in: 300 });

    await refreshAccessToken('autoworkshop-fleet-web', 'r', impl);

    const body = new URLSearchParams(calls[0]!.body);
    expect(body.get('grant_type')).toBe('refresh_token');
    expect(body.get('client_id')).toBe('autoworkshop-fleet-web');
    expect(body.get('refresh_token')).toBe('r');
    expect(body.has('client_secret')).toBe(false);
  });

  it('keeps the presented token when the realm returns none', async () => {
    const { impl } = stubFetch(200, { access_token: 'a', expires_in: 300 });
    const result = await refreshAccessToken('c', 'still-valid', impl);
    expect(result.refreshToken).toBe('still-valid');
  });

  it('throws RefreshFailedError with the realm’s reason on a rejected grant', async () => {
    const { impl } = stubFetch(400, {
      error: 'invalid_grant',
      error_description: 'Token is not active',
    });

    await expect(refreshAccessToken('c', 'dead', impl)).rejects.toThrowError(RefreshFailedError);
    await expect(refreshAccessToken('c', 'dead', impl)).rejects.toThrowError('Token is not active');
  });

  it('treats a 200 with no access_token as a failure', async () => {
    // A malformed success is not a success. Without this the caller would store
    // `accessToken: undefined` and every API call would send "Bearer undefined".
    const { impl } = stubFetch(200, { expires_in: 300 });
    await expect(refreshAccessToken('c', 'r', impl)).rejects.toThrowError(RefreshFailedError);
  });

  it('survives a response body that is not JSON', async () => {
    const impl = (async () =>
      ({
        ok: false,
        status: 502,
        json: async () => {
          throw new SyntaxError('Unexpected token < in JSON');
        },
      }) as unknown as Response) as unknown as typeof fetch;

    // A proxy returning an HTML error page must surface as a refresh failure,
    // not as a SyntaxError thrown out of the jwt callback — which would fail
    // the whole request instead of just the session.
    await expect(refreshAccessToken('c', 'r', impl)).rejects.toThrowError(RefreshFailedError);
    await expect(refreshAccessToken('c', 'r', impl)).rejects.toThrowError('502');
  });
});

/**
 * T-0005 finding 5. These tests exist because the function shipped in `1d10bd5`
 * with none, and an untested revocation is indistinguishable from no revocation
 * — both leave a valid refresh token behind and both typecheck.
 */
describe('revokeRefreshToken', () => {
  function stubFetch(status: number) {
    const calls: Array<{ url: string; body: string; headers: unknown }> = [];
    const impl = (async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), body: String(init?.body ?? ''), headers: init?.headers });
      return { ok: status >= 200 && status < 300, status } as Response;
    }) as unknown as typeof fetch;
    return { impl, calls };
  }

  it('posts to the revocation endpoint, not the token endpoint', async () => {
    const { impl, calls } = stubFetch(200);
    await revokeRefreshToken('autoworkshop-workshop-web', 'r', impl);
    expect(calls[0]!.url).toMatch(/\/protocol\/openid-connect\/revoke$/);
  });

  it('sends token_type_hint — without it Keycloak guesses and can silently no-op', async () => {
    // The whole failure mode this guards: a wrong guess makes the revoke do
    // nothing while STILL returning 200, so the boolean below would report
    // success on a token that is still live.
    const { impl, calls } = stubFetch(200);

    await revokeRefreshToken('autoworkshop-customer-web', 'the-refresh-token', impl);

    const body = new URLSearchParams(calls[0]!.body);
    expect(body.get('token_type_hint')).toBe('refresh_token');
    expect(body.get('token')).toBe('the-refresh-token');
    expect(body.get('client_id')).toBe('autoworkshop-customer-web');
  });

  it('sends no client secret — these are public clients', async () => {
    const { impl, calls } = stubFetch(200);
    await revokeRefreshToken('autoworkshop-fleet-web', 'r', impl);
    expect(new URLSearchParams(calls[0]!.body).has('client_secret')).toBe(false);
  });

  it('reports true on 2xx', async () => {
    const { impl } = stubFetch(200);
    expect(await revokeRefreshToken('c', 'r', impl)).toBe(true);
  });

  it('reports FALSE on a non-2xx — RFC 7009 returns 200 even for an already-dead token', async () => {
    // So a non-2xx is a genuine failure to revoke, never "it was already gone".
    // Collapsing the two is how a live credential gets reported as revoked.
    const { impl } = stubFetch(503);
    expect(await revokeRefreshToken('c', 'r', impl)).toBe(false);
  });

  it('reports false rather than throwing when the endpoint is unreachable', async () => {
    // Fails soft on purpose: sign-out must still clear the cookie and end the
    // Keycloak session. A user who cannot sign out at all is left MORE exposed
    // than one whose refresh token outlives the session.
    const impl = (async () => {
      throw new TypeError('fetch failed');
    }) as unknown as typeof fetch;

    await expect(revokeRefreshToken('c', 'r', impl)).resolves.toBe(false);
  });
});

describe('postLogoutOrigin', () => {
  const original = process.env['AUTH_URL'];
  afterEach(() => {
    if (original === undefined) delete process.env['AUTH_URL'];
    else process.env['AUTH_URL'] = original;
  });

  it('prefers AUTH_URL over the request Host', async () => {
    // AUTH_URL is set per service by provision-web-service.yml and is what
    // Auth.js already builds callback URLs from. Preferring it keeps sign-in and
    // sign-out on ONE origin; the Host header is client-supplied.
    process.env['AUTH_URL'] = 'https://autoworkshop.aiappinvent.com';
    expect(await postLogoutOrigin()).toBe('https://autoworkshop.aiappinvent.com');
  });

  it('strips a trailing slash so the URL is not built with a double one', async () => {
    process.env['AUTH_URL'] = 'https://autoworkshop.aiappinvent.com/';
    expect(await postLogoutOrigin()).toBe('https://autoworkshop.aiappinvent.com');
  });
});

/**
 * Supervisor review 2026-07-28. Each of these pins a way sign-out could go back
 * to LOOKING successful while leaving the Keycloak session alive.
 */
describe('the id token survives a refresh', () => {
  it('is carried forward when the realm returns none', async () => {
    // Without this the id token vanishes on the first refresh that omits it,
    // `id_token_hint` disappears from the end-session URL, and Keycloak can no
    // longer identify the session to end. The local cookie still clears, so the
    // sign-out reports success — and the next person at a shared terminal signs
    // in silently as the previous one.
    const impl = (async () =>
      ({ ok: true, status: 200, json: async () => ({ access_token: 'a', expires_in: 300 }) }) as unknown as Response) as unknown as typeof fetch;

    const result = await refreshAccessToken('c', 'r', impl, 'the-original-id-token');
    expect(result.idToken).toBe('the-original-id-token');
  });

  it('prefers a freshly issued id token over the carried one', async () => {
    const impl = (async () =>
      ({
        ok: true,
        status: 200,
        json: async () => ({ access_token: 'a', expires_in: 300, id_token: 'fresh' }),
      }) as unknown as Response) as unknown as typeof fetch;

    const result = await refreshAccessToken('c', 'r', impl, 'stale');
    expect(result.idToken).toBe('fresh');
  });
});

describe('keycloakSignOutUrl', () => {
  it('always identifies the client, so logout validates without an id token', async () => {
    // Keycloak resolves the client for post_logout_redirect_uri validation from
    // `id_token_hint` OR `client_id`. With NEITHER it refuses the request and
    // does not end the session.
    const url = new URL(keycloakSignOutUrl(undefined, 'http://localhost:3000', 'autoworkshop-customer-web'));
    expect(url.searchParams.get('client_id')).toBe('autoworkshop-customer-web');
    expect(url.searchParams.get('post_logout_redirect_uri')).toBe('http://localhost:3000');
    expect(url.searchParams.has('id_token_hint')).toBe(false);
  });

  it('sends both when the id token is present', async () => {
    const url = new URL(keycloakSignOutUrl('an-id-token', 'http://localhost:3000', 'autoworkshop-fleet-web'));
    expect(url.searchParams.get('id_token_hint')).toBe('an-id-token');
    expect(url.searchParams.get('client_id')).toBe('autoworkshop-fleet-web');
  });
});
