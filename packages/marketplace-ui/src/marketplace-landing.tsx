import Link from 'next/link';
import { primitive, themeVar } from '@autoworkshop/design-tokens';
import { visuallyHidden } from '@autoworkshop/ui';
import {
  CatalogueFacets,
  CatalogueStats,
  PublicMechanic,
  PublicPart,
  PublicVin,
} from './public-api';
import { VinSearch } from './vin-search';

/**
 * ABOSSEY OKAI AUTO PARTS MARKETPLACE — the public landing page.
 *
 * Layout pattern taken from Solar's `marketplace_public` template (ADR-011:
 * read Solar for patterns, never import from it): hero with a free-to-browse
 * badge and the sign-in / sign-up pair, a KPI strip, a filter bar, category
 * chips, then cards grouped under category headings.
 *
 * ⚠️ WHAT A SIGNED-OUT VISITOR MAY DO HERE, AND WHERE THE LINE IS.
 * View, and search. That is all. Every control on this page either filters what
 * is already public or sends the visitor to sign in. There is no control that
 * writes, and no field rendered that the public API does not already return —
 * in particular a mechanic's phone number is NOT in the response, so the
 * sign-in prompt on a mechanic card is a real gate rather than a hidden field.
 * Hiding data the browser already holds is not authorization; this repo has
 * been bitten by that distinction before.
 */

const CARD: React.CSSProperties = {
  border: `1px solid ${themeVar.borderDefault}`,
  borderRadius: primitive.radius.lg,
  background: themeVar.backgroundPrimary,
  padding: primitive.space[4],
  display: 'flex',
  flexDirection: 'column',
  gap: primitive.space[2],
  height: '100%',
  // LOAD-BEARING: a positioned ancestor keeps any absolutely-positioned
  // descendant from escaping the card and stretching the document.
  position: 'relative',
};

const FIELD: React.CSSProperties = {
  width: '100%',
  padding: `${primitive.space[2]} ${primitive.space[3]}`,
  border: `1px solid ${themeVar.borderDefault}`,
  borderRadius: primitive.radius.md,
  background: themeVar.backgroundPrimary,
  color: themeVar.textPrimary,
  fontSize: primitive.fontSize.sm,
  minWidth: 0,
};

const LABEL: React.CSSProperties = {
  display: 'block',
  fontSize: primitive.fontSize.xs,
  fontWeight: 600,
  color: themeVar.textSecondary,
  marginBottom: primitive.space[1],
};

const BUTTON_PRIMARY: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: `${primitive.space[2]} ${primitive.space[4]}`,
  borderRadius: primitive.radius.md,
  border: '1px solid transparent',
  background: primitive.color.blue[600],
  color: '#ffffff',
  fontWeight: 700,
  fontSize: primitive.fontSize.sm,
  textDecoration: 'none',
  cursor: 'pointer',
  whiteSpace: 'nowrap',
};

const BUTTON_SECONDARY: React.CSSProperties = {
  ...BUTTON_PRIMARY,
  background: 'transparent',
  color: themeVar.textPrimary,
  border: `1px solid ${themeVar.borderDefault}`,
};

export interface MarketplaceLandingProps {
  stats: CatalogueStats | null;
  facets: CatalogueFacets | null;
  parts: PublicPart[];
  total: number;
  mechanics: PublicMechanic[];
  /** The filters currently applied, echoed back into the form controls. */
  applied: {
    q: string;
    make: string;
    model: string;
    year: string;
    manufacturer: string;
    category: string;
    mechanicQuery: string;
  };
  /** What the visitor typed into the VIN box, echoed back into the field. */
  vinQuery: string;
  /** The FREE half of the VIN answer, or null when nothing was searched. */
  vinResult: PublicVin | null;
  /** Non-fatal problems, named rather than rendered as an empty page. */
  problems: string[];
  /**
   * The "Add to basket" control for a part card, supplied by the app.
   *
   * ⚠️ A RENDER PROP, NOT AN IMPORT, AND THAT IS WHAT LETS THIS PAGE BE SHARED.
   * The basket is `customer-web`'s: it is a client component writing that app's
   * own local storage. Importing it here would tie this package to one app and
   * reintroduce the copy-paste that §0.3 forbids — the alternative was a second
   * landing page that could silently disagree with the first.
   *
   * Omit it and the cards render without a basket button, which is exactly
   * right for `workshop-web`: workshop staff browse the catalogue, they do not
   * have a consumer basket. The same rule as `accountControl` on `TopNav`.
   */
  renderAddToBasket?: (part: PublicPart) => React.ReactNode;
}

