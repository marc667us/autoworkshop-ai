import Link from 'next/link';
import { primitive } from '@autoworkshop/design-tokens';

/**
 * Solar's landing palette — the same constants the landing uses, because this
 * panel sits ON that page. Left on the theme tokens it rendered a light card in
 * the middle of a dark shop front, which is precisely how the page came to look
 * wrong. Read from `solar-pv-designer-lite/templates/base.html` `:root`.
 *
 * ⚠️ Duplicated rather than exported from the landing: this file is imported on
 * its own, and a circular import between the two would be a worse trade than
 * eleven literals. If a third file ever needs them, they move to a module of
 * their own — not into `@autoworkshop/design-tokens`, which would repaint the
 * whole application shell.
 */
const SOLAR = {
  bg: '#0a0a14',
  card: '#0f0f22',
  cardAlt: '#0a0a14',
  border: '#1e1e3a',
  text: '#e2e2f0',
  sub: '#9090c0',
  muted: '#6868a0',
  gold: '#f59e0b',
  orange: '#ea580c',
  green: '#22c55e',
  radius: '14px',
} as const;
import type { PublicVin } from './public-api';

/**
 * VIN SEARCH — the landing page's hook, and the top of the sign-up funnel.
 *
 * Owner request 2026-08-03: "public can search vehicle information by entering
 * their [VIN] in the public landing page, the results page must have [a] button
 * or link for them to see more of the results, when the user clicks on this
 * link or button they are made to sign up and go back and log in via kc before
 * seeing all the results".
 *
 * ── WHY A PLAIN GET FORM, WITH NO JAVASCRIPT ───────────────────────────────
 *
 * It submits to the page's own URL and the server renders the answer. That
 * makes a VIN result a REAL ADDRESS — shareable, linkable, back-button-able,
 * and workable on a phone with one bar of signal, which is the actual condition
 * of somebody standing next to a broken car. It matches the parts and mechanic
 * searches already on this page rather than introducing a second interaction
 * model on the same screen.
 *
 * ── THE GATE IS NOT HERE ───────────────────────────────────────────────────
 *
 * ⚠️ This component CANNOT hide anything, because it is never sent anything to
 * hide. `/public/vin/:vin` returns make, region, country and year and withholds
 * the rest at the API. The "sign up to see the rest" panel below lists what the
 * API SAYS is available (`moreAvailable`) — it is an advertisement for data
 * this page has never held. A version of this that received the full decode and
 * rendered half would be a lock with the key taped to it.
 */

const CARD: React.CSSProperties = {
  border: `1px solid ${SOLAR.border}`,
  borderRadius: primitive.radius.lg,
  padding: primitive.space[4],
};

export function VinSearch({
  vinQuery,
  result,
}: {
  /** What the visitor typed, so the field keeps its value after submitting. */
  vinQuery: string;
  /** Null when they have not searched yet. */
  result: PublicVin | null;
}) {
  return (
    <section aria-labelledby="vin-search" style={CARD}>
      <h2
        id="vin-search"
        style={{
          margin: 0,
          fontSize: primitive.fontSize.lg,
          color: SOLAR.text,
        }}
      >
        Check any vehicle by VIN — free
      </h2>
      <p
        style={{
          color: SOLAR.sub,
          fontSize: primitive.fontSize.sm,
          margin: `${primitive.space[2]} 0 ${primitive.space[4]}`,
          maxWidth: '48rem',
        }}
      >
        The 17-character number on your dashboard, door frame, or insurance
        papers. No account needed to check who made it and when.
      </p>

      {/* GET, not POST: the result must be a URL somebody can share or return
          to. A POST would make every result unreachable by the back button. */}
      <form method="get" style={{ display: 'flex', gap: primitive.space[2], flexWrap: 'wrap' }}>
        <label htmlFor="vin" style={SR_ONLY}>
          Vehicle identification number
        </label>
        <input
          id="vin"
          name="vin"
          defaultValue={vinQuery}
          placeholder="e.g. 1HGCM82633A004352"
          // 25, not 17: people paste VINs with the spaces and hyphens they are
          // printed with, and the API strips them. A 17-character cap would
          // silently truncate a pasted, correctly-grouped VIN.
          maxLength={25}
          autoComplete="off"
          spellCheck={false}
          style={{
            flex: '1 1 20rem',
            minWidth: '14rem',
            padding: `${primitive.space[3]} ${primitive.space[3]}`,
            border: `1px solid ${SOLAR.border}`,
            borderRadius: primitive.radius.md,
            background: SOLAR.card,
            color: SOLAR.text,
            fontSize: primitive.fontSize.base,
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
            // A VIN is upper-case; typing it lower and seeing it stay lower
            // makes people wonder whether it registered.
            textTransform: 'uppercase',
          }}
        />
        <button
          type="submit"
          style={{
            padding: `${primitive.space[3]} ${primitive.space[6]}`,
            border: 'none',
            borderRadius: primitive.radius.md,
            background: primitive.color.blue[600],
            color: primitive.color.grey[0],
            fontSize: primitive.fontSize.base,
            fontWeight: 600,
            fontFamily: 'inherit',
            cursor: 'pointer',
          }}
        >
          Check this VIN
        </button>
      </form>

      {result ? <VinResult result={result} /> : null}
    </section>
  );
}

