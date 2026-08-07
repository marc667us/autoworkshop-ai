import Link from 'next/link';
import { BasketLink } from './basket-link';
import { primitive } from '@autoworkshop/design-tokens';
import { visuallyHidden } from '@autoworkshop/ui';
import {
  CatalogueFacets,
  CatalogueStats,
  PublicMechanic,
  PublicPart,
  PublicVin,
} from './public-api';
import { VinSearch } from './vin-search';
import {
  BUTTON_GREEN,
  BUTTON_PRIMARY,
  BUTTON_SECONDARY,
  CARD,
  CARD_GRID,
  CITY_CHIP,
  CONTAINER,
  FAQ_ITEM,
  FIELD,
  GradientDivider,
  HERO_BADGE,
  HERO_GLOW,
  HERO_LEAD,
  HERO_TITLE,
  ICON_BOX,
  LABEL,
  MAGNET,
  SOLAR,
  SectionHeading,
  SolarShellTheme,
  Stat,
  WORKFLOW_STEP,
  clampLines,
} from './solar-theme';

/**
 * ABOSSEY OKAI AUTO PARTS MARKETPLACE — the public landing page.
 *
 * ── WHAT CHANGED, AND WHY ───────────────────────────────────────────────────
 *
 * Two earlier passes tried to make this look like Solar's landing. The first
 * took Solar's SIZING and refused its colours. The second took the colours too.
 * The owner's verdict on the result: *"the landing page done was so ugly, never
 * same as that of solar."*
 *
 * The diagnosis both passes missed is that Solar's landing is not a catalogue
 * page wearing a dark palette — it is a MARKETING page with a specific grammar,
 * and this page had none of it:
 *
 *   | Solar has                    | this page had                          |
 *   |------------------------------|----------------------------------------|
 *   | radial amber glow behind hero| a flat bordered box                    |
 *   | gradient-filled headline     | one line of body-weight text           |
 *   | 6 gradient stat numbers      | four bordered KPI boxes                |
 *   | gold kicker над every heading| bare `<h2>`s                           |
 *   | gradient dividers between    | nothing between sections               |
 *   | a "magnet" for the free tool | the VIN box inline, unannounced        |
 *   | centred 1140px column        | full-bleed edge-to-edge                |
 *   | gold CTAs everywhere         | BLUE buttons on an amber page          |
 *
 * All of it now comes from `./solar-theme`, which cites the Solar line numbers
 * it was read from. Read for pattern, never imported — ADR-011, and Solar is
 * never opened or run (owner instruction, 2026-07-26).
 *
 * ── CARDS ARE ONE SIZE, WHICH IS WHAT WAS ASKED FOR ────────────────────────
 *
 * Every card grid uses `CARD_GRID`, whose track is `CARD_TRACK`. Previously the
 * KPI strip was on a 13.75rem track and the parts and mechanic grids on 17rem,
 * so three sections of one page disagreed about how wide a card is. `height:
 * 100%` alone never fixes that — it equalises a ROW, not a page.
 *
 * ── WHAT A SIGNED-OUT VISITOR MAY DO HERE, AND WHERE THE LINE IS ───────────
 *
 * View, and search. Every control either filters what is already public or
 * sends the visitor to sign in. No control writes, and no field is rendered
 * that the public API does not already return — in particular a mechanic's
 * phone number is NOT in the response, so the sign-in prompt on a mechanic card
 * is a real gate rather than a hidden field. Hiding data the browser already
 * holds is not authorization; this repo has been bitten by that distinction.
 */

