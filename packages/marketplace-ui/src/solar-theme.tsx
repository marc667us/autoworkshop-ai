import { primitive } from '@autoworkshop/design-tokens';

/**
 * SOLAR'S LANDING PAGE, AS A THEME MODULE.
 *
 * ── WHY THIS FILE EXISTS ────────────────────────────────────────────────────
 *
 * The landing was previously given Solar's PALETTE and nothing else, and the
 * owner's verdict was that it "was so ugly, never same as that of solar". That
 * was a fair read. Copying eleven hex values onto a catalogue page does not
 * produce Solar's landing, because Solar's landing is not a catalogue page —
 * it is a MARKETING page with a specific, repeated grammar:
 *
 *   glow hero → badge pill → gradient headline → lead → CTA row → magnet card
 *   → chips → stat row → divider → (section label → heading → card grid)×N
 *
 * Every value below is read from `solar-pv-designer-lite/templates/landing.html`
 * and `templates/base.html` `:root` — read-only, never opened or run (ADR-011,
 * and the owner's standing instruction). Line references are to those files.
 *
 * ── WHY A MODULE RATHER THAN CONSTANTS PER FILE ─────────────────────────────
 *
 * `vin-search.tsx` had its own copy of the palette with a comment explaining
 * that duplicating eleven literals beat a circular import. That reasoning was
 * sound and its prediction came true anyway: the VIN panel's BUTTONS stayed on
 * `primitive.color.blue[600]` while the page around them went gold, so the one
 * panel the funnel depends on had blue controls on an amber page. The fix is a
 * module neither of them owns — no cycle, one definition.
 *
 * ⚠️ NOTHING HERE IS EXPORTED FROM `@autoworkshop/design-tokens`, DELIBERATELY.
 * These are fixed-dark marketing values. Pushing them into the token package
 * would repaint every workshop screen, which is not what was asked for and
 * would break light mode across the product.
 */

/** `base.html` :root — lines 59-64. */
export const SOLAR = {
  bg: '#0a0a14',
  card: '#0f0f22',
  /** `.workflow-step` and `.testimonial-card` sit on the darker of the two. */
  cardAlt: '#0a0a14',
  border: '#1e1e3a',
  /** `.use-case-card:hover` border — the only lighter border Solar uses. */
  borderLift: '#2e2e5a',
  text: '#e2e2f0',
  sub: '#9090c0',
  /**
   * 🔴 RAISED FROM #6868a0, WHICH WAS 3.62:1 AND FAILED WCAG AA EVERYWHERE.
   *
   * axe flagged only the handful of nodes VISIBLE in the test viewport — the
   * filter labels and the footer notice. But `muted` is used on 13px and 11px
   * text throughout the part cards and mechanic cards too, and those are empty
   * locally because the test server has no API. They would have failed in
   * PRODUCTION, with data, where nothing was checking.
   *
   * So the token is fixed rather than the four nodes that happened to be
   * on screen. #7c7cb0 on the card (#0f0f22) measures 4.84:1 — over the 4.5:1
   * AA threshold for small text — and stays visibly dimmer than `sub`
   * (#9090c0, 6.19:1), so the hierarchy this palette encodes is preserved.
   */
  muted: '#7c7cb0',
  gold: '#f59e0b',
  goldLight: '#fbbf24',
  orange: '#ea580c',
  blue: '#0ea5e9',
  green: '#22c55e',
  greenText: '#86efac',
  radius: '14px',
} as const;

/**
 * `main.container-xl` — Bootstrap's 1140px at ≥1200px, centred.
 *
 * ⚠️ THE PREVIOUS PAGE WAS FULL-BLEED (`maxWidth: 'none'`) and that alone made
 * it read as a different product: Solar's landing is a centred column with the
 * page background running edge to edge behind it. Full-bleed stretches the lead
 * paragraph across a 27" monitor, which no marketing page does.
 */
export const CONTAINER = '71.25rem';