function VinResult({ result }: { result: PublicVin }) {
  if (!result.valid) {
    return (
      <div
        role="status"
        style={{
          marginTop: primitive.space[4],
          padding: primitive.space[4],
          borderRadius: primitive.radius.md,
          border: `1px solid ${SOLAR.orange}`,
          color: SOLAR.text,
          fontSize: primitive.fontSize.sm,
        }}
      >
        {/* The API's own sentence, which names the ACTUAL rule — "a VIN never
            contains I, O or Q, check for a 1 or a 0" beats "invalid VIN",
            because only one of them lets somebody fix it. */}
        {result.problem ?? 'That does not look like a VIN.'}
      </div>
    );
  }

  const facts: Array<[string, string | undefined]> = [
    ['Manufacturer', result.manufacturer],
    ['Model year', result.modelYear ? String(result.modelYear) : undefined],
    ['Built in', result.country ?? result.region],
  ];

  return (
    <div style={{ marginTop: primitive.space[4] }}>
      <p
        style={{
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
          fontSize: primitive.fontSize.sm,
          color: SOLAR.sub,
          margin: `0 0 ${primitive.space[3]}`,
        }}
      >
        {result.vin}
      </p>

      <dl
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(11rem, 1fr))',
          gap: primitive.space[3],
          margin: 0,
        }}
      >
        {facts.map(([label, value]) => (
          <div key={label}>
            <dt style={{ fontSize: primitive.fontSize.xs, color: SOLAR.sub }}>
              {label}
            </dt>
            <dd
              style={{
                margin: 0,
                fontSize: primitive.fontSize.base,
                fontWeight: 600,
                color: SOLAR.text,
              }}
            >
              {/* ⚠️ SAYS "Not known from the VIN" RATHER THAN GUESSING. The
                  manufacturer table is deliberately partial and positions 4-8
                  are manufacturer-specific; an invented answer on a public page
                  is worse than an absent one, especially for a workshop about to
                  order a part. */}
              {value ?? (
                <span style={{ fontWeight: 400, color: SOLAR.sub }}>
                  Not known from the VIN alone
                </span>
              )}
            </dd>
          </div>
        ))}
      </dl>

      {result.moreAvailable?.length ? (
        <div
          style={{
            marginTop: primitive.space[4],
            padding: primitive.space[4],
            borderRadius: primitive.radius.md,
            background: SOLAR.cardAlt,
            border: `1px solid ${SOLAR.border}`,
          }}
        >
          <h3
            style={{
              margin: 0,
              fontSize: primitive.fontSize.base,
              color: SOLAR.text,
            }}
          >
            There is more on this vehicle
          </h3>

          {/* ⚠️ NAMES WHAT IS BEHIND THE GATE, FIELD BY FIELD. "Sign up to see
              more" asks somebody to register on faith; a list lets them decide
              whether it is worth an account. The list comes from the API, so it
              cannot drift out of step with what the signed-in endpoint returns. */}
          <ul
            style={{
              margin: `${primitive.space[2]} 0 ${primitive.space[4]}`,
              paddingLeft: primitive.space[4],
              color: SOLAR.sub,
              fontSize: primitive.fontSize.sm,
              lineHeight: 1.7,
            }}
          >
            {result.moreAvailable.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>

          {/* ⚠️ CARRIES THE VIN THROUGH THE WHOLE ROUND TRIP. Sign up, Keycloak,
              back — and they land on THIS VIN's full result, not an empty form
              they must retype seventeen characters into. `callbackUrl` is what
              Auth.js returns to after the provider; sending them to a bare
              dashboard is how a funnel loses the person at the last step. */}
          <Link
            href={`/api/auth/signin?callbackUrl=${encodeURIComponent(
              `/vehicle-lookup?vin=${result.vin}`,
            )}`}
            style={{
              display: 'inline-block',
              padding: `${primitive.space[3]} ${primitive.space[6]}`,
              borderRadius: primitive.radius.md,
              background: primitive.color.blue[600],
              color: primitive.color.grey[0],
              fontSize: primitive.fontSize.base,
              fontWeight: 600,
              textDecoration: 'none',
            }}
          >
            Sign up free to see it all
          </Link>
          <p
            style={{
              margin: `${primitive.space[3]} 0 0`,
              fontSize: primitive.fontSize.xs,
              color: SOLAR.sub,
            }}
          >
            Already have an account? The same button signs you in, and brings you
            straight back to this vehicle.
          </p>
        </div>
      ) : null}
    </div>
  );
}

/** Visually hidden, still announced. Not `display:none`, which removes it. */
const SR_ONLY: React.CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
  border: 0,
};