export interface MarketplaceLandingProps {
  /**
   * Whether this component should render the page's `<main>` landmark.
   *
   * `true` (default) when mounted outside an application shell — customer-web's
   * `/`. `false` when the shell already provides one — workshop-web's `/`,
   * where two `<main>` elements broke the skip link.
   */
  ownsMainLandmark?: boolean;

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
   * The URL THIS PAGE IS MOUNTED AT. Every search form, reset link and category
   * chip submits back to it.
   *
   * 🔴 IT USED TO BE THE LITERAL `'/'`, AND THAT BROKE THE SECOND MOUNT.
   * Codex, 2026-08-05: `customer-web` mounts this same component at
   * `/marketplace` precisely so a SIGNED-IN customer can browse the catalogue —
   * and `customer-web`'s `/` redirects a signed-in visitor to their dashboard.
   * So on that mount, submitting any search threw the customer out of the
   * marketplace and onto their dashboard, with their filters discarded.
   *
   * One component, two mounts, and the controls only worked on one of them —
   * exactly the failure §0.3 warns a shared surface can hide. Required, not
   * optional with a `'/'` default: a default would let a third mount reintroduce
   * the bug silently, and there are only two call sites to keep honest.
   */
  basePath: string;
  /**
   * The "Add to basket" control for a part card, supplied by the app.
   *
   * ⚠️ A RENDER PROP, NOT AN IMPORT, AND THAT IS WHAT LETS THIS PAGE BE SHARED.
   * The basket is `customer-web`'s: a client component writing that app's local
   * storage. Importing it here would tie this package to one app and reintroduce
   * the copy-paste that §0.3 forbids — the alternative was a second landing page
   * that could silently disagree with the first.
   *
   * Omit it and the cards render without a basket button, which is exactly right
   * for `workshop-web`: workshop staff browse the catalogue, they do not have a
   * consumer basket. Same rule as `accountControl` on `TopNav`.
   */
  renderAddToBasket?: (part: PublicPart) => React.ReactNode;
  /**
   * Who is looking, when somebody is signed in. `null` for a stranger.
   *
   * 🔴 WHY THE LANDING NEEDS TO KNOW (owner, 2026-08-06: "the landing page must
   * show when [a] user has [an] account and has logged in").
   *
   * Until now this page rendered IDENTICALLY for a stranger and for a signed-in
   * owner: it offered "Create a free account" to somebody who already had one,
   * and "Sign in" to somebody already signed in. Both are dead ends dressed as
   * calls to action — clicking register while authenticated is the shortest path
   * to a confusing Keycloak error, and it makes the product look like it does
   * not know who you are.
   *
   * ⚠️ IT IS NOT AUTHENTICATION AND MUST NEVER BE TREATED AS ANY. This changes
   * which BUTTONS are drawn. Every guarded route re-resolves the session
   * server-side, and this page reads only PUBLIC endpoints, so a wrong value
   * here shows the wrong link and exposes nothing (CLAUDE.md §8).
   */
  viewer?: { displayName: string | null; dashboardHref: string } | null;
  /**
   * Where the basket lives, when this mount has one.
   *
   * 🔴 REQUIRED WHENEVER `renderAddToBasket` IS SUPPLIED, and the pairing is the
   * point: a basket button with no way back to the basket is a dead end, and on
   * the public landing an anonymous visitor has no navigation to find it with.
   * The two props are passed together or neither is.
   */
  basketHref?: string;