/**
 * ── ONE CARD, ONE SIZE — the owner asked for "cards of same size" ───────────
 *
 * `.use-case-card` (landing.html:55): background #0f0f22, border 1px #1e1e3a,
 * radius 12px, padding 20px, height 100%.
 *
 * ⚠️ `height: '100%'` IS LOAD-BEARING AND IS NOT ENOUGH ON ITS OWN. It makes a
 * card fill its grid row, so cards in the SAME row match. Cards in DIFFERENT
 * grids only match if those grids share a track size — and they did not: the
 * KPI strip was on a 13.75rem track while parts and mechanics were on 17rem, so
 * three sections of the same page disagreed about how wide a card is. Every
 * grid on this page now uses `CARD_TRACK`.
 */
export const CARD: React.CSSProperties = {
  background: SOLAR.card,
  border: `1px solid ${SOLAR.border}`,
  borderRadius: '12px',
  padding: '20px',
  color: SOLAR.text,
  height: '100%',
  display: 'flex',
  flexDirection: 'column',
  gap: primitive.space[2],
  // A positioned ancestor keeps any absolutely-positioned descendant from
  // escaping the card and stretching the document sideways (T-0044's shape).
  position: 'relative',
};

/**
 * THE one grid track for the whole page.
 *
 * Solar's `.workflow-step` band is `min-width:220px; max-width:280px`; 15rem
 * (240px) sits in the middle of it, so a row of cards on either product has the
 * same rhythm. In `rem` so the track grows for a viewer who raised their base
 * font size — otherwise the card gets tighter for exactly the person who asked
 * for more room.
 */
export const CARD_TRACK = '15rem';

/** Every card grid on the page. Same track ⇒ same card size, section to section. */
export const CARD_GRID: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: `repeat(auto-fill, minmax(${CARD_TRACK}, 1fr))`,
  gap: primitive.space[4],
  alignItems: 'stretch',
};

/** `.sp-input` — base.html:135. Translucent white, not a flat darker fill. */
export const FIELD: React.CSSProperties = {
  width: '100%',
  padding: '9px 12px',
  background: 'rgba(255,255,255,.04)',
  border: `1px solid ${SOLAR.border}`,
  borderRadius: '8px',
  color: SOLAR.text,
  fontSize: '15px',
  fontFamily: 'inherit',
  minWidth: 0,
};

export const LABEL: React.CSSProperties = {
  display: 'block',
  fontSize: '11px',
  fontWeight: 700,
  letterSpacing: '.5px',
  textTransform: 'uppercase',
  // 🔴 `sub`, NOT `muted`. MEASURED, not chosen by eye.
  //
  // `muted` (#6868a0) on the card (#0f0f22) is 3.62:1. These labels are 11px —
  // bold does not make them "large text" (that needs 18.66px bold or 24px), so
  // WCAG AA wants 4.5:1 and axe was right to fail all four of them on both the
  // workshop and customer landings.
  //
  // `sub` (#9090c0) on the same background is 6.19:1. It is already in this
  // palette and already used for secondary copy, so this is not a new colour —
  // it is the one that should have been used for a form label in the first
  // place. `muted` remains correct for genuinely de-emphasised text at a larger
  // size.
  color: SOLAR.sub,
  marginBottom: '6px',
};

/**
 * `.btn-solar` — base.html:100. The gold→orange gradient with BLACK text.
 *
 * Solar puts dark text on the gold deliberately: white on #f59e0b fails contrast
 * badly. Do not "fix" this to white.
 */
export const BUTTON_PRIMARY: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '8px',
  padding: '10px 20px',
  borderRadius: '10px',
  border: '1px solid transparent',
  background: `linear-gradient(135deg, ${SOLAR.gold}, ${SOLAR.orange})`,
  color: '#0a0a1c',
  fontWeight: 700,
  fontSize: '14px',
  fontFamily: 'inherit',
  textDecoration: 'none',
  cursor: 'pointer',
  whiteSpace: 'nowrap',
  boxShadow: '0 10px 22px -10px rgba(245,158,11,.55), inset 0 1px 0 rgba(255,255,255,.25)',
};

/** Solar's `.btn-outline-warning` shape — gold on transparent. */
export const BUTTON_SECONDARY: React.CSSProperties = {
  ...BUTTON_PRIMARY,
  background: 'transparent',
  color: SOLAR.gold,
  border: `1px solid rgba(245,158,11,.45)`,
  boxShadow: 'none',
};