export function MarketplaceLanding({
  stats,
  facets,
  parts,
  total,
  mechanics,
  applied,
  vinQuery,
  vinResult,
  problems,
  renderAddToBasket,
}: MarketplaceLandingProps) {
  // Cards are grouped under category headings, preserving the order the API
  // returned (category display_order, then name) rather than re-sorting here —
  // two sort orders for one list is how a grid starts disagreeing with its own
  // chips.
  const groups: { name: string; slug: string; items: PublicPart[] }[] = [];
  for (const part of parts) {
    const last = groups[groups.length - 1];
    if (last && last.slug === part.categorySlug) last.items.push(part);
    else groups.push({ name: part.categoryName, slug: part.categorySlug, items: [part] });
  }

  // Models are filtered to the chosen make so the control cannot offer a
  // Corolla to somebody who has already said they drive a Ford.
  const models = facets
    ? facets.models.filter((m) => !applied.make || m.make === applied.make)
    : [];

  const anyFilter =
    applied.q || applied.make || applied.model || applied.year || applied.manufacturer || applied.category;

  return (
    <main
      style={{
        maxWidth: '80rem',
        margin: '0 auto',
        padding: primitive.space[4],
        display: 'flex',
        flexDirection: 'column',
        gap: primitive.space[6],
      }}
    >
      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <header
        style={{
          border: `1px solid ${themeVar.borderDefault}`,
          borderRadius: primitive.radius.lg,
          padding: primitive.space[6],
          display: 'flex',
          flexWrap: 'wrap',
          gap: primitive.space[4],
          alignItems: 'center',
          justifyContent: 'space-between',
          position: 'relative',
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: primitive.space[2], flexWrap: 'wrap' }}>
            <h1
              style={{
                margin: 0,
                fontSize: primitive.fontSize.xl,
                fontWeight: 800,
                color: themeVar.textPrimary,
                letterSpacing: '-0.3px',
              }}
            >
              Abossey Okai Auto Parts Marketplace
            </h1>
            <span
              style={{
                borderRadius: '999px',
                padding: `2px ${primitive.space[2]}`,
                background: primitive.color.green[50],
                color: primitive.color.green[700],
                fontSize: primitive.fontSize.xs,
                fontWeight: 700,
                letterSpacing: '0.4px',
                whiteSpace: 'nowrap',
              }}
            >
              FREE TO BROWSE
            </span>
          </div>
          <p style={{ margin: `${primitive.space[2]} 0 0 0`, color: themeVar.textSecondary }}>
            Car parts from verified suppliers, searchable by make, model, year and part manufacturer.
            Find a mechanic near you — searching is free, and you do not need an account to look.
          </p>
        </div>

        {/* Sign in and sign up live ON the landing page, per the requirement.
            Sign-up goes to Keycloak's registration form via /api/auth/register;
            see that route for why it is not the sign-in URL. */}
        {/*
          ⚠️ PLAIN <a>, NOT <Link>, AND THE LINT RULE IS SUPPRESSED ON PURPOSE.
          These are Route Handlers that answer with a 302 to Keycloak, not pages.
          next/link performs a client-side transition and expects an RSC payload
          back; pointing it at a handler that redirects to another ORIGIN gives
          it a response it cannot use. A full document navigation is what an
          identity handoff actually is.
        */}
        <div style={{ display: 'flex', gap: primitive.space[2], flexWrap: 'wrap' }}>
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a href="/api/auth/register" style={BUTTON_PRIMARY}>
            Create an account
          </a>
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a href="/api/auth/signin" style={BUTTON_SECONDARY}>
            Sign in
          </a>
        </div>
      </header>

      {problems.length > 0 ? (
        <div
          role="status"
          style={{
            border: `1px solid ${primitive.color.red[700]}`,
            borderRadius: primitive.radius.md,
            padding: primitive.space[3],
            color: themeVar.textPrimary,
            fontSize: primitive.fontSize.sm,
          }}
        >
          {/* Named, not swallowed. A page that silently renders zero parts when
              the API is down looks like an empty catalogue. */}
          <strong>Some of this page could not be loaded.</strong>
          <ul style={{ margin: `${primitive.space[2]} 0 0 0`, paddingLeft: primitive.space[4] }}>
            {problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* ── KPI strip ────────────────────────────────────────────────────── */}
      {stats ? (
        <section
          aria-label="Marketplace at a glance"
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(10rem, 1fr))',
            gap: primitive.space[3],
          }}
        >
          {[
            { label: 'Parts listed', value: stats.parts },
            { label: 'Verified suppliers', value: stats.suppliers },
            { label: 'Countries', value: stats.countries },
            { label: 'Mechanics listed', value: stats.mechanics },
          ].map((kpi) => (
            <div key={kpi.label} style={{ ...CARD, gap: primitive.space[1] }}>
              <span style={{ fontSize: primitive.fontSize.xs, color: themeVar.textSecondary, fontWeight: 600 }}>
                {kpi.label}
              </span>
              <span style={{ fontSize: primitive.fontSize.xl, fontWeight: 800, color: themeVar.textPrimary }}>
                {kpi.value}
              </span>
            </div>
          ))}
        </section>
      ) : null}

      {/* ── Parts search ─────────────────────────────────────────────────── */}
      {/* ⚠️ ABOVE the parts search, deliberately. A visitor who does not yet
          know which part they need still knows their VIN — this is the question
          they CAN answer, and answering it is what earns the account. Putting it
          below the catalogue would bury the funnel under a grid. */}
      <VinSearch vinQuery={vinQuery} result={vinResult} />

      <section aria-labelledby="find-parts">
        <h2
          id="find-parts"
          style={{ margin: `0 0 ${primitive.space[3]} 0`, fontSize: primitive.fontSize.lg, color: themeVar.textPrimary }}
        >
          Find parts for your car
        </h2>

        {/*
          A PLAIN GET FORM, and that is a decision rather than a shortcut. The
          filters become query-string parameters, so a search is a URL: it can
          be bookmarked, shared with a mechanic, and reopened by the back
          button. It also works with no JavaScript at all — the same property
          that made the sign-out control a form.
        */}
        <form
          method="GET"
          action="/"
          style={{
            ...CARD,
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(11rem, 1fr))',
            gap: primitive.space[3],
            alignItems: 'end',
          }}
        >
          <div>
            <label htmlFor="make" style={LABEL}>
              Car make
            </label>
            <select id="make" name="make" defaultValue={applied.make} style={FIELD}>
              <option value="">Any make</option>
              {facets?.makes.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="model" style={LABEL}>
              Model
            </label>
            <select id="model" name="model" defaultValue={applied.model} style={FIELD}>
              <option value="">Any model</option>
              {models.map((m) => (
                <option key={`${m.make}-${m.model}`} value={m.model}>
                  {m.model}
                  {/* The make is shown when no make is chosen, because "Rio"
                      and "Focus" alone do not say whose they are. */}
                  {applied.make ? '' : ` (${m.make})`}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="year" style={LABEL}>
              Year
            </label>
            <select id="year" name="year" defaultValue={applied.year} style={FIELD}>
              <option value="">Any year</option>
              {facets?.years.map((y) => (
                <option key={y} value={String(y)}>
                  {y}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="manufacturer" style={LABEL}>
              {/* "if known" is in the label because most drivers do not know
                  it, and an unlabelled optional filter reads as required. */}
              Part manufacturer (if known)
            </label>
            <select id="manufacturer" name="manufacturer" defaultValue={applied.manufacturer} style={FIELD}>
              <option value="">Any manufacturer</option>
              {facets?.manufacturers.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="q" style={LABEL}>
              Search
            </label>
            <input
              id="q"
              name="q"
              type="search"
              defaultValue={applied.q}
              placeholder="Part name, brand or part number"
              style={FIELD}
            />
          </div>

          {/* The chosen category rides along so the chips and the form do not
              cancel each other out when either one is submitted. */}
          {applied.category ? <input type="hidden" name="category" value={applied.category} /> : null}

          <div style={{ display: 'flex', gap: primitive.space[2] }}>
            <button type="submit" style={BUTTON_PRIMARY}>
              Search parts
            </button>
            {anyFilter ? (
              <Link href="/" style={BUTTON_SECONDARY}>
                Reset
              </Link>
            ) : null}
          </div>
        </form>

        {/* ── Category chips ─────────────────────────────────────────────── */}
        {facets && facets.categories.length > 0 ? (
          <nav
            aria-label="Filter parts by category"
            style={{ display: 'flex', flexWrap: 'wrap', gap: primitive.space[2], marginTop: primitive.space[3] }}
          >
            <ChipLink applied={applied} category="" label={`All (${total})`} active={!applied.category} />
            {facets.categories.map((c) => (
              <ChipLink
                key={c.slug}
                applied={applied}
                category={c.slug}
                label={`${c.name} (${c.partCount})`}
                active={applied.category === c.slug}
              />
            ))}
          </nav>
        ) : null}

        {/* ── Results ────────────────────────────────────────────────────── */}
        <p style={{ marginTop: primitive.space[4], color: themeVar.textSecondary, fontSize: primitive.fontSize.sm }}>
          {total === 0
            ? 'No parts match that search.'
            : `${total} part${total === 1 ? '' : 's'} found${
                parts.length < total ? ` — showing the first ${parts.length}` : ''
              }.`}
        </p>

        {total === 0 ? (
          <div style={{ ...CARD, marginTop: primitive.space[3] }}>
            <strong style={{ color: themeVar.textPrimary }}>Nothing matched those filters.</strong>
            <span style={{ color: themeVar.textSecondary, fontSize: primitive.fontSize.sm }}>
              Try removing the year or the part manufacturer — those two narrow a search fastest. Every
              option in the make and model lists has at least one part, so a make on its own always
              returns something.
            </span>
            <Link href="/" style={{ ...BUTTON_SECONDARY, alignSelf: 'flex-start' }}>
              Clear all filters
            </Link>
          </div>
        ) : null}

        {groups.map((group) => (
          <section key={group.slug} style={{ marginTop: primitive.space[4] }}>
            <h3
              style={{
                margin: `0 0 ${primitive.space[2]} 0`,
                fontSize: primitive.fontSize.sm,
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
                color: themeVar.textSecondary,
                borderBottom: `1px solid ${themeVar.borderDefault}`,
                paddingBottom: primitive.space[1],
              }}
            >
              {group.name} <span style={{ fontWeight: 400 }}>({group.items.length})</span>
            </h3>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(17rem, 1fr))',
                gap: primitive.space[3],
              }}
            >
              {group.items.map((part) => (
                <PartCard key={part.id} part={part} renderAddToBasket={renderAddToBasket} />
              ))}
            </div>
          </section>
        ))}
      </section>

      {/* ── Mechanic search ──────────────────────────────────────────────── */}
      <section aria-labelledby="find-mechanic">
        <h2
          id="find-mechanic"
          style={{ margin: `0 0 ${primitive.space[2]} 0`, fontSize: primitive.fontSize.lg, color: themeVar.textPrimary }}
        >
          Find a mechanic
        </h2>
        <p style={{ margin: `0 0 ${primitive.space[3]} 0`, color: themeVar.textSecondary, fontSize: primitive.fontSize.sm }}>
          Searching is free and needs no account. Booking a workshop or seeing its contact details
          needs you to sign in.
        </p>

        <form
          method="GET"
          action="/"
          style={{ ...CARD, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'end', gap: primitive.space[3] }}
        >
          {/* The parts filters ride along as hidden fields: submitting the
              mechanic search must not silently discard the visitor's parts
              search, because both results share one page. */}
          {(['q', 'make', 'model', 'year', 'manufacturer', 'category'] as const).map((key) =>
            applied[key] ? <input key={key} type="hidden" name={key} value={applied[key]} /> : null,
          )}
          <div style={{ flex: '1 1 16rem', minWidth: 0 }}>
            <label htmlFor="mechanic" style={LABEL}>
              Town, service or specialism
            </label>
            <input
              id="mechanic"
              name="mechanic"
              type="search"
              defaultValue={applied.mechanicQuery}
              placeholder="Accra, brakes, air conditioning, Toyota…"
              style={FIELD}
            />
          </div>
          <button type="submit" style={BUTTON_PRIMARY}>
            Search mechanics
          </button>
        </form>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(17rem, 1fr))',
            gap: primitive.space[3],
            marginTop: primitive.space[3],
          }}
        >
          {mechanics.length === 0 ? (
            <div style={CARD}>
              <strong style={{ color: themeVar.textPrimary }}>No workshops match that search.</strong>
              <span style={{ color: themeVar.textSecondary, fontSize: primitive.fontSize.sm }}>
                Try a town name, or a service such as diagnostics or brakes.
              </span>
            </div>
          ) : (
            mechanics.map((m) => <MechanicCard key={m.id} mechanic={m} />)
          )}
        </div>
      </section>

      <footer
        style={{
          borderTop: `1px solid ${themeVar.borderDefault}`,
          paddingTop: primitive.space[4],
          color: themeVar.textSecondary,
          fontSize: primitive.fontSize.sm,
        }}
      >
        {/* `05.txt` §2 forbids disconnected mock pages, so what is NOT built is
            named on the page rather than implied by a button that does nothing.
            ⚠️ THIS NOTICE MUST BE RE-READ WHENEVER THE MARKETPLACE GAINS A
            CAPABILITY. It previously said ordering "is not built yet" while an
            Add-to-basket button sat on every card above it — the page
            contradicting itself, which is worse than either statement alone.
            Ordering landed in migrations 022/023; in-app payment genuinely has
            not, and saying so is the honest half that remains. */}
        <p style={{ margin: 0 }}>
          Order directly from a supplier — add parts to your basket and check out with an
          account. You pay the supplier yourself, by cash, bank transfer or mobile money, and
          record the payment against your order; there is no in-app card payment. Delivery is
          arranged by each supplier with their own system, so a basket spanning several
          suppliers becomes one order per supplier. Prices shown are supplier list prices.
        </p>
      </footer>
    </main>
  );
}

