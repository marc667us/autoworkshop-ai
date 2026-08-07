/**
 * WHERE THE CUSTOMER APP LIVES, as seen from the app that owns the apex.
 *
 * ── WHY THIS EXISTS AS A FUNCTION ──────────────────────────────────────────
 *
 * The "Request repair service" button — the one the owner asked for on
 * 2026-08-07, and the first call to action on the landing — renders ONLY when
 * this returns a value. So does "Request for Service" on every mechanic card.
 * On 2026-08-07 it shipped green (typecheck, lint, unit tests, a container
 * smoke test and a successful Render deploy) and COULD NOT APPEAR ON LIVE,
 * because the variable it reads was set on neither the service nor the build.
 * A button gated on configuration that nobody configured is a feature that
 * never runs, and every gate in the chain said it had shipped.
 *
 * Inlining the decision at the call site is what made it invisible. As a
 * function it can be asserted against, which is why the spec beside this file
 * asserts the REFUSALS and not just the happy path.
 *
 * ── THE NAME ───────────────────────────────────────────────────────────────
 *
 * `CUSTOMER_WEB_URL` — the name the entire e2e suite already uses. The apex
 * previously read `NEXT_PUBLIC_CUSTOMER_WEB_URL`, which was wrong twice over:
 * `NEXT_PUBLIC_` announces a value that Next inlines into the BROWSER bundle at
 * BUILD time, so a deploy-time change to a URL would have needed a rebuild —
 * and this value is read in a server component, where the browser never sees
 * it. `API_BASE_URL` next door carries the same reasoning and deliberately has
 * no `NEXT_PUBLIC_` twin. The old name is still accepted so that any
 * environment already carrying it keeps working.
 *
 * ── WHAT IT REFUSES, AND WHY EACH REFUSAL IS A REAL FAILURE ────────────────
 *
 * The Request for Service form is a CUSTOMER-WEB route and this landing is
 * served from the APEX — a different host. So only an ABSOLUTE url is usable:
 *
 *   - UNSET      → undefined. The mechanic card falls back to its sign-in
 *                  prompt rather than offering a link that goes nowhere.
 *   - BLANK      → undefined. Render returns an empty string for a variable
 *                  that is declared and never given a value, and interpolating
 *                  it yields `/service-and-repairs/request-service` — a
 *                  same-host path that 404s on the apex. It looks configured
 *                  and behaves worse than unconfigured.
 *   - RELATIVE   → undefined. Same failure as blank, and it reads as deliberate.
 *
 * A missing button is recoverable. A button that 404s on the exact step the
 * funnel exists to reach is not.
 */

/** The customer-web route that takes a complaint and a car description. */
export const REQUEST_SERVICE_PATH = '/service-and-repairs/request-service';

/**
 * Build the absolute href of the Request for Service form, or `undefined` when
 * the customer app's location is not usably configured.
 *
 * @param env - the environment to read; pass `process.env` at the call site so
 *              this stays a pure function and can be asserted against.
 */
export function requestServiceHrefFrom(
  env: Record<string, string | undefined>,
): string | undefined {
  const raw = env['CUSTOMER_WEB_URL'] ?? env['NEXT_PUBLIC_CUSTOMER_WEB_URL'];
  if (typeof raw !== 'string') return undefined;

  const base = raw.trim().replace(/\/+$/, '');
  if (base === '') return undefined;

  // Absolute only. `new URL` is not used here: it accepts far more than a web
  // origin (`mailto:`, `javascript:`), and this value ends up in an anchor.
  if (!/^https?:\/\/[^/]+/i.test(base)) return undefined;

  return `${base}${REQUEST_SERVICE_PATH}`;
}
