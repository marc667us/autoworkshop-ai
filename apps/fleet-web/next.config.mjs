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
   * 2026-08-09 when this app was first deployed.
   *
   * ⚠️ WITHOUT IT THE IMAGE BUILDS AND THE CONTAINER DIES AT START: the
   * Dockerfile copies `.next/standalone`, which would simply not exist. On
   * Render that surfaces as a failed health check with NO build error at all.
   */
  output: 'standalone',
  /**
   * The workspace root, not this app. pnpm links workspace packages through
   * symlinks into ../../node_modules/.pnpm, and tracing rooted at the app
   * directory would follow those links outside its root and drop the files.
   *
   * ⚠️ `.pathname`, DELIBERATELY — `fileURLToPath` was measured and is worse
   * here. On Windows `.pathname` yields `/C:/Users/...`, tracing finds nothing,
   * no `standalone/` is emitted and the build exits 0; `fileURLToPath` gives a
   * real path, tracing then tries to copy a tree of SYMLINKS and the build dies
   * with `EPERM`. Neither produces a usable standalone tree on Windows, and a
   * build that FAILS on a developer machine is the worse trade. On Linux — where
   * the image is actually built — this yields `/repo/`, which is correct.
   *
   * 🔴 THE CONSEQUENCE: a local build CANNOT prove this Dockerfile. Only the
   * Linux image build can, which is why the deploy workflow's container smoke
   * test is UNGATED and a dry run is the first honest test of standalone.
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