/** A category chip that preserves the rest of the current search. */
function ChipLink({
  applied,
  category,
  label,
  active,
}: {
  applied: MarketplaceLandingProps['applied'];
  category: string;
  label: string;
  active: boolean;
}) {
  const params = new URLSearchParams();
  for (const key of ['q', 'make', 'model', 'year', 'manufacturer'] as const) {
    if (applied[key]) params.set(key, applied[key]);
  }
  if (applied.mechanicQuery) params.set('mechanic', applied.mechanicQuery);
  if (category) params.set('category', category);
  const href = params.toString() ? `/?${params.toString()}` : '/';

  return (
    <Link
      href={href}
      // `aria-current` rather than colour alone: the active chip must be
      // announced, not merely tinted (§66, and the same rule the status badges
      // follow elsewhere).
      aria-current={active ? 'true' : undefined}
      style={{
        borderRadius: '999px',
        padding: `${primitive.space[1]} ${primitive.space[3]}`,
        border: `1px solid ${active ? primitive.color.blue[600] : themeVar.borderDefault}`,
        background: active ? primitive.color.blue[600] : 'transparent',
        color: active ? '#ffffff' : themeVar.textPrimary,
        fontSize: primitive.fontSize.sm,
        fontWeight: 600,
        textDecoration: 'none',
        whiteSpace: 'nowrap',
      }}
    >
      {label}
    </Link>
  );
}

