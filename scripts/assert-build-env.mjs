/**
 * Refuse to run `next build` with NODE_ENV=development.
 *
 * WHY THIS GUARD EXISTS — READ BEFORE DELETING IT.
 *
 * `next build` always produces a PRODUCTION bundle, but it does not override an
 * NODE_ENV that is already set. With NODE_ENV=development in the environment,
 * Next loads its DEVELOPMENT React server runtime while emitting a production
 * build, and the two halves disagree about React's internals. What you get is
 * not an error that says any of that. You get:
 *
 *     Error occurred prerendering page "/home/dashboard"
 *     TypeError: Cannot read properties of null (reading 'useContext')
 *     TypeError: Cannot read properties of null (reading 'useState')
 *     TypeError: Cannot read properties of undefined (reading 'length')
 *         at resolveErrorDev (...app-page.runtime.dev.js)
 *
 * — three different messages depending on which component renders first, none
 * of which mentions NODE_ENV, all of which point at innocent application code.
 * The giveaway is `.dev.js` and `.prod.js` runtime paths in ONE stack trace,
 * plus a one-line warning at the very top of the log that scrolls away long
 * before the failure:
 *
 *     ⚠ You are using a non-standard "NODE_ENV" value in your environment.
 *
 * This is trivially easy to trigger: `.env` sets NODE_ENV=development for the
 * dev servers, so any shell that has sourced it — `set -a && . ./.env` — then
 * runs a build inherits it. The failure looks exactly like a bug in whichever
 * page happened to prerender first, and sends you to rewrite working code.
 *
 * A build that cannot succeed should say so in one line, before compiling for
 * two minutes and then blaming a component.
 *
 * The check is scoped to the production-build phase, so `next dev` and
 * `next start` are untouched — development SHOULD have NODE_ENV=development.
 *
 * The phase is compared against a literal rather than imported from
 * `next/constants`: this module lives at the repository root, where `next` is
 * not a dependency (it is declared per app), so the import would fail to
 * resolve from here and take every app's config down with it. The value is
 * Next's own stable constant.
 */
const PHASE_PRODUCTION_BUILD = 'phase-production-build';

export function assertBuildEnv(phase) {
  if (phase !== PHASE_PRODUCTION_BUILD) return;

  const nodeEnv = process.env.NODE_ENV;
  if (nodeEnv && nodeEnv !== 'production') {
    throw new Error(
      [
        '',
        `next build was started with NODE_ENV=${nodeEnv}.`,
        '',
        'next build always emits a PRODUCTION bundle, but it does not override an',
        'NODE_ENV that is already set — so Next would load its development React',
        'runtime into a production build. That fails later, during prerendering,',
        'with a null useContext/useState in whichever page renders first. The',
        'message names your component and never mentions NODE_ENV.',
        '',
        'Most likely cause: this shell sourced .env (which sets NODE_ENV=development',
        'for the dev servers) before building.',
        '',
        'Fix — either:',
        '  NODE_ENV=production pnpm build',
        'or build in a shell that has not sourced .env:',
        '  unset NODE_ENV && pnpm build',
        '',
      ].join('\n'),
    );
  }
}
