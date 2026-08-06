/**
 * Wakes Keycloak while the visitor is still reading, instead of when they click.
 *
 * ── 🔴 THE DEFECT THIS EXISTS TO FIX ────────────────────────────────────────
 *
 * Keycloak sleeps on Render's free tier after 15 minutes idle, and its cold
 * start was MEASURED at 125s on 2026-08-06 and 136s on 2026-08-03. Until now
 * nothing started that wake until the visitor had already pressed "Sign in" —
 * so the entire two minutes was spent with the person sitting in front of an
 * error screen. `AuthErrorScreen` made that wait HONEST; it could not make it
 * shorter.
 *
 * The wake begins the moment ANY request reaches Keycloak. It does not have to
 * be the sign-in request. So a page that renders a "Sign in" control can fire
 * one throwaway request at the realm's discovery document while the visitor is
 * still reading, and the container starts booting immediately. By the time they
 * click — typically tens of seconds later on a landing page — a large part of
 * the wake is already spent.
 *
 * ── 🔴 WHY THIS IS NOT THE 24/7 WARMER THE COST RULE REFUSES ────────────────
 *
 * `AuthErrorScreen`'s header and `keep-warm.yml`'s header both refuse a warmer,
 * and they are right about the thing they refuse: FOUR free Render services
 * share ONE 750-instance-hour monthly allowance, a month is ~730 hours, so
 * holding Keycloak up around the clock consumes the whole allowance alone and
 * starves the other three. That is what suspended this account with
 * `suspenders: ['billing']` on 2026-07-28.
 *
 * This is a different shape and the distinction is the whole argument:
 *
 *   * A CRON WARMER spends hours whether or not anybody is using the product.
 *     It is warm at 04:00 on a Sunday for nobody.
 *   * THIS spends hours only when a real person is on a real page, and stops
 *     spending them 15 minutes after the last one leaves. Cost is proportional
 *     to use, which is the only cost shape a free tier can actually afford.
 *
 * It also covers the hours the cron CANNOT. `keep-warm.yml` runs 08:00–18:00
 * UTC on weekdays, deliberately and correctly. The owner was signing in at
 * 22:12 UTC on 2026-08-06 — four hours after the window closed — and paid the
 * full 125s wake. Widening the cron window to cover evenings would spend those
 * hours every evening, occupied or not. This spends them only on the evenings
 * somebody is actually working.
 *
 * ⚠️ IT IS NOT FREE, AND THE BOUND IS THE THROTTLE. A visitor who lands and
 * never signs in still wakes Keycloak for ~15 minutes (~0.25 instance-hours).
 * `PREWARM_INTERVAL_MS` is what stops that becoming per-request: one ping per
 * five minutes per server process, so a hundred visitors in an hour cost the
 * same twelve pings as one visitor does. Do not remove the throttle to "make it
 * more responsive" — the throttle is the cost control.
 *
 * ⚠️ CALL IT, NEVER AWAIT IT. Awaiting would put the 125s wake on the page's
 * own critical path and make every cold page load worse than the problem being
 * solved. It returns void for that reason: there is nothing useful to await.
 */

import { keycloakIssuer } from './config';

/**
 * Five minutes, comfortably inside Render's 15-minute idle timeout — the same
 * interval `keep-warm.yml` loops at, and for the same reason: it is the largest
 * gap that still guarantees the service never goes down between pings.
 *
 * Larger would open a window where Keycloak sleeps mid-session. Smaller buys
 * nothing, because the service cannot idle out in under 15 minutes anyway, and
 * costs a request every time.
 */
export const PREWARM_INTERVAL_MS = 5 * 60 * 1000;

/**
 * 150s, not the 10s a health check would use.
 *
 * A cap that expires MID-WAKE aborts the very wake it triggered, which is how a
 * warmer ends up proving nothing — the same reasoning that took `keep-warm.yml`
 * from 90s to 150s after a run logged `HTTP 000 in 90.002589s` against a
 * Keycloak that answered in 1.25s seven minutes later. The measured worst wake
 * is 136s; this is that plus headroom.
 */
export const PREWARM_TIMEOUT_MS = 150_000;

/**
 * When the last ping was STARTED, per server process.
 *
 * Started, not finished, and that matters: a wake takes up to 136 seconds, so
 * stamping on completion would let every request that arrives during those 136
 * seconds fire its own ping. One visitor loading five pages during a cold start
 * would open five concurrent 150-second sockets against a container that is
 * already starting — the throttle would be inert exactly when it is needed.
 *
 * Module scope, so it is per-process rather than per-request. Render's free tier
 * runs a single instance, so this is effectively global. On a multi-instance
 * deployment each instance would ping independently, which is harmless: the
 * cost ceiling rises with instance count, not with traffic.
 */