function PartCard({
  part,
  renderAddToBasket,
}: {
  part: PublicPart;
  // Threaded rather than read from a context: one prop down one level is
  // cheaper to follow than a provider, and it keeps this file free of any React
  // context that a non-Next consumer would also have to mount.
  renderAddToBasket?: (part: PublicPart) => React.ReactNode;
}) {
  return (
    <article style={CARD}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: primitive.space[2] }}>
        <span
          style={{
            fontSize: primitive.fontSize.xs,
            fontWeight: 700,
            letterSpacing: '0.4px',
            textTransform: 'uppercase',
            color: themeVar.textSecondary,
          }}
        >
          {part.categoryName}
        </span>
        {/* Stock is a word, never a colour alone. */}
        <span
          style={{
            fontSize: primitive.fontSize.xs,
            fontWeight: 700,
            color: part.inStock ? primitive.color.green[700] : primitive.color.red[700],
            whiteSpace: 'nowrap',
          }}
        >
          {part.inStock ? 'In stock' : 'On order'}
        </span>
      </div>

      <h4 style={{ margin: 0, fontSize: primitive.fontSize.base, color: themeVar.textPrimary, lineHeight: 1.25 }}>
        {part.name}
      </h4>

      <div style={{ fontSize: primitive.fontSize.sm, color: themeVar.textSecondary }}>
        {part.brand ? <span>{part.brand} · </span> : null}
        <span style={{ fontFamily: primitive.fontFamily.mono }}>{part.partNumber}</span>
      </div>

      <div style={{ fontSize: primitive.fontSize.lg, fontWeight: 800, color: themeVar.textPrimary }}>
        {/* A NULL price is legal in the catalogue and must read as a state, not
            as a blank cell or a zero. */}
        {part.price === null ? (
          <span style={{ fontSize: primitive.fontSize.base, fontWeight: 700, color: themeVar.textSecondary }}>
            Price on request
          </span>
        ) : (
          `${part.currency} ${part.price}`
        )}
      </div>

      {part.fitments.length > 0 ? (
        <div style={{ fontSize: primitive.fontSize.xs, color: themeVar.textSecondary }}>
          <span style={visuallyHidden}>Fits these vehicles: </span>
          Fits: {part.fitments.slice(0, 3).join(' · ')}
          {part.fitments.length > 3 ? ` · +${part.fitments.length - 3} more` : ''}
        </div>
      ) : null}

      {/*
        Adding to the basket needs NO ACCOUNT — the basket is browser state
        until checkout, which is what keeps 021's promise that browsing this
        marketplace requires no sign-up. A part with no price refuses here,
        where the buyer can still act on it, rather than at the last step of
        checkout after they have typed an address.
      */}
      {renderAddToBasket ? renderAddToBasket(part) : null}

      <div
        style={{
          marginTop: 'auto',
          paddingTop: primitive.space[2],
          borderTop: `1px solid ${themeVar.borderDefault}`,
          fontSize: primitive.fontSize.xs,
          color: themeVar.textSecondary,
        }}
      >
        Supplied by <strong style={{ color: themeVar.textPrimary }}>{part.supplierName}</strong>
        {part.supplierCity ? `, ${part.supplierCity}` : ''} ({part.supplierCountry})
        {part.supplierVerified ? (
          <span style={{ color: primitive.color.green[700], fontWeight: 700 }}> · Verified</span>
        ) : null}
      </div>
    </article>
  );
}

