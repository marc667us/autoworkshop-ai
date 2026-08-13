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
   * Emit `.next/standalone` — a self-contained server plus only the node_modules
   * it actually traced.
   *
   * This app is deployed as a prebuilt container image rather than built on the
   * host that runs it, because Render's builder fails this build for reasons
   * that survived six attempts to find them, while the identical command
   * succeeds on Linux in CI. Standalone is what makes the runtime image small
   * enough to be worth doing: no pnpm store, no workspace, no build toolchain.
   *
   * Safe locally — `next start` prefers a normal build when one is present, and
   * this only ADDS the standalone directory.
   */
  output: 'standalone',
  /**
   * The workspace root, not this app. pnpm links workspace packages through
   * symlinks into ../../node_modules/.pnpm, and file tracing rooted at the app
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
