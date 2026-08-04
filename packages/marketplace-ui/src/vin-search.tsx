import Link from 'next/link';
import { primitive } from '@autoworkshop/design-tokens';
import { BUTTON_PRIMARY, CARD, FIELD, SOLAR, SectionHeading } from './solar-theme';
import type { PublicVin } from './public-api';

/**
 * ⚠️ THE PALETTE USED TO BE DUPLICATED IN THIS FILE, with a comment arguing that
 * eleven literals beat a circular import between this panel and the landing. The
 * reasoning was sound and it drifted anyway: the copy covered the CARD but not
 * the CONTROLS, so this panel kept `primitive.color.blue[600]` buttons while the
 * page around it went gold — a blue submit button in the middle of an amber shop
 * front, on the one panel the whole sign-up funnel runs through.
 *
 * `./solar-theme` is a module neither file owns, so there is no cycle and one
 * definition. The lesson is worth keeping: duplication defended as "only a few
 * literals" drifts in the parts nobody duplicated.
 */

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
    <section aria-labelledby="vin-search">
      <SectionHeading
        id="vin-search"
        kicker="Free tool"
        title="Check any vehicle by VIN"
        blurb="The 17-character number on your dashboard, door frame, or insurance papers. No account needed to check who built it and when."
      />

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
            ...FIELD,
            flex: '1 1 20rem',
            minWidth: '14rem',
            width: 'auto',
            padding: '12px 14px',
            fontSize: '16px',
            fontFamily: primitive.fontFamily.mono,
            letterSpacing: '.5px',
            // A VIN is upper-case; typing it lower and seeing it stay lower
            // makes people wonder whether it registered.
            textTransform: 'uppercase',
          }}
        />
        <button type="submit" style={{ ...BUTTON_PRIMARY, padding: '12px 28px', fontSize: '15px' }}>
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
          borderRadius: '12px',
          border: `1px solid ${SOLAR.orange}`,
          background: 'rgba(234,88,12,.08)',
          color: SOLAR.text,
          fontSize: '14px',
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
    // The answer is a CARD, on Solar's card scale — a bare block of text under
    // the form read as part of the form rather than as its result.
    <div style={{ ...CARD, height: 'auto', marginTop: primitive.space[4] }}>
      <p
        style={{
          fontFamily: primitive.fontFamily.mono,
          fontSize: '13px',
          letterSpacing: '.5px',
          color: SOLAR.muted,
          margin: 0,
        }}
      >
        {result.vin}
      </p>

      <dl
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(11rem, 1fr))',
          gap: primitive.space[4],
          margin: 0,
        }}
      >
        {facts.map(([label, value]) => (
          <div key={label}>
            <dt
              style={{
                fontSize: '11px',
                fontWeight: 700,
                letterSpacing: '.5px',
                textTransform: 'uppercase',
                color: SOLAR.muted,
              }}
            >
              {label}
            </dt>
            <dd
              style={{
                margin: '4px 0 0',
                fontSize: '17px',
                fontWeight: 800,
                color: SOLAR.text,
              }}
            >
              {/* ⚠️ SAYS "Not known from the VIN" RATHER THAN GUESSING. The
                  manufacturer table is deliberately partial and positions 4-8
                  are manufacturer-specific; an invented answer on a public page
                  is worse than an absent one, especially for a workshop about to
                  order a part. */}
              {value ?? (
                <span style={{ fontWeight: 400, fontSize: '13px', color: SOLAR.muted }}>
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
            marginTop: primitive.space[2],
            padding: primitive.space[4],
            borderRadius: '12px',
            // Solar's magnet tint — this IS the funnel step, and it should read
            // as the offer it is rather than as another neutral panel.
            background: 'linear-gradient(135deg, rgba(245,158,11,.10), rgba(34,197,94,.06))',
            border: '1px solid rgba(245,158,11,.35)',
          }}
        >
          <h3
            style={{
              margin: 0,
              fontSize: '15px',
              fontWeight: 800,
              color: SOLAR.goldLight,
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
            style={{ ...BUTTON_PRIMARY, padding: '12px 28px', fontSize: '15px' }}
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
