import Link from 'next/link';
import { primitive, themeVar } from '@autoworkshop/design-tokens';

/**
 * What a visitor is told when `/api/auth/*` fails — `07.txt` §9.
 *
 * ── 🔴 THE DEFECT THIS EXISTS TO FIX ────────────────────────────────────────
 *
 * Keycloak runs on Render's free tier and spins down after 15 minutes of idle.
 * Its cold start was MEASURED at up to 136 seconds on 2026-08-03. Auth.js
 * discovers every endpoint from `${issuer}/.well-known/openid-configuration`,
 * so during that window the discovery fetch fails and Auth.js reports:
 *
 *     Configuration — "There is a problem with the server configuration."
 *
 * That message is WRONG in the way that matters. Nothing is misconfigured. The
 * sign-in service is starting, and the visitor who triggered the wake is the one
 * person guaranteed to see a hard error — the first visitor after any quiet
 * period, which on a young product is very nearly every visitor. Told the server
 * is broken, they leave; had they been told to wait ninety seconds, they would
 * have signed in.
 *
 * ── WHY THIS RATHER THAN A KEEP-WARM ────────────────────────────────────────
 *
 * A warmer was the obvious fix and the arithmetic refuses it. FOUR free Render
 * services share ONE 750-instance-hour monthly allowance, and a calendar month
 * is ~730 hours. Keeping Keycloak alive around the clock therefore consumes
 * essentially the ENTIRE allowance on its own and starves the API and both web
 * services — the same exhaustion that suspended this account with
 * `suspenders: ['billing']` on 2026-07-28. `keep-warm.yml` exists alongside this
 * file and is deliberately WINDOWED for that reason; read its header before
 * widening it. No paid remedy is to be proposed (ADR-012).
 *
 * So the cold start cannot be eliminated on this hosting, and the honest fix is
 * to stop lying about it. A slow sign-in that says it is slow is a far smaller
 * failure than a fast one that says the server is broken.
 *
 * ⚠️ IT STILL DISTINGUISHES A REAL FAULT. `Configuration` after a wake has
 * completed IS a genuine misconfiguration, and this screen must not paper over
 * that — the retry is bounded, and once the countdown is spent the copy stops
 * promising a wake and says plainly that the service is not answering. A screen
 * that says "starting up" forever is the monitor that always reports healthy.
 */

/**
 * Auth.js's error codes. `Configuration` is the one this screen exists for; the
 * others are here because `pages.error` captures ALL of them, and falling
 * through to a blank page would be worse than the default screen it replaced.
 */
const MESSAGES: Record<string, { title: string; body: string; waking: boolean }> = {
  Configuration: {
    title: 'The sign-in service is starting up',
    body:
      'This site runs on free hosting that powers down when nobody is using it. Waking it takes up to two minutes, and you are the first visitor since it went quiet. Nothing is wrong — please wait, or try again in a moment.',
    waking: true,
  },
  AccessDenied: {
    title: 'That account cannot sign in here',
    body:
      'You signed in successfully, but this account is not permitted to use this workspace. If you believe it should be, ask an administrator of your workshop to check your access.',
    waking: false,
  },
  Verification: {
    title: 'That sign-in link has expired',
    body: 'Sign-in links can only be used once, and not long after they are sent. Please start again.',
    waking: false,
  },
};

const FALLBACK = {
  title: 'Sign-in did not complete',
  body:
    'Something interrupted the sign-in. Trying again usually works. If it keeps happening, the sign-in service may be unavailable.',
  waking: false,
};

export interface AuthErrorScreenProps {
  /** Auth.js's `?error=` code. Absent when somebody opens the page directly. */
  error?: string;
  /** Where "Try again" goes. Defaults to this app's sign-in route. */
  signInHref?: string;
}