let lastPrewarmStartedAt: number | null = null;

/** Test seam — resets the throttle so cases cannot leak into one another. */
export function resetPrewarmThrottle(): void {
  lastPrewarmStartedAt = null;
}

export interface PrewarmOptions {
  /** Injected in tests. Defaults to the global `fetch`. */
  fetchImpl?: typeof fetch;
  /** Injected in tests. Defaults to `Date.now`. */
  now?: () => number;
}

/**
 * Fire one throwaway request at Keycloak's discovery document, at most once per
 * `PREWARM_INTERVAL_MS`.
 *
 * Returns whether a ping was actually STARTED — for tests and for callers that
 * want to log. It never reports whether the ping SUCCEEDED, because that answer
 * would take up to 150 seconds and nothing is waiting for it.
 */
export function prewarmKeycloak(options: PrewarmOptions = {}): boolean {
  const now = options.now ?? Date.now;
  const doFetch = options.fetchImpl ?? globalThis.fetch;

  // Nothing to wake without a fetch — old runtimes, or a test environment that
  // has deliberately removed it. Silently doing nothing is correct here: this is
  // an optimisation, and an optimisation must never be the thing that breaks a
  // page.
  //
  // ⚠️ TESTING THIS BRANCH REQUIRES A NON-NULLISH NON-FUNCTION, e.g. `0`, NOT
  // `undefined`. `??` above treats both `undefined` and `null` as "not supplied"
  // and falls through to the real `globalThis.fetch`, which EXISTS on Node 20 —
  // so a test passing `undefined` here does not exercise this guard at all, it
  // fires a genuine network request at whatever KEYCLOAK_URL resolves to and
  // then passes for the wrong reason. That is precisely how it was first
  // written, and the throttle assertion downstream is what exposed it.
  if (typeof doFetch !== 'function') return false;

  const at = now();
  if (lastPrewarmStartedAt !== null && at - lastPrewarmStartedAt < PREWARM_INTERVAL_MS) {
    return false;
  }

  let url: string;
  try {
    // `keycloakIssuer()` reads the environment at call time and can throw if the
    // configuration is absent. A missing KEYCLOAK_URL must not take down a page
    // that would otherwise render perfectly well signed-out.
    url = `${keycloakIssuer()}/.well-known/openid-configuration`;
  } catch {
    return false;
  }

  // Stamped BEFORE the request, so a wake in progress suppresses further pings.
  // See the note on `lastPrewarmStartedAt`.
  //
  // 🔴 THE PREVIOUS VALUE IS KEPT SO A FAILED START CAN GIVE THE THROTTLE BACK.
  // Stamping unconditionally meant a synchronous throw — a runtime without
  // `AbortSignal.timeout`, or a `fetch` that rejects a malformed URL inline —
  // burned five minutes of throttle for a ping that was never sent. That
  // contradicted this function's own contract ("returns whether a ping was
  // actually STARTED") and would have silently disabled prewarming altogether
  // on exactly the runtimes where it already fails. Caught by Codex, 2026-08-06.
  const previous = lastPrewarmStartedAt;
  lastPrewarmStartedAt = at;

  try {
    void doFetch(url, {
      // The response is thrown away — only the fact that the request REACHED
      // Render matters, because that is what starts the container. `HEAD` was
      // considered and rejected: Keycloak's discovery endpoint is a plain
      // document handler and a HEAD against it is not exercised anywhere, so
      // GET is the request we actually know answers.
      method: 'GET',
      // Never serve a cached copy. A cached 200 would satisfy this call without
      // a single byte reaching Render, so the prewarm would report success
      // while waking nothing — the exact failure mode that made Solar's
      // keep-warm green and useless for weeks.
      cache: 'no-store',
      signal: AbortSignal.timeout(PREWARM_TIMEOUT_MS),
      // Fire-and-forget: a rejection here is expected during a cold start and
      // is not an error anybody should see. An unhandled rejection in a server
      // component would be logged as an application fault and, on some
      // runtimes, terminate the process.
    }).catch(() => {});
  } catch {
    // `AbortSignal.timeout` is absent on very old runtimes and `fetch` itself
    // can throw synchronously on a malformed URL. Neither is worth a page.
    //
    // Nothing left the process, so the throttle is handed back rather than
    // spent. Retrying costs nothing here: a synchronous throw means no request
    // was made, so there is no host to hammer.
    lastPrewarmStartedAt = previous;
    return false;
  }

  return true;
}
