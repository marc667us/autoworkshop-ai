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
 * ⚠️ THIS READS THE ENVIRONMENT AT RUNTIME, and that is only true because the
 * page that calls it declares `export const dynamic = 'force-dynamic'`
 * (`apps/workshop-web/app/page.tsx`). Remove that and Next would prerender the
 * route at BUILD time, freezing whatever the builder's environment held —
 * which is nothing — and the button would silently vanish again. Codex raised
 * exactly this on 2026-08-07 and it is the one line that keeps the fix working.
 *
 * @param env - the environment to read; pass `process.env` at the call site so
 *              this stays a pure function and can be asserted against.
 */
export function requestServiceHrefFrom(
  env: Record<string, string | undefined>,
): string | undefined {
  // FIRST NON-BLANK, not `??`. Nullish coalescing falls back only on
  // null/undefined, so a CUSTOMER_WEB_URL that is DECLARED AND EMPTY — exactly
  // what Render returns for a variable added without a value — would suppress a
  // perfectly good NEXT_PUBLIC_ value that was already working. The migration
  // from the old name would then break the very environments it promised not to.
  const raw = [env['CUSTOMER_WEB_URL'], env['NEXT_PUBLIC_CUSTOMER_WEB_URL']]
    .find((v) => typeof v === 'string' && v.trim() !== '');
  if (raw === undefined) return undefined;

  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    // Not absolute at all — a relative path, or nonsense. Both would produce a
    // same-host link that 404s on the apex while looking configured.
    return undefined;
  }

  // `new URL` happily parses `javascript:` and `mailto:`, and this value is
  // interpolated into an anchor. An explicit allow-list is the only safe read.
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return undefined;
  if (url.hostname === '') return undefined;

  // `https://user:pass@host` parses and renders as a link to `host`. Nothing in
  // this project needs credentials in a service URL, and a link carrying them
  // is a phishing shape rather than a configuration.
  if (url.username !== '' || url.password !== '') return undefined;

  // A base carrying a query or a fragment cannot have a path appended to it:
  // `https://host?x` + `/service…` yields `https://host?x/service…`, which is a
  // broken link that no test of the origin alone would catch.
  if (url.search !== '' || url.hash !== '') return undefined;

  // A path PREFIX is allowed — a reverse proxy may legitimately mount the
  // customer app under one — but the trailing slash is dropped so the joined
  // path never doubles up.
  const base = `${url.origin}${url.pathname}`.replace(/\/+$/, '');
  return `${base}${REQUEST_SERVICE_PATH}`;
}
