import Link from 'next/link';
import { primitive } from '@autoworkshop/design-tokens';
import { SOLAR, CONTAINER, GradientDivider, SectionHeading } from './solar-theme';
import type { PublicInsuranceProduct } from './public-api';

/**
 * THE SHOPPER'S HALF OF THE INSURANCE MARKETPLACE — slice 17.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * WHY THIS IS IN THE PACKAGE AND NOT IN `apps/web/app/cover/`.
 *
 * §0.3: the public surface is a PACKAGE so a second front door renders the
 * same implementation rather than a near-miss copy. `marketplace-landing.tsx`
 * is here for exactly that reason, and the palette has already drifted once
 * when a public panel kept its own copy of eleven hex values.
 *
 * ⚠️ AND IT USES `solar-theme`, NOT `@autoworkshop/ui`. Those two are different
 * languages on purpose: `@autoworkshop/ui` is the signed-in product's design
 * system (light/dark, WorkspaceShell); `solar-theme` is the fixed-dark
 * MARKETING grammar the landing page speaks. A shopper arriving from `/` must
 * not cross a visual seam, which is what a `PageHeader` + `DataTable` here
 * would have produced.
 * ══════════════════════════════════════════════════════════════════════════
 */

/** `third_party_fire_theft` -> `Third party, fire and theft`. */
export function coverTypeLabel(coverType: string): string {
  const spaced = coverType.replace(/_/g, ' ');
  const withAnd = spaced.replace(/^third party fire theft$/, 'third party, fire and theft');
  return withAnd.charAt(0).toUpperCase() + withAnd.slice(1);
}

/**
 * ⚠️ `Intl.NumberFormat` IS NOT USED HERE, AND THAT IS DELIBERATE. The premium
 * arrives as a STRING because `numeric` loses precision through `number`, and
 * feeding it to a formatter means parsing it back into the float this codebase
 * has twice decided not to create. The currency code is printed beside the
 * amount exactly as `my-products-screen.tsx` does for the insurer.
 */
function money(currency: string, amount: string): string {
  return `${currency} ${amount}`;
}


/**
 * An external link the PRODUCT OWNER typed, rendered on an ANONYMOUS page.
 *
 * 🔴 RETURNS null FOR ANYTHING THAT IS NOT http/https. React does not sanitize
 * `href`: it warns about `javascript:` URLs in development and renders them in
 * production, so an insurer-supplied `javascript:alert(document.cookie)` would
 * be stored XSS reachable by any visitor with no account. `data:text/html,…` is
 * the same class.
 *
 * ⚠️ THE API REFUSES THESE AT THE BOUNDARY TOO, AND THIS IS STILL REQUIRED:
 * rows created before that check exist, and a boundary check protects only what
 * has not been written yet.
 */
function safeExternalHref(raw: string | null): string | null {
  if (!raw) return null;
  try {
    // `new URL` throws on a relative or malformed value, which is the answer we
    // want — a terms link has to be absolute to be followable.
    return /^https?:$/.test(new URL(raw).protocol) ? raw : null;
  } catch {
    return null;
  }
}

const panel: React.CSSProperties = {
  background: SOLAR.card,
  border: `1px solid ${SOLAR.border}`,
  borderRadius: SOLAR.radius,
  padding: primitive.space[6],
};

function Page({ children }: { children: React.ReactNode }) {
  return (
    <main
      style={{
        background: SOLAR.bg,
        color: SOLAR.text,
        minHeight: '100vh',
        padding: `${primitive.space[12]} ${primitive.space[5]}`,
      }}
    >
      <div style={{ maxWidth: CONTAINER, margin: '0 auto' }}>{children}</div>
    </main>
  );
}

/**
 * A row of facts. Used for both the card and the detail page so a premium never
 * renders one way in the list and another way on the page it links to.
 */