  /**
   * Where "Request for Service" on a mechanic card goes — the owner's value
   * chain, step 4. The chosen workshop is appended as `?workshop=<id>`.
   *
   * ⚠️ ABSOLUTE WHEN THE FORM IS ON ANOTHER HOST. This landing is mounted
   * twice: on the apex (workshop-web) and in customer-web. The request form
   * lives in customer-web, so the apex must pass a full URL. Omitted, the card
   * falls back to the sign-in prompt rather than linking somewhere that 404s.
   */
  requestServiceHref?: string;
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
  basePath,
  renderAddToBasket,
  viewer = null,
  basketHref,
  requestServiceHref,
  // 🔴 WHO OWNS THE `<main>` LANDMARK.
  //
  // customer-web mounts this at `/` OUTSIDE its shell — its root layout is only
  // a ThemeProvider — so this component must supply the landmark or the page has
  // none at all.
  //
  // workshop-web mounts it at `/` INSIDE `WorkspaceShell`, which already renders
  // a `<main>`. Emitting a second one there produced TWO main landmarks: invalid
  // HTML, and it breaks the skip link, which is the one control a keyboard user
  // has for getting past the navigation.
  //
  // Defaulting to `true` keeps the customer app correct without a change, and
  // the app that is already inside a shell says so.
  ownsMainLandmark = true,
}: MarketplaceLandingProps) {
  // A plain container when somebody else owns the landmark. `section` would
  // introduce a second banner-ish region; a `div` adds no semantics at all,
  // which is exactly right for a purely visual wrapper.
  const Root = (ownsMainLandmark ? 'main' : 'div') as 'main';
  // Cards are grouped under category headings, preserving the order the API
  // returned (category display_order, then name) rather than re-sorting here —
  // two sort orders for one list is how a grid starts disagreeing with its chips.
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
    <Root
      style={{
        // The landing owns the whole viewport background, not just its column —
        // a dark card column on a light page is the thing that looked wrong.
        background: SOLAR.bg,
        color: SOLAR.text,
        minHeight: '100vh',
        fontFamily: primitive.fontFamily.sans,
      }}
    >
      {/* Repaints the surrounding application shell to match, for this page
          only — a white top bar on a black page was the other half of "not the
          same as Solar". See `SolarShellTheme`. */}
      <SolarShellTheme />

      {/* ══ HERO ═══════════════════════════════════════════════════════════ */}
      <div style={HERO_GLOW}>
        <div style={{ maxWidth: CONTAINER, margin: '0 auto' }}>
          <span style={HERO_BADGE}>
            <span aria-hidden="true">★</span> Ghana&apos;s parts market · Free to browse · No account needed
          </span>

          <h1 style={HERO_TITLE}>
            Find the Part.
            <br />
            Find the Mechanic.
            <br />
            Fix the Car.
          </h1>

          <p style={HERO_LEAD}>
            Genuine car parts from{' '}
            <strong style={{ color: SOLAR.gold }}>verified Abossey Okai suppliers</strong>, searchable
            by make, model, year and part number — plus a directory of workshops near you and a free
            VIN check. Searching costs nothing and needs no sign-up.
          </p>

          <div
            style={{
              display: 'flex',
              gap: primitive.space[3],
              justifyContent: 'center',
              flexWrap: 'wrap',
              marginBottom: primitive.space[4],
            }}
          >
            {/*
              ⚠️ PLAIN <a>, NOT <Link>, AND THE LINT RULE IS SUPPRESSED ON PURPOSE.
              These are Route Handlers answering with a 302 to Keycloak, not pages.
              next/link performs a client-side transition and expects an RSC payload
              back; pointing it at a handler that redirects to another ORIGIN gives it
              a response it cannot use. A full document navigation is what an identity
              handoff actually is.
            */}
            {viewer ? (
              // Signed in: the account already exists, so offering to create one
              // is a dead end. Send them where their own work is instead.
              <>
                {/*
                  🔴 THE ONE BUTTON THE BUSINESS RUNS ON — owner, 2026-08-07:
                  "create a button for a user to request for repair service that
                  will open into a form that will register user, register his car
                  and take the complaint."

                  It is FIRST, ahead of the dashboard, because somebody arriving
                  at this site with a broken car wants a workshop, not a
                  dashboard. Everything else on this page is how they decide;
                  this is how they act.
                */}
                {requestServiceHref ? (
                  <a href={requestServiceHref} style={BUTTON_PRIMARY}>
                    Request repair service
                  </a>
                ) : null}
                <a href={viewer.dashboardHref} style={BUTTON_SECONDARY}>
                  Go to your dashboard
                </a>
                <a href="#find-parts" style={BUTTON_GREEN}>
                  Browse parts now
                </a>
                {basketHref ? <BasketLink href={basketHref} /> : null}
              </>
            ) : (
              <>
                {/*
                  SIGNED OUT, the same button — but through registration, which
                  is what makes it "register the user" as the owner asked. The
                  account is created at Keycloak and the visitor lands back on
                  the request form, so one press covers sign-up AND the request
                  rather than making them find their way back afterwards.

                  ⚠️ `next` is a PATH, never a full URL: `/api/auth/register`
                  builds the redirect from the incoming request's own origin, so
                  a tunnel or preview host returns to ITSELF. Passing an absolute
                  URL here would send a preview visitor to production.
                */}
                {requestServiceHref ? (
                  /* eslint-disable-next-line @next/next/no-html-link-for-pages */
                  <a href="/api/auth/register" style={BUTTON_PRIMARY}>
                    Request repair service
                  </a>
                ) : null}
                {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
                <a href="/api/auth/register" style={BUTTON_SECONDARY}>
                  Create a free account
                </a>
                <a href="#find-parts" style={BUTTON_GREEN}>
                  Browse parts now
                </a>
                {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
                <a href="/api/auth/signin" style={BUTTON_SECONDARY}>
                  Sign in
                </a>
                {basketHref ? <BasketLink href={basketHref} /> : null}
              </>
            )}
          </div>

          <div style={{ color: SOLAR.muted, fontSize: '12px', marginBottom: primitive.space[6] }}>
            {viewer ? (
              <>
                ✅ Signed in{viewer.displayName ? ` as ${viewer.displayName}` : ''} · Your basket and
                orders are kept · Compare supplier prices in GHS
              </>
            ) : (
              <>🔧 No sign-up needed · Search by your car · Compare supplier prices in GHS</>
            )}
          </div>

          {/*
            SOLAR'S "MAGNET" (landing.html:143). The one free tool, given its own
            tinted banner between the CTA row and the stats. It is how Solar sends a
            visitor into the funnel, and the VIN check is this product's equivalent
            of "Check My Bill" — the question a stranded driver CAN answer.

            An in-page anchor, not a route: the VIN panel is a section further down
            this same page, so a link elsewhere would be a lie.
          */}
          <a href="#vin-search" style={{ textDecoration: 'none', display: 'block' }}>
            <div style={MAGNET}>
              <div
                style={{
                  ...ICON_BOX,
                  width: '42px',
                  height: '42px',
                  borderRadius: '10px',
                  background: `linear-gradient(135deg, ${SOLAR.gold}, ${SOLAR.orange})`,
                  color: '#000',
                  fontSize: '18px',
                }}
                aria-hidden="true"
              >
                🚗
              </div>
              <div style={{ flex: '1 1 12rem', minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  <span style={{ fontWeight: 900, color: SOLAR.goldLight, fontSize: '14px' }}>
                    Check any vehicle by VIN
                  </span>
                  <span
                    style={{
                      background: 'rgba(34,197,94,.20)',
                      color: SOLAR.green,
                      fontSize: '9px',
                      fontWeight: 700,
                      letterSpacing: '.4px',
                      padding: '2px 8px',
                      borderRadius: '999px',
                    }}
                  >
                    FREE · 60s
                  </span>
                </div>
                <div style={{ color: SOLAR.sub, fontSize: '12px', marginTop: '2px' }}>
                  The 17 characters on your dashboard tell you who built the car and when — before
                  you order a single part.
                </div>
              </div>
              <span style={{ ...BUTTON_SECONDARY, padding: '6px 14px', fontSize: '13px' }}>
                Check now →
              </span>
            </div>
          </a>

          {/* City coverage strip — Solar's `.city-chip` row. */}
          <div style={{ marginTop: primitive.space[8] }}>
            <div
              style={{
                color: SOLAR.muted,
                fontSize: '12px',
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '.5px',
                marginBottom: primitive.space[2],
              }}
            >
              Serving drivers and workshops in
            </div>
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: primitive.space[2],
                justifyContent: 'center',
              }}
            >
              {['Accra', 'Abossey Okai', 'Kumasi', 'Tema', 'Takoradi'].map((city) => (
                <span key={city} style={CITY_CHIP}>
                  📍 {city}
                </span>
              ))}
              <span style={{ ...CITY_CHIP, color: SOLAR.sub, borderColor: SOLAR.border, background: SOLAR.card }}>
                ⋯ and nationwide
              </span>
            </div>
          </div>

          {/* ── Stat row ─────────────────────────────────────────────────── */}
          {/*
            ⚠️ THE NUMERIC STATS RENDER ONLY WHEN THE API ANSWERED. A stat row that
            shows "0 parts" because a fetch failed tells a visitor the shop is empty,
            which is a different and worse statement than saying nothing. The two
            constant stats are always true and always shown.
          */}
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              justifyContent: 'center',
              gap: primitive.space[6],
              marginTop: primitive.space[8],
            }}
          >
            {stats ? (
              <>
                <Stat value={String(stats.parts)} label="Parts listed" />
                <Stat value={String(stats.suppliers)} label="Verified suppliers" />
                <Stat value={String(stats.countries)} label="Countries" />
                <Stat value={String(stats.mechanics)} label="Workshops listed" />
              </>
            ) : null}
            <Stat value="Free" label="To browse" />
            <Stat value="60s" label="VIN check" />
          </div>
        </div>
      </div>

      <div style={{ maxWidth: CONTAINER, margin: '0 auto', padding: `0 ${primitive.space[4]} ${primitive.space[12]}` }}>
        {problems.length > 0 ? (
          <div
            role="status"
            style={{
              border: `1px solid ${SOLAR.orange}`,
              borderRadius: '12px',
              padding: primitive.space[4],
              color: SOLAR.text,
              fontSize: '14px',
              background: 'rgba(234,88,12,.08)',
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

        <GradientDivider />

        {/* ══ HOW IT WORKS ═════════════════════════════════════════════════ */}
        <section aria-labelledby="how-it-works">
          <SectionHeading
            id="how-it-works"
            kicker="How it works"
            title="Three steps from broken down to back on the road"
            centred
          />
          <div
            style={{
              display: 'flex',
              gap: primitive.space[4],
              justifyContent: 'center',
              flexWrap: 'wrap',
              alignItems: 'stretch',
            }}
          >
            {[
              {
                icon: '🔎',
                tint: 'rgba(245,158,11,.12)',
                title: 'Identify the car',
                body: 'Enter your VIN, or pick make, model and year. You get the manufacturer, the build year and the fitments that actually match.',
              },
              {
                icon: '🧰',
                tint: 'rgba(14,165,233,.12)',
                title: 'Compare real prices',
                body: 'Live list prices in GHS from verified Abossey Okai suppliers, with stock status on every card. No account needed to look.',
              },
              {
                icon: '✅',
                tint: 'rgba(34,197,94,.12)',
                title: 'Order, or book a mechanic',
                body: 'Check out with a free account and pay the supplier directly — or find a workshop near you and let them do the job.',
              },
            ].map((step, i) => (
              <div key={step.title} style={WORKFLOW_STEP}>
                <div
                  style={{
                    ...ICON_BOX,
                    background: step.tint,
                    margin: '0 auto',
                  }}
                  aria-hidden="true"
                >
                  {step.icon}
                </div>
                <div
                  style={{
                    marginTop: primitive.space[3],
                    fontSize: '11px',
                    fontWeight: 800,
                    letterSpacing: '1px',
                    color: SOLAR.gold,
                  }}
                >
                  STEP {i + 1}
                </div>
                <h3 style={{ margin: `4px 0 ${primitive.space[2]}`, fontSize: '16px', fontWeight: 800, color: SOLAR.text }}>
                  {step.title}
                </h3>
                <p style={{ margin: 0, fontSize: '13px', lineHeight: 1.7, color: SOLAR.sub }}>{step.body}</p>
              </div>
            ))}
          </div>
        </section>

        <GradientDivider />

        {/* ══ VIN ══════════════════════════════════════════════════════════ */}
        {/* ⚠️ ABOVE the parts search, deliberately. A visitor who does not yet know
            which part they need still knows their VIN — this is the question they
            CAN answer, and answering it is what earns the account. Below the
            catalogue it would be buried under a grid. */}
        <VinSearch vinQuery={vinQuery} result={vinResult} />

        <GradientDivider />

        {/* ══ PARTS ════════════════════════════════════════════════════════ */}
        <section aria-labelledby="find-parts">
          <SectionHeading
            id="find-parts"
            kicker="The catalogue"
            title="Find parts for your car"
            blurb="Narrow by what you know. Every make and model in these lists has at least one part behind it, so a make on its own always returns something."
          />

          {/*
            A PLAIN GET FORM, and that is a decision rather than a shortcut. The
            filters become query-string parameters, so a search is a URL: it can be
            bookmarked, shared with a mechanic, and reopened by the back button. It
            also works with no JavaScript at all — the same property that made the
            sign-out control a form.
          */}
          <form
            method="GET"
            action={basePath}
            style={{
              ...CARD,
              height: 'auto',
              display: 'grid',
              gridTemplateColumns: `repeat(auto-fit, minmax(12rem, 1fr))`,
              gap: primitive.space[4],
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
                    {/* The make is shown when no make is chosen, because "Rio" and
                        "Focus" alone do not say whose they are. */}
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
                {/* "if known" is in the label because most drivers do not know it,
                    and an unlabelled optional filter reads as required. */}
                Part maker (if known)
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
                <Link href={basePath} style={BUTTON_SECONDARY}>
                  Reset
                </Link>
              ) : null}
            </div>
          </form>

          {/* ── Category chips ───────────────────────────────────────────── */}
          {facets && facets.categories.length > 0 ? (
            <nav
              aria-label="Filter parts by category"
              style={{ display: 'flex', flexWrap: 'wrap', gap: primitive.space[2], marginTop: primitive.space[4] }}
            >
              <ChipLink
                applied={applied}
                basePath={basePath}
                category=""
                label={`All (${total})`}
                active={!applied.category}
              />
              {facets.categories.map((c) => (
                <ChipLink
                  key={c.slug}
                  basePath={basePath}
                  applied={applied}
                  category={c.slug}
                  label={`${c.name} (${c.partCount})`}
                  active={applied.category === c.slug}
                />
              ))}
            </nav>
          ) : null}

          {/* ── Results ──────────────────────────────────────────────────── */}
          <p style={{ marginTop: primitive.space[4], color: SOLAR.sub, fontSize: '14px' }}>
            {total === 0
              ? 'No parts match that search.'
              : `${total} part${total === 1 ? '' : 's'} found${
                  parts.length < total ? ` — showing the first ${parts.length}` : ''
                }.`}
          </p>

          {total === 0 ? (
            <div style={{ ...CARD, marginTop: primitive.space[3], height: 'auto' }}>
              <strong style={{ color: SOLAR.text }}>Nothing matched those filters.</strong>
              <span style={{ color: SOLAR.sub, fontSize: '14px' }}>
                Try removing the year or the part maker — those two narrow a search fastest. Every
                option in the make and model lists has at least one part, so a make on its own always
                returns something.
              </span>
              <Link href={basePath} style={{ ...BUTTON_SECONDARY, alignSelf: 'flex-start' }}>
                Clear all filters
              </Link>
            </div>
          ) : null}

          {groups.map((group) => (
            <section key={group.slug} style={{ marginTop: primitive.space[6] }}>
              <h3
                style={{
                  margin: `0 0 ${primitive.space[3]} 0`,
                  fontSize: '11px',
                  fontWeight: 800,
                  textTransform: 'uppercase',
                  letterSpacing: '1px',
                  color: SOLAR.gold,
                  borderBottom: `1px solid ${SOLAR.border}`,
                  paddingBottom: primitive.space[2],
                }}
              >
                {group.name}{' '}
                <span style={{ fontWeight: 600, color: SOLAR.muted }}>({group.items.length})</span>
              </h3>
              <div style={CARD_GRID}>
                {group.items.map((part) => (
                  <PartCard key={part.id} part={part} renderAddToBasket={renderAddToBasket} />
                ))}
              </div>
            </section>
          ))}
        </section>

        <GradientDivider />

        {/* ══ MECHANICS ════════════════════════════════════════════════════ */}
        <section aria-labelledby="find-mechanic">
          <SectionHeading
            id="find-mechanic"
            kicker="The directory"
            title="Find a mechanic"
            blurb="Searching is free and needs no account. Booking a workshop, or seeing its phone number, needs you to sign in."
          />

          <form
            method="GET"
            action={basePath}
            style={{
              ...CARD,
              height: 'auto',
              flexDirection: 'row',
              flexWrap: 'wrap',
              alignItems: 'end',
              gap: primitive.space[3],
            }}
          >
            {/* The parts filters ride along as hidden fields: submitting the mechanic
                search must not silently discard the visitor's parts search, because
                both results share one page. */}
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

          <div style={{ ...CARD_GRID, marginTop: primitive.space[4] }}>
            {mechanics.length === 0 ? (
              <div style={CARD}>
                <strong style={{ color: SOLAR.text }}>No workshops match that search.</strong>
                <span style={{ color: SOLAR.sub, fontSize: '14px' }}>
                  Try a town name, or a service such as diagnostics or brakes.
                </span>
              </div>
            ) : (
              mechanics.map((m) => (
                  <MechanicCard
                    key={m.id}
                    mechanic={m}
                    requestServiceHref={requestServiceHref}
                    // The SESSION decides, not `/me` — a cold API must not turn a
                    // signed-in customer back into a stranger on the one card that
                    // converts. Same reasoning as the landing's dashboard button.
                    signedIn={viewer !== null && viewer !== undefined}
                  />
                ))
            )}
          </div>
        </section>

        <GradientDivider />

        {/* ══ WHO IT IS FOR ════════════════════════════════════════════════ */}
        <section aria-labelledby="who-for">
          <SectionHeading
            id="who-for"
            kicker="Who uses it"
            title="Built for everyone around the car"
            centred
          />
          <div style={CARD_GRID}>
            {[
              {
                icon: '🚙',
                title: 'Drivers',
                body: 'Check what a part should cost before you are quoted, and find a workshop that has done the job before.',
              },
              {
                icon: '🔧',
                title: 'Workshops',
                body: 'Source parts at list price, run job cards, assign technicians and keep an audit trail your customers can see.',
              },
              {
                icon: '📦',
                title: 'Suppliers',
                body: 'List your catalogue where mechanics already look, and take orders without building a shop of your own.',
              },
              {
                icon: '🚚',
                title: 'Fleets',
                body: 'Track every vehicle you run in one place, with the same parts prices and the same workshop directory.',
              },
            ].map((who) => (
              <article key={who.title} style={CARD}>
                <div style={{ ...ICON_BOX, background: 'rgba(245,158,11,.10)' }} aria-hidden="true">
                  {who.icon}
                </div>
                <h3 style={{ margin: `${primitive.space[2]} 0 0`, fontSize: '15px', fontWeight: 800, color: SOLAR.text }}>
                  {who.title}
                </h3>
                <p style={{ margin: 0, fontSize: '13px', lineHeight: 1.7, color: SOLAR.sub }}>{who.body}</p>
              </article>
            ))}
          </div>
        </section>

        <GradientDivider />

        {/* ══ FAQ ══════════════════════════════════════════════════════════ */}
        <section aria-labelledby="faq">
          <SectionHeading id="faq" kicker="FAQ" title="Common questions" />
          <div style={{ maxWidth: '780px' }}>
            {[
              {
                q: 'Do I need an account to search?',
                a: 'No. Parts, mechanics and the VIN check are all free and open. An account is needed only to order, to see a workshop’s contact details, or to open a job card.',
              },
              {
                q: 'Can I pay through the site?',
                a: 'Not yet, and we would rather say so than imply otherwise. You order through the site and pay the supplier directly by cash, bank transfer or mobile money, then record the payment against your order.',
              },
              {
                q: 'Are the prices real?',
                a: 'They are supplier list prices in Ghana cedis, entered by the suppliers themselves. Stock status is shown on every card, and unpublished listings are withheld rather than shown as unavailable.',
              },
              {
                q: 'What does the free VIN check tell me?',
                a: 'The manufacturer, the region and country of build, and the model year — decoded from the VIN itself. The full decode, including fitment history, is behind a free account.',
              },
              {
                q: 'My basket has parts from two suppliers. What happens?',
                a: 'It becomes one order per supplier, because each arranges its own delivery. You will see that split before you confirm, not after.',
              },
            ].map((item) => (
              <div key={item.q} style={FAQ_ITEM}>
                <div style={{ fontWeight: 700, fontSize: '14px', color: SOLAR.text }}>{item.q}</div>
                <div style={{ fontSize: '13px', color: SOLAR.sub, marginTop: '8px', lineHeight: 1.7 }}>
                  {item.a}
                </div>
              </div>
            ))}
          </div>
        </section>

        <GradientDivider />

        {/* ══ CLOSING CTA ══════════════════════════════════════════════════ */}
        <section
          aria-labelledby="closing-cta"
          style={{ textAlign: 'center', padding: `${primitive.space[8]} 0` }}
        >
          <h2
            id="closing-cta"
            style={{
              margin: 0,
              fontSize: 'clamp(1.25rem, 2.4vw, 1.75rem)',
              fontWeight: 900,
              color: SOLAR.text,
              background: `linear-gradient(90deg, ${SOLAR.gold}, ${SOLAR.blue})`,
              WebkitBackgroundClip: 'text',
              backgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}
          >
            Start with the part you need
          </h2>
          <p style={{ ...HERO_LEAD, fontSize: '14px', marginTop: primitive.space[3] }}>
            {viewer
              ? 'Your account is ready. Add parts to the basket and check out, or pick up where you left off.'
              : 'Browsing is free forever. An account adds ordering, your garage, and a workshop’s phone number — and takes about a minute.'}
          </p>
          <div style={{ display: 'flex', gap: primitive.space[3], justifyContent: 'center', flexWrap: 'wrap' }}>
            {viewer ? (
              <a href={viewer.dashboardHref} style={BUTTON_PRIMARY}>
                Go to your dashboard
              </a>
            ) : (
              /* eslint-disable-next-line @next/next/no-html-link-for-pages */
              <a href="/api/auth/register" style={BUTTON_PRIMARY}>
                Create a free account
              </a>
            )}
            <a href="#find-parts" style={BUTTON_SECONDARY}>
              Keep browsing
            </a>
          </div>
        </section>

        <footer
          style={{
            borderTop: `1px solid ${SOLAR.border}`,
            paddingTop: primitive.space[4],
            // 🔴 `sub`, NOT `muted`, for the same measured reason as LABEL:
            // #6868a0 on this background is 3.62:1 and 13px is small text, so
            // WCAG AA wants 4.5:1. #9090c0 gives 6.19:1.
            //
            // ⚠️ THIS TEXT IS THE HONEST NOTICE about what the marketplace
            // cannot do yet, so it is the LAST paragraph on the page that
            // should be hard to read.
            color: SOLAR.sub,
            fontSize: '13px',
            lineHeight: 1.7,
          }}
        >
          {/* `05.txt` §2 forbids disconnected mock pages, so what is NOT built is
              named on the page rather than implied by a button that does nothing.
              ⚠️ THIS NOTICE MUST BE RE-READ WHENEVER THE MARKETPLACE GAINS A
              CAPABILITY. It previously said ordering "is not built yet" while an
              Add-to-basket button sat on every card above it — the page contradicting
              itself, which is worse than either statement alone. Ordering landed in
              migrations 022/023; in-app payment genuinely has not, and saying so is
              the honest half that remains. */}
          <p style={{ margin: 0 }}>
            Order directly from a supplier — add parts to your basket and check out with an account.
            You pay the supplier yourself, by cash, bank transfer or mobile money, and record the
            payment against your order; there is no in-app card payment. Delivery is arranged by each
            supplier with their own system, so a basket spanning several suppliers becomes one order
            per supplier. Prices shown are supplier list prices.
          </p>
        </footer>
      </div>
    </Root>
  );
}

/** A category chip that preserves the rest of the current search. */
function ChipLink({
  applied,
  basePath,
  category,
  label,
  active,
}: {
  applied: MarketplaceLandingProps['applied'];
  /** Where this page is mounted — a chip must return to it, not to `/`. */
  basePath: string;
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
  const href = params.toString() ? `${basePath}?${params.toString()}` : basePath;

  return (
    <Link
      href={href}
      // `aria-current` rather than colour alone: the active chip must be
      // announced, not merely tinted (§66, and the same rule the status badges
      // follow elsewhere).
      aria-current={active ? 'true' : undefined}
      style={{
        borderRadius: '999px',
        padding: '5px 14px',
        // Gold, not blue. The active chip previously used `primitive.color.blue[600]`
        // — a theme-system accent that has no place on a gold marketing page.
        border: `1px solid ${active ? SOLAR.gold : SOLAR.border}`,
        background: active ? 'rgba(245,158,11,.15)' : SOLAR.card,
        color: active ? SOLAR.goldLight : SOLAR.sub,
        fontSize: '12px',
        fontWeight: 700,
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
  // Threaded rather than read from a context: one prop down one level is cheaper
  // to follow than a provider, and it keeps this file free of any React context
  // that a non-Next consumer would also have to mount.
  renderAddToBasket?: (part: PublicPart) => React.ReactNode;
}) {
  return (
    /*
      ⚠️ EVERY ROW OF THIS CARD IS ALWAYS PRESENT, WHICH IS THE POINT.
      The owner asked for cards of the same size. A shared grid track gives them
      the same WIDTH and `height: 100%` matches the cards within one row — but
      the catalogue is drawn as one grid PER CATEGORY, so a row of tall cards
      sits above a row of short ones. Measured before this change: uniform 273px
      wide, and 228/238/246/266/285px tall. The variance came entirely from
      optional rows appearing and disappearing, so the optional rows became
      unconditional and the two free-text runs are clamped.
    */
    <article style={{ ...CARD, minHeight: '17rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: primitive.space[2] }}>
        <span
          style={{
            ...clampLines(1),
            fontSize: '10px',
            fontWeight: 800,
            letterSpacing: '.6px',
            textTransform: 'uppercase',
            color: SOLAR.muted,
          }}
        >
          {part.categoryName}
        </span>
        {/* Stock is a word, never a colour alone. */}
        <span
          style={{
            fontSize: '10px',
            fontWeight: 800,
            letterSpacing: '.4px',
            textTransform: 'uppercase',
            color: part.inStock ? SOLAR.greenText : SOLAR.orange,
            whiteSpace: 'nowrap',
          }}
        >
          {part.inStock ? 'In stock' : 'On order'}
        </span>
      </div>

      {/* Two lines, always two lines' worth of space. `title` carries the full
          name for the handful that are longer, so clamping hides nothing. */}
      <h4
        title={part.name}
        style={{
          ...clampLines(2),
          margin: 0,
          fontSize: '15px',
          fontWeight: 700,
          color: SOLAR.text,
          lineHeight: 1.3,
          minHeight: '2.6em',
        }}
      >
        {part.name}
      </h4>

      <div style={{ ...clampLines(1), fontSize: '12px', color: SOLAR.sub }}>
        {part.brand ? <span>{part.brand} · </span> : null}
        <span style={{ fontFamily: primitive.fontFamily.mono }}>{part.partNumber}</span>
      </div>

      <div>
        {/* A NULL price is legal in the catalogue and must read as a state, not as
            a blank cell or a zero. */}
        {part.price === null ? (
          <span style={{ fontSize: '14px', fontWeight: 700, color: SOLAR.muted }}>
            Price on request
          </span>
        ) : (
          <span
            style={{
              fontSize: '20px',
              fontWeight: 900,
              lineHeight: 1.1,
              color: SOLAR.gold,
              background: `linear-gradient(90deg, ${SOLAR.gold}, ${SOLAR.goldLight})`,
              WebkitBackgroundClip: 'text',
              backgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}
          >
            {part.currency} {part.price}
          </span>
        )}
      </div>

      {/* ⚠️ RENDERED EVEN WHEN EMPTY, and it says so rather than going blank.
          A card that silently drops this row is a card of a different height —
          and "no fitments recorded" is genuinely useful to a buyer, who would
          otherwise assume the part fits and find out at the counter. */}
      <div style={{ ...clampLines(2), fontSize: '11px', color: SOLAR.muted, minHeight: '2.8em' }}>
        {part.fitments.length > 0 ? (
          <>
            <span style={visuallyHidden}>Fits these vehicles: </span>
            Fits: {part.fitments.slice(0, 3).join(' · ')}
            {part.fitments.length > 3 ? ` · +${part.fitments.length - 3} more` : ''}
          </>
        ) : (
          'No fitments recorded — check with the supplier before ordering.'
        )}
      </div>

      {/*
        Adding to the basket needs NO ACCOUNT — the basket is browser state until
        checkout, which is what keeps 021's promise that browsing this marketplace
        requires no sign-up. A part with no price refuses here, where the buyer can
        still act on it, rather than at the last step of checkout after they have
        typed an address.
      */}
      {renderAddToBasket ? renderAddToBasket(part) : null}

      <div
        style={{
          ...clampLines(2),
          marginTop: 'auto',
          paddingTop: primitive.space[2],
          borderTop: `1px solid ${SOLAR.border}`,
          fontSize: '11px',
          color: SOLAR.muted,
          minHeight: '3.4em',
        }}
      >
        Supplied by <strong style={{ color: SOLAR.sub }}>{part.supplierName}</strong>
        {part.supplierCity ? `, ${part.supplierCity}` : ''} ({part.supplierCountry})
        {part.supplierVerified ? (
          <span style={{ color: SOLAR.greenText, fontWeight: 700 }}> · Verified</span>
        ) : null}
      </div>
    </article>
  );
}

function MechanicCard({
  mechanic,
  requestServiceHref,
  signedIn,
}: {
  mechanic: PublicMechanic;
  /**
   * Where "Request for Service" goes, with the chosen workshop appended. Passed
   * in because the two mounts of this landing live on DIFFERENT HOSTS: the apex
   * is workshop-web, and the customer's request form is in customer-web. A
   * hardcoded relative path would 404 on one of them, silently, on the exact
   * step the whole funnel exists to reach.
   */
  requestServiceHref?: string;
  signedIn: boolean;
}) {
  return (
    // Same rule as `PartCard`: the optional rows are unconditional so every
    // mechanic card is the same size as every other one, and as every part card.
    <article style={{ ...CARD, minHeight: '17rem' }}>
      <h4 style={{ ...clampLines(2), margin: 0, fontSize: '15px', fontWeight: 700, color: SOLAR.text }}>
        {mechanic.tradingName}
      </h4>
      <div style={{ ...clampLines(1), fontSize: '12px', color: SOLAR.sub }}>
        📍 {mechanic.city}, {mechanic.country}
      </div>
      <div style={{ ...clampLines(3), fontSize: '11px', color: SOLAR.muted, minHeight: '4.2em' }}>
        {mechanic.services.length > 0
          ? `Services: ${mechanic.services.join(' · ')}`
          : 'Services not listed.'}
      </div>
      <div style={{ ...clampLines(2), fontSize: '11px', color: SOLAR.muted, minHeight: '2.8em' }}>
        {mechanic.specialisms.length > 0
          ? `Specialises in: ${mechanic.specialisms.join(' · ')}`
          : 'No specialisms listed.'}
      </div>

      {/*
        🔴 THE STEP THE FUNNEL EXISTS TO REACH — the owner's value chain, step 4:
        "clicks on link of his prefered and click on request for service".

        This card previously offered only "Sign in to contact", which ends the
        journey at a phone number. Searching for a mechanic is the free feature
        that brings someone here; asking that mechanic for help is the thing the
        business runs on, and there was no way to do it from the card that had
        just persuaded them.

        THE GATE IS UNCHANGED. Contact details are genuinely absent from the
        response that built this card, so there is nothing here for a devtools
        inspector; and the owner is explicit that the request is filed AFTER
        signing in. A signed-out visitor is therefore sent to sign in — but told
        what for, because "Sign in" with no reason is a wall, and this one now
        has a purpose on the other side of it.
      */}
      {signedIn && requestServiceHref ? (
        <a
          href={`${requestServiceHref}?workshop=${encodeURIComponent(mechanic.organizationId)}`}
          style={{ ...BUTTON_SECONDARY, marginTop: 'auto', alignSelf: 'flex-start' }}
        >
          Request for Service
        </a>
      ) : (
        /* eslint-disable-next-line @next/next/no-html-link-for-pages -- route handler, see hero */
        <a href="/api/auth/signin" style={{ ...BUTTON_SECONDARY, marginTop: 'auto', alignSelf: 'flex-start' }}>
          Sign in to request service
        </a>
      )}
    </article>
  );
}
