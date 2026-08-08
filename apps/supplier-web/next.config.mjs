import { assertBuildEnv } from '../../scripts/assert-build-env.mjs';

/**
 * `next build` re-runs ESLint and the TypeScript checker.
 *
 * On a constrained deploy builder that step is the one that dies — and it dies
 * SILENTLY: the Render build log ends at "Linting and checking validity of
 * types ..." and exits 1 with no diagnostic at all, because the checker is
 * killed rather than reporting a fault. A genuine type error prints the file
 * and the message; nothing printed means nothing was found.
 *
 * Skipping it there is not lowering the bar. `pnpm typecheck` (15/15) and
 * `pnpm lint` (15/15) are blocking gates that run on the same commit, so the
 * check still happens — once, where its output is readable — instead of twice,
 * the second time on a machine that cannot finish it.
 *
 * OPT-IN, NEVER THE DEFAULT. Only the deploy sets SKIP_BUILD_CHECKS=1. A local
 * or CI `pnpm build` still lints and type-checks in full, so a broken build
 * cannot reach the deploy by way of this flag.
 */
const constrainedBuild = process.env.SKIP_BUILD_CHECKS === '1';

/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: { ignoreDuringBuilds: constrainedBuild },
  typescript: { ignoreBuildErrors: constrainedBuild },
  /**
   * Emit `.next/standalone` — required by this app's Dockerfile, added
   * 2026-08-09 when supplier-web was first deployed so the landing's
   * "Register as parts supplier" button had somewhere to send people.
   *
   * ⚠️ WITHOUT IT THE IMAGE BUILDS AND THE CONTAINER DIES AT START: the
   * Dockerfile copies `.next/standalone`, which would simply not exist, so
   * `node apps/supplier-web/server.js` finds nothing. On Render that surfaces
   * as a failed health check with NO build error at all.
   *
   * Safe locally: `next start` warns about standalone and still serves a normal
   * build when one is present — customer-web has run this way in the Playwright
   * suite since 2026-08-03.
   */
  output: 'standalone',
  /**
   * The workspace root, not this app. pnpm links workspace packages through
   * symlinks into ../../node_modules/.pnpm, and tracing rooted at the app
   * directory would follow those links outside its root and drop the files.
   */
  outputFileTracingRoot: new URL('../../', import.meta.url).pathname,
  reactStrictMode: true,
  // Shared workspace packages are compiled by this app rather than pre-built,
  // so a token change is picked up without a separate build step.
  transpilePackages: ['@autoworkshop/ui', '@autoworkshop/design-tokens'],
  poweredByHeader: false,
};

/**
 * Exported as a FUNCTION so the build phase is visible to the guard below.
 * Next calls this with the phase it is running in; a plain object cannot see it.
 */
export default (phase) => {
  // Fails fast, in one line, when NODE_ENV=development would otherwise produce a
  // prerender crash two minutes later that blames an innocent component.
  // See scripts/assert-build-env.mjs for the full symptom list.
  assertBuildEnv(phase);
  return nextConfig;
};