function Facts({ product }: { product: PublicInsuranceProduct }) {
  const rows: [string, string][] = [
    ['Cover', coverTypeLabel(product.coverType)],
    ['Premium', money(product.currency, product.premium)],
    ['Term', `${product.termMonths} month${product.termMonths === 1 ? '' : 's'}`],
  ];
  // 🔴 RENDERED ONLY WHEN PRESENT, never as "—". An excess of zero and an
  // excess that the insurer did not state are different facts, and printing a
  // dash for the second invites a shopper to read it as the first.
  if (product.excess !== null) rows.push(['Excess', money(product.currency, product.excess)]);
  return (
    <dl style={{ margin: 0, display: 'grid', gap: primitive.space[2] }}>
      {rows.map(([k, v]) => (
        <div key={k} style={{ display: 'flex', justifyContent: 'space-between', gap: primitive.space[3] }}>
          <dt style={{ color: SOLAR.muted, fontSize: '0.8125rem' }}>{k}</dt>
          <dd style={{ margin: 0, fontWeight: 600 }}>{v}</dd>
        </div>
      ))}
    </dl>
  );
}

export interface InsuranceCoverListProps {
  products: PublicInsuranceProduct[];
  /** Named rather than rendered as an empty page — the landing does the same. */
  problem: string | null;
}

/**
 * `/cover` — browse published cover. Anonymous, no account, no sign-in wall.
 *
 * 🔴 EVERY PRODUCT HERE IS PUBLISHED **AND** PLATFORM-VERIFIED, and that is
 * decided by the database, not by this component. 083's policy and 084's
 * projection both filter on the pair; a draft is not withheld by the page
 * choosing not to render it, which is the rule `PublicController`'s header
 * states about mechanics' contact details.
 */