function MechanicCard({ mechanic }: { mechanic: PublicMechanic }) {
  return (
    <article style={CARD}>
      <h4 style={{ margin: 0, fontSize: primitive.fontSize.base, color: themeVar.textPrimary }}>
        {mechanic.tradingName}
      </h4>
      <div style={{ fontSize: primitive.fontSize.sm, color: themeVar.textSecondary }}>
        {mechanic.city}, {mechanic.country}
      </div>
      {mechanic.services.length > 0 ? (
        <div style={{ fontSize: primitive.fontSize.xs, color: themeVar.textSecondary }}>
          Services: {mechanic.services.join(' · ')}
        </div>
      ) : null}
      {mechanic.specialisms.length > 0 ? (
        <div style={{ fontSize: primitive.fontSize.xs, color: themeVar.textSecondary }}>
          Specialises in: {mechanic.specialisms.join(' · ')}
        </div>
      ) : null}

      {/*
        THE GATE. Not a hidden field — the contact details are genuinely absent
        from the response that built this card, so there is nothing here to
        reveal with a devtools inspector. Signing in is what fetches them.
      */}
      {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- route handler, see hero */}
      <a href="/api/auth/signin" style={{ ...BUTTON_SECONDARY, marginTop: 'auto', alignSelf: 'flex-start' }}>
        Sign in to contact
      </a>
    </article>
  );
}