/** The green CTA Solar uses for its second action (`Free Site Assessment`). */
export const BUTTON_GREEN: React.CSSProperties = {
  ...BUTTON_PRIMARY,
  background: `linear-gradient(135deg, ${SOLAR.green}, #16a34a)`,
  color: '#000',
  boxShadow: 'none',
};

/** `.hero-badge` — landing.html:39. */
export const HERO_BADGE: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',
  background: 'rgba(245,158,11,.12)',
  border: '1px solid rgba(245,158,11,.3)',
  color: SOLAR.gold,
  padding: '5px 16px',
  borderRadius: '20px',
  fontSize: '12px',
  fontWeight: 700,
  letterSpacing: '.3px',
};

/** `.hero-bg` — landing.html:37. The amber glow behind the headline. */
export const HERO_GLOW: React.CSSProperties = {
  background:
    'radial-gradient(ellipse 90% 70% at 50% 0%, rgba(245,158,11,.1) 0%, transparent 65%)',
  textAlign: 'center',
  padding: `${primitive.space[12]} ${primitive.space[4]} ${primitive.space[8]}`,
};

/**
 * The hero headline — landing.html:82. Gradient TEXT, clamped so it scales with
 * the viewport rather than wrapping into a wall on a phone.
 *
 * `WebkitTextFillColor: 'transparent'` is what reveals the gradient through the
 * glyphs; `color` is kept as the fallback for any engine that ignores it, so the
 * headline is never invisible.
 */
export const HERO_TITLE: React.CSSProperties = {
  margin: `${primitive.space[5]} 0 ${primitive.space[3]}`,
  fontSize: 'clamp(1.6rem, 3.6vw, 2.5rem)',
  fontWeight: 900,
  letterSpacing: '-.5px',
  lineHeight: 1.15,
  color: SOLAR.text,
  background: `linear-gradient(135deg, #f2f2fd 20%, ${SOLAR.gold} 55%, ${SOLAR.blue})`,
  WebkitBackgroundClip: 'text',
  backgroundClip: 'text',
  WebkitTextFillColor: 'transparent',
};

/** `.lead` — landing.html:87. 620px is Solar's prose measure. */
export const HERO_LEAD: React.CSSProperties = {
  maxWidth: '620px',
  margin: `0 auto ${primitive.space[6]}`,
  color: SOLAR.sub,
  fontSize: '1.05rem',
  lineHeight: 1.7,
};

/** `.city-chip` — landing.html:68. */
export const CITY_CHIP: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',
  padding: '8px 16px',
  background: '#0f1a0f',
  border: '1px solid #22c55e33',
  borderRadius: '10px',
  fontSize: '13px',
  color: SOLAR.greenText,
  fontWeight: 600,
};

/** `.workflow-step` — landing.html:47. Darker card, larger radius, centred. */
export const WORKFLOW_STEP: React.CSSProperties = {
  background: SOLAR.cardAlt,
  border: `1px solid ${SOLAR.border}`,
  borderRadius: '16px',
  padding: '24px',
  textAlign: 'center',
  flex: '1 1 0',
  minWidth: '220px',
  maxWidth: '280px',
  position: 'relative',
};

/** `.feature-icon-box` — landing.html:45. */
export const ICON_BOX: React.CSSProperties = {
  width: '52px',
  height: '52px',
  borderRadius: '12px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: '22px',
  flexShrink: 0,
};

/** `.faq-item` — landing.html:57. */
export const FAQ_ITEM: React.CSSProperties = {
  borderBottom: `1px solid ${SOLAR.border}`,
  padding: '16px 0',
};

/**
 * Solar's "magnet" — landing.html:143. A full-width tinted banner that carries
 * one free tool, sitting between the CTA row and the stats. It is the single
 * loudest element on the page after the headline, and it is how Solar sends a
 * visitor into its free funnel.
 */
