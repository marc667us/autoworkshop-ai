import { describe, expect, it } from 'vitest';
import {
  isExpired,
  refreshAccessToken,
  RefreshFailedError,
  REFRESH_SKEW_SECONDS,
} from './tokens';

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