export function InsuranceCoverList({ products, problem }: InsuranceCoverListProps) {
  return (
    <Page>
      <SectionHeading
        id="cover-heading"
        kicker="Insurance"
        title="Compare vehicle cover"
        blurb="Cover offered by insurers on the platform. Every product here has been verified before listing. Browsing and enquiring need no account."
      />

      {problem ? (
        // A NAMED failure, not an empty grid. "No products" and "the service is
        // down" look identical to a visitor otherwise, and this repository has
        // recorded a 200-with-an-empty-list as the worst way this can fail.
        <div
          role="status"
          style={{ ...panel, borderColor: SOLAR.orange, color: SOLAR.text }}
        >
          <strong style={{ display: 'block', marginBottom: primitive.space[2] }}>
            Cover could not be loaded
          </strong>
          <span style={{ color: SOLAR.sub }}>{problem}</span>
          <div style={{ marginTop: primitive.space[4] }}>
            <Link href="/" style={{ color: SOLAR.goldLight }}>
              Browse parts and mechanics instead
            </Link>
          </div>
        </div>
      ) : products.length === 0 ? (
        <div style={panel}>
          <strong style={{ display: 'block', marginBottom: primitive.space[2] }}>
            No cover is listed yet
          </strong>
          <span style={{ color: SOLAR.sub }}>
            Insurers list products here once the platform has verified them. Check back shortly.
          </span>
          <div style={{ marginTop: primitive.space[4] }}>
            <Link href="/" style={{ color: SOLAR.goldLight }}>
              Browse parts and mechanics
            </Link>
          </div>
        </div>
      ) : (
        <ul
          style={{
            listStyle: 'none',
            margin: 0,
            padding: 0,
            display: 'grid',
            gap: primitive.space[5],
            // Responsive without a media query: the track floor is what stops a
            // three-across grid squashing on a phone. Required per module.
            gridTemplateColumns: 'repeat(auto-fill, minmax(17rem, 1fr))',
          }}
        >
          {products.map((p) => (
            <li key={p.id} style={panel}>
              <h3 style={{ margin: `0 0 ${primitive.space[1]}`, fontSize: '1.0625rem' }}>{p.name}</h3>
              <p style={{ margin: `0 0 ${primitive.space[4]}`, color: SOLAR.sub, fontSize: '0.8125rem' }}>
                {p.insurer}
              </p>
              <Facts product={p} />
              <div style={{ marginTop: primitive.space[5] }}>
                <Link
                  href={`/cover/${p.id}`}
                  style={{
                    display: 'inline-block',
                    background: SOLAR.gold,
                    color: '#1a1a2e',
                    fontWeight: 700,
                    padding: `${primitive.space[2]} ${primitive.space[4]}`,
                    borderRadius: '9999px',
                    textDecoration: 'none',
                  }}
                >
                  {/* The accessible name says WHICH product — a grid of
                      identical "View cover" links is unusable by screen reader
                      and was flagged on the parts grid already. */}
                  View cover<span style={{ position: 'absolute', left: '-9999px' }}> for {p.name}</span>
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}

      <GradientDivider />
    </Page>
  );
}

export interface InsuranceCoverDetailProps {
  product: PublicInsuranceProduct;
  /** The enquiry form, passed in because it is a client component. */
  enquiryForm: React.ReactNode;
}

/** `/cover/[id]` — one product, and the way to ask about it. */
export function InsuranceCoverDetail({ product, enquiryForm }: InsuranceCoverDetailProps) {
  return (
    <Page>
      <p style={{ margin: `0 0 ${primitive.space[5]}` }}>
        <Link href="/cover" style={{ color: SOLAR.goldLight }}>
          &larr; All cover
        </Link>
      </p>

      <SectionHeading
        id="cover-detail-heading"
        kicker={product.insurer}
        title={product.name}
        blurb={product.summary ?? undefined}
      />

      <div
        style={{
          display: 'grid',
          gap: primitive.space[6],
          gridTemplateColumns: 'repeat(auto-fit, minmax(19rem, 1fr))',
          alignItems: 'start',
        }}
      >
        <section style={panel} aria-label="What this cover costs">
          <Facts product={product} />
          {safeExternalHref(product.termsUrl) ? (
            <p style={{ marginTop: primitive.space[5], marginBottom: 0 }}>
              <a
                href={safeExternalHref(product.termsUrl) as string}
                // 🔴 `noopener noreferrer` ON AN INSURER-SUPPLIED URL. The
                // address is typed by a third party into their own product
                // record; without this, the page it opens gets a handle on this
                // window through `window.opener`.
                rel="noopener noreferrer nofollow"
                target="_blank"
                style={{ color: SOLAR.goldLight }}
              >
                Read the policy terms (opens in a new tab)
              </a>
            </p>
          ) : null}
        </section>

        <section style={panel} aria-labelledby="enquiry-heading">
          <h2 id="enquiry-heading" style={{ margin: `0 0 ${primitive.space[2]}`, fontSize: '1.125rem' }}>
            Ask {product.insurer} about this cover
          </h2>
          <p style={{ margin: `0 0 ${primitive.space[5]}`, color: SOLAR.sub, fontSize: '0.8125rem' }}>
            {/* Stated plainly because it decides whether a shopper starts the
                form at all — and because Q1 was decided as an insurer-recorded
                enquiry rather than self-service checkout. Promising a purchase
                here would be the signpost-that-goes-nowhere failure. */}
            The insurer receives your details and replies to you directly. This is an
            enquiry, not a purchase — nothing is charged and no account is needed.
          </p>
          {enquiryForm}
        </section>
      </div>

      <GradientDivider />
    </Page>
  );
}

/**
 * The detail page when the API could not be asked — NOT a 404.
 *
 * 🔴 THE DISTINCTION IS THE WHOLE POINT OF THIS COMPONENT. "This cover is not
 * listed" and "we could not reach the service" are different facts, and only
 * one of them is actionable. Rendering the first when the second is true tells
 * a shopper an insurer's product does not exist, which they have no reason to
 * doubt and no reason to re-check. The route keeps `notFound()` for a genuine
 * 404 and renders this for everything else.
 */
export function InsuranceCoverUnavailable({ reason }: { reason: string }) {
  return (
    <Page>
      <SectionHeading
        id="cover-unavailable-heading"
        kicker="Insurance"
        title="This cover could not be loaded"
        blurb="The product may still be on sale — we could not reach the service to check."
      />
      <div role="status" style={{ ...panel, borderColor: SOLAR.orange }}>
        <p style={{ margin: `0 0 ${primitive.space[4]}`, color: SOLAR.sub }}>{reason}</p>
        {/* Two ways forward, because a refusal with no reachable alternative is
            this repository's most expensive recorded defect class. Reloading is
            the action that fixes a transient outage; the list is where a
            shopper can still make progress if it does not. */}
        <Link href="/cover" style={{ color: SOLAR.goldLight }}>
          Back to all cover
        </Link>
      </div>
      <GradientDivider />
    </Page>
  );
}