export const MAGNET: React.CSSProperties = {
  background: 'linear-gradient(135deg, rgba(245,158,11,.10), rgba(34,197,94,.06))',
  border: '1px solid rgba(245,158,11,.35)',
  borderRadius: '.5rem',
  padding: '1rem',
  display: 'flex',
  alignItems: 'center',
  gap: '1rem',
  flexWrap: 'wrap',
  maxWidth: '780px',
  margin: '0 auto',
  textAlign: 'left',
};

/**
 * Clamp a run of text to a fixed number of lines.
 *
 * ⚠️ THIS IS WHAT MAKES "CARDS OF THE SAME SIZE" TRUE RATHER THAN NEARLY TRUE.
 * A shared grid track equalises card WIDTH, and `height: 100%` equalises the
 * cards within one ROW — but the page has several grids, one per category, and
 * a row of tall cards sits above a row of short ones. Measured on the rebuilt
 * page before this: widths were uniform at 273px and heights came out 228, 238,
 * 246, 266 and 285px, because a part name that wraps to three lines, or a
 * missing brand, silently adds or removes a row.
 *
 * Clamping the two variable-length runs makes every part card structurally
 * identical, so they are the same size across the whole page and not merely
 * within a row.
 */
export function clampLines(lines: number): React.CSSProperties {
  return {
    display: '-webkit-box',
    WebkitLineClamp: lines,
    WebkitBoxOrient: 'vertical',
    overflow: 'hidden',
  };
}

/** `.gradient-divider` — landing.html:65. */
/**
 * DARKENS THE APPLICATION SHELL FOR THE DURATION OF THIS PAGE.
 *
 * ── THE DEFECT THIS FIXES ───────────────────────────────────────────────────
 *
 * The landing is fixed-dark; the shell above and around it is theme-aware and
 * reads `--aw-*`. A visitor on the default light theme therefore got a WHITE top
 * bar sitting on a black page, with light strips down both edges where the
 * body's `--aw-background-primary` showed past the landing's column. Seen in a
 * screenshot, not reasoned about — the full-page capture hid it and a crop
 * showed it immediately.
 *
 * ── WHY AN OVERRIDE RATHER THAN DROPPING THE SHELL ─────────────────────────
 *
 * Giving `/` its own shell-less layout was the obvious alternative and is wrong:
 * a SIGNED-IN visitor keeps the shell here deliberately, so they can get back to
 * their dashboard from the public page. That decision is recorded in the app's
 * layout and predates this. Repainting the chrome keeps the navigation and
 * removes the clash.
 *
 * ── WHY IT IS SAFE ──────────────────────────────────────────────────────────
 *
 * The rule lives in a `<style>` element rendered BY this page, so it exists only
 * while this page is mounted — navigating into the app removes it and the shell
 * returns to the viewer's chosen theme. It sets only surface, text, border and
 * action variables.
 *
 * ⚠️ IT DELIBERATELY DOES NOT TOUCH THE FIVE `--aw-status-*` VARIABLES. Those
 * carry §66's job-card status hues, which must stay distinguishable in whatever
 * theme is active; repainting them from a marketing palette is exactly the kind
 * of change that makes "blocked" and "attention" look alike. Nothing on this
 * page renders a status badge anyway, so there is no reason to reach for them.
 *
 * ⚠️ AND IT DOES NOT SET `color-scheme`. Leaving it alone keeps form controls —
 * the make/model/year selects — rendering their popup lists in the viewer's own
 * scheme, which is the one place a native widget must stay legible.
 *
 * ── 🔴 THE SELECTOR IS DOUBLED (`:root:root`) AND THAT IS LOAD-BEARING ──────
 *
 * A plain `:root{…}` LOST, and it lost silently on exactly half the viewers.
 * `themes.ts` emits its palettes as:
 *
 *     @media (prefers-color-scheme: dark){ :root:not([data-theme]){…} }
 *     :root[data-theme="light"]{…}
 *     :root[data-theme="dark"]{…}
 *
 * all of which have specificity (0,2,0), against a bare `:root`'s (0,1,0). So on
 * a viewer whose OS asks for dark, the shell stayed on the app's dark palette
 * (#111827) while the landing rendered Solar's (#0a0a14) — the same mismatch
 * this component exists to remove, one shade subtler and therefore easier to
 * ship. Measured with Playwright at `colorScheme: 'light'` and `'dark'`; light
 * was correct and dark was not.
 *
 * `:root:root` is (0,2,0) and the two attribute forms are (0,3,0), so this wins
 * on specificity rather than on document order — which matters because a
 * `<style>` rendered inside `<body>` is not guaranteed to come after the head's.
 */