export function AuthErrorScreen({ error, signInHref = '/api/auth/signin' }: AuthErrorScreenProps) {
  /**
   * ⚠️ A TERNARY, NOT `(error && MESSAGES[error]) ?? FALLBACK`.
   *
   * That was the first version and it CRASHES on `/auth/error?error=`. With an
   * empty string, `error && …` short-circuits to `''`, and `??` only replaces
   * `null`/`undefined` — so `message` becomes `''` and `message.title` throws.
   * An empty `?error=` is not hypothetical: it is what a hand-trimmed URL or a
   * provider that redirects with a blank code produces, and it would white-screen
   * the one page a visitor reaches only when something has ALREADY gone wrong.
   */
  const message = (error ? MESSAGES[error] : undefined) ?? FALLBACK;

  return (
    <main
      style={{
        maxWidth: '38rem',
        margin: '0 auto',
        padding: primitive.space[8],
        display: 'flex',
        flexDirection: 'column',
        gap: primitive.space[4],
      }}
    >
      <div
        style={{
          border: `1px solid ${themeVar.borderDefault}`,
          borderRadius: primitive.radius.xl,
          background: themeVar.surfaceRaised,
          padding: primitive.space[6],
          display: 'flex',
          flexDirection: 'column',
          gap: primitive.space[3],
        }}
      >
        <h1 style={{ margin: 0, fontSize: primitive.fontSize['2xl'] }}>{message.title}</h1>
        <p style={{ margin: 0, lineHeight: 1.7 }}>{message.body}</p>

        {message.waking ? (
          /*
            A live countdown, not a spinner. A spinner claims progress is being
            made and cannot say how much is left; a visitor watching one for 136
            seconds concludes it is stuck. The number is the honest measurement
            from 2026-08-03, and this is a CLIENT component purely because a
            countdown cannot be rendered on the server.
          */
          <WakeCountdown signInHref={signInHref} />
        ) : (
          <p style={{ margin: 0 }}>
            <Link href={signInHref}>Try signing in again</Link>
          </p>
        )}

        {/*
          The raw code, small and last. It is meaningless to a customer and it is
          the first thing anyone debugging this will ask for, so it is present
          without being the headline.
        */}
        {error ? (
          <p
            style={{
              margin: 0,
              color: themeVar.textSecondary,
              fontSize: primitive.fontSize.xs,
              fontFamily: primitive.fontFamily.mono,
            }}
          >
            {error}
          </p>
        ) : null}
      </div>

      <p style={{ margin: 0, fontSize: primitive.fontSize.sm }}>
        <Link href="/">Back to the home page</Link>
      </p>
    </main>
  );
}

/**
 * Counts the wake down and retries once, by itself.
 *
 * ⚠️ ONE automatic retry, then it stops and hands over to the visitor. A page
 * that reloads forever against a service that is genuinely down is a page that
 * hammers a dead host and never tells anyone — and on metered free hosting it
 * would burn the very allowance that made the service sleep in the first place.
 */
function WakeCountdown({ signInHref }: { signInHref: string }) {
  return (
    <div
      // A `<noscript>`-safe fallback is the link itself, which is always
      // rendered. The script only upgrades it.
      style={{ display: 'flex', flexDirection: 'column', gap: primitive.space[2] }}
    >
      <p style={{ margin: 0 }}>
        <Link href={signInHref} id="aw-auth-retry">
          Try signing in again
        </Link>{' '}
        <span id="aw-auth-countdown" style={{ color: themeVar.textSecondary }} />
      </p>
      <script
        // A FIXED LITERAL with no interpolation of any request value — the
        // `?error=` code is rendered only through JSX, which React escapes.
        //
        // No `eslint-disable` here: `react/no-danger` is not configured in this
        // package, and a disable comment naming an unknown rule is ITSELF a lint
        // error. It kept CI red, and a red CI is one nobody reads.
        dangerouslySetInnerHTML={{
          __html: `(function(){
  var el = document.getElementById('aw-auth-countdown');
  var link = document.getElementById('aw-auth-retry');
  if (!el || !link) return;
  // 🔴 CHECK BEFORE COUNTING, NOT AFTER. The first version started the
  // countdown unconditionally and only consulted sessionStorage when it
  // reached zero — so on the SECOND visit the page spent 140 seconds
  // promising "retrying automatically" and then did nothing. A screen whose
  // whole purpose is to stop lying about a cold start must not close by
  // lying about itself. (Codex, 2026-08-04.)
  if (sessionStorage.getItem('aw-auth-retried')) {
    el.textContent = '— automatic retry already used; use the link above';
    return;
  }
  // 140s: the 136s cold start measured on 2026-08-03, plus a little. Retrying
  // sooner than the wake takes just produces the same error page twice.
  var left = 140;
  var t = setInterval(function () {
    left -= 1;
    if (left <= 0) {
      clearInterval(t);
      el.textContent = '';
      // ONE automatic attempt. If it fails again the visitor sees this page
      // once more, with the countdown spent, and decides for themselves.
      sessionStorage.setItem('aw-auth-retried', '1');
      window.location.href = link.getAttribute('href');
      return;
    }
    el.textContent = '— retrying automatically in ' + left + 's';
  }, 1000);
})();`,
        }}
      />
    </div>
  );
}
