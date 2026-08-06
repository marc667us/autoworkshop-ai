import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  prewarmKeycloak,
  resetPrewarmThrottle,
  PREWARM_INTERVAL_MS,
  PREWARM_TIMEOUT_MS,
} from './prewarm';

/**
 * What these tests are actually defending.
 *
 * The prewarm is an OPTIMISATION on the page-render path, which means its
 * failure modes are the expensive kind: if it throws it breaks a page that
 * would otherwise have rendered, and if its throttle is inert it opens one
 * 150-second socket per request against a container that is already starting.
 * Both are worse than not having it. So the tests below assert the guards by
 * INJECTING the failure each one prevents, rather than by watching the happy
 * path and inferring the rest.
 */

/** A fetch that never settles — a cold start in progress, which is the case
 *  the throttle exists for. */
function pendingFetch() {
  return vi.fn(() => new Promise<Response>(() => {})) as unknown as typeof fetch;
}

beforeEach(() => {
  resetPrewarmThrottle();
});

describe('prewarmKeycloak', () => {
  it('pings the realm discovery document, uncached', () => {
    const fetchImpl = pendingFetch();

    expect(prewarmKeycloak({ fetchImpl, now: () => 0 })).toBe(true);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const call = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call).toBeDefined();
    const [url, init] = call as [string, RequestInit];
    expect(url).toMatch(/\/realms\/[^/]+\/\.well-known\/openid-configuration$/);
    // `no-store` is load-bearing, not hygiene: a cached 200 would satisfy this
    // call without a byte reaching Render, so the prewarm would wake nothing
    // while reporting success — Solar's keep-warm failure mode exactly.
    expect(init).toMatchObject({ method: 'GET', cache: 'no-store' });
    expect(init.signal).toBeDefined();
  });

  it('THROTTLES a second call inside the interval — the cost control', () => {
    const fetchImpl = pendingFetch();

    expect(prewarmKeycloak({ fetchImpl, now: () => 0 })).toBe(true);
    // One second later, as a second page render would arrive.
    expect(prewarmKeycloak({ fetchImpl, now: () => 1_000 })).toBe(false);
    // And at the last instant before the interval elapses.
    expect(prewarmKeycloak({ fetchImpl, now: () => PREWARM_INTERVAL_MS - 1 })).toBe(false);

    // The assertion that matters. Without the throttle this is 3.
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('stamps the throttle at START, so a 136s wake does not admit a ping per request', () => {
    const fetchImpl = pendingFetch();

    // The wake begins and never completes within this test — exactly what a
    // cold start looks like.
    prewarmKeycloak({ fetchImpl, now: () => 0 });

    // Ten renders arrive during the wake, spread across two minutes. If the
    // throttle were stamped on COMPLETION rather than on start, every one of
    // these would open its own 150-second socket.
    for (let i = 1; i <= 10; i += 1) {
      expect(prewarmKeycloak({ fetchImpl, now: () => i * 12_000 })).toBe(false);
    }

    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('pings again once the interval has elapsed', () => {
    const fetchImpl = pendingFetch();

    prewarmKeycloak({ fetchImpl, now: () => 0 });
    expect(prewarmKeycloak({ fetchImpl, now: () => PREWARM_INTERVAL_MS })).toBe(true);

    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('uses a timeout longer than the measured 136s cold start', () => {
    // A cap that expires mid-wake aborts the wake it triggered. Guarding the
    // constant because the temptation to "tidy" it down to a health-check-sized
    // 10s is real, and the resulting prewarm would warm nothing.
    expect(PREWARM_TIMEOUT_MS).toBeGreaterThan(136_000);
  });

  it('does NOT reject the caller when the ping fails', async () => {
    // A cold start makes this the NORMAL outcome, not an edge case.
    const fetchImpl = vi.fn(() =>
      Promise.reject(new Error('connect ETIMEDOUT')),
    ) as unknown as typeof fetch;

    expect(() => prewarmKeycloak({ fetchImpl, now: () => 0 })).not.toThrow();

    // Let the rejection settle. If `.catch()` were missing this would surface as
    // an unhandled rejection — which in a server component is logged as an
    // application fault and on some runtimes kills the process.
    await Promise.resolve();
    await Promise.resolve();
  });

  /**
   * 🔴 `0`, NOT `undefined`. `fetchImpl ?? globalThis.fetch` treats `undefined`
   * AND `null` as "not supplied" and falls back to the real global fetch, which
   * exists on Node 20 — so passing `undefined` here does not reach the
   * no-fetch guard at all. It fires a REAL request at KEYCLOAK_URL and passes
   * for entirely the wrong reason. `0` is non-nullish and non-callable, so it
   * survives the `??` and lands on the guard being tested.
   *
   * This was found the hard way: the first version of these tests used
   * `undefined`, did live network I/O on every run, and was caught only because
   * the throttle assertion in the next test then failed.
   */
  const NO_FETCH = 0 as unknown as typeof fetch;

  it('does nothing, and does not throw, when fetch is unavailable', () => {
    expect(() => prewarmKeycloak({ fetchImpl: NO_FETCH, now: () => 0 })).not.toThrow();
    expect(prewarmKeycloak({ fetchImpl: NO_FETCH, now: () => 0 })).toBe(false);
  });

  it('does not consume the throttle when it declines to ping', () => {
    // A declined attempt must not block the next real one — otherwise a single
    // early call on a runtime without fetch would suppress prewarming for five
    // minutes after it became available.
    prewarmKeycloak({ fetchImpl: NO_FETCH, now: () => 0 });

    const fetchImpl = pendingFetch();
    expect(prewarmKeycloak({ fetchImpl, now: () => 1 })).toBe(true);
  });

  it('never throws when the fetch itself throws synchronously', () => {
    const fetchImpl = vi.fn(() => {
      throw new TypeError('Invalid URL');
    }) as unknown as typeof fetch;

    expect(() => prewarmKeycloak({ fetchImpl, now: () => 0 })).not.toThrow();
    expect(prewarmKeycloak({ fetchImpl, now: () => 0 })).toBe(false);
  });

  it('RETURNS THE THROTTLE after a synchronous throw — nothing was sent (Codex, LOW-1)', () => {
    const throwing = vi.fn(() => {
      throw new TypeError('Invalid URL');
    }) as unknown as typeof fetch;

    // Nothing left the process, so this must not spend the five-minute budget.
    expect(prewarmKeycloak({ fetchImpl: throwing, now: () => 0 })).toBe(false);

    // The very next render, one millisecond later, must still be allowed to
    // ping. Before the fix this returned false until t+5min, which silently
    // disabled prewarming on exactly the runtimes where it already fails.
    const working = pendingFetch();
    expect(prewarmKeycloak({ fetchImpl: working, now: () => 1 })).toBe(true);
    expect(working).toHaveBeenCalledTimes(1);
  });

  it('a synchronous throw does not erase an EARLIER successful stamp', () => {
    const working = pendingFetch();
    expect(prewarmKeycloak({ fetchImpl: working, now: () => 0 })).toBe(true);

    // A throwing call mid-interval restores the prior stamp rather than
    // clearing it — otherwise one bad call would open the floodgates on a
    // service that is already awake.
    const throwing = vi.fn(() => {
      throw new TypeError('Invalid URL');
    }) as unknown as typeof fetch;
    expect(prewarmKeycloak({ fetchImpl: throwing, now: () => 1_000 })).toBe(false);

    // Still throttled by the ORIGINAL ping at t=0, not released.
    expect(prewarmKeycloak({ fetchImpl: working, now: () => 2_000 })).toBe(false);
    expect(working).toHaveBeenCalledTimes(1);
  });
});