export function SolarShellTheme() {
  return (
    <style
      // Static, authored here, no interpolation of anything from a request.
      dangerouslySetInnerHTML={{
        __html: `:root:root,
:root:root[data-theme="light"],
:root:root[data-theme="dark"]{
  --aw-background-primary:${SOLAR.bg};
  --aw-background-secondary:${SOLAR.card};
  --aw-surface-raised:${SOLAR.card};
  --aw-text-primary:${SOLAR.text};
  --aw-text-secondary:${SOLAR.sub};
  --aw-border-default:${SOLAR.border};
  --aw-action-primary:${SOLAR.gold};
  --aw-action-primary-soft:rgba(245,158,11,.15);
  --aw-action-secondary:${SOLAR.border};
}`,
      }}
    />
  );
}

export function GradientDivider() {
  return (
    <div
      // Presentational only: a horizontal rule announced to a screen reader
      // between every section is noise, and the headings already convey the
      // structure it draws.
      aria-hidden="true"
      style={{
        height: '1px',
        border: 0,
        background:
          'linear-gradient(90deg, transparent, #1e1e3a 20%, #2e2e5a 50%, #1e1e3a 80%, transparent)',
        margin: '56px 0',
      }}
    />
  );
}

/** `.section-label` — landing.html:63. Small gold uppercase kicker. */
export function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: '11px',
        fontWeight: 800,
        letterSpacing: '1px',
        textTransform: 'uppercase',
        color: SOLAR.gold,
        marginBottom: '8px',
      }}
    >
      {children}
    </div>
  );
}

/**
 * `.stat-num` + `.stat-lbl` — landing.html:41-44.
 *
 * ⚠️ THE NUMBER IS A STRING, NOT A NUMBER. Solar's stats read "22+", "30 min",
 * "Live" — a stat row that can only hold integers cannot say the interesting
 * things, and the caller here passes counts AND words.
 */
export function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div style={{ textAlign: 'center', minWidth: '5.5rem' }}>
      <div
        style={{
          fontSize: '30px',
          fontWeight: 900,
          lineHeight: 1,
          color: SOLAR.gold,
          background: `linear-gradient(90deg, ${SOLAR.gold}, ${SOLAR.goldLight})`,
          WebkitBackgroundClip: 'text',
          backgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
        }}
      >
        {value}
      </div>
      <div
        style={{
          fontSize: '11px',
          color: SOLAR.muted,
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '.5px',
          marginTop: '4px',
        }}
      >
        {label}
      </div>
    </div>
  );
}

/**
 * A section heading in Solar's shape: gold kicker, then a black-weight h2.
 *
 * `id` is required rather than optional — every section on the page is labelled
 * by its heading via `aria-labelledby`, and an optional id is one that gets
 * forgotten on the section that needed it.
 */
export function SectionHeading({
  id,
  kicker,
  title,
  blurb,
  centred = false,
}: {
  id: string;
  kicker: string;
  title: string;
  blurb?: string;
  centred?: boolean;
}) {
  return (
    <div style={{ textAlign: centred ? 'center' : 'left', marginBottom: primitive.space[6] }}>
      <SectionLabel>{kicker}</SectionLabel>
      <h2
        id={id}
        style={{
          margin: 0,
          fontSize: 'clamp(1.25rem, 2.4vw, 1.75rem)',
          fontWeight: 900,
          letterSpacing: '-.3px',
          color: SOLAR.text,
        }}
      >
        {title}
      </h2>
      {blurb ? (
        <p
          style={{
            margin: `${primitive.space[2]} ${centred ? 'auto' : '0'} 0`,
            maxWidth: '620px',
            color: SOLAR.sub,
            fontSize: '14px',
            lineHeight: 1.7,
          }}
        >
          {blurb}
        </p>
      ) : null}
    </div>
  );
}
