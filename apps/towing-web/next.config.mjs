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
   * 2026-08-09 when towing-web was first deployed. The ten screens had been
   * built, gated and committed for a day with no deploy workflow and no Render
   * service: the API behind them was live and answering 401 while the screens
   * themselves were reachable by nobody.
   *
   * ⚠️ WITHOUT IT THE IMAGE BUILDS AND THE CONTAINER DIES AT START: the
   * Dockerfile copies `.next/standalone`, which would simply not exist, so
   * `node apps/towing-web/server.js` finds nothing. On Render that surfaces as
   * a failed health check with NO build error at all.
   */
  output: 'standalone',
  /**
   * The workspace root, not this app. pnpm links workspace packages through
   * symlinks into ../../node_modules/.pnpm, and tracing rooted at the app
   * directory would follow those links outside its root and drop the files.
   *
   * ⚠️ `.pathname`, AND THAT IS DELIBERATE — `fileURLToPath` WAS TRIED AND IS
   * WORSE HERE. Both were measured on this Windows workstation:
   *
   *   .pathname       → `/C:/Users/...`, not a Windows path. Tracing finds
   *                     nothing, NO `standalone/` is emitted, and the build
   *                     exits 0. Silently green.
   *   fileURLToPath   → a real Windows path. Tracing works, Next then tries to
   *                     copy the traced tree, and every copy is a SYMLINK:
   *                     `EPERM: operation not permitted, symlink` and the build
   *                     exits 1. Loudly red.
   *
   * Neither produces a usable standalone tree on Windows, so the choice is only
   * about which failure the owner's local `pnpm build` shows — and a build that
   * FAILS on a developer machine, for a directory only the Linux image ever
   * consumes, is the worse trade. On Linux `.pathname` yields `/repo/`, which is
   * correct, which is why supplier-web ships this form and is live.
   *
   * 🔴 THE CONSEQUENCE, AND IT IS THE POINT: a local build CANNOT prove this
   * Dockerfile. Only the image build on Linux can, which is why the deploy
   * workflow's container smoke test is UNGATED — a dry run is the first honest
   * test of standalone that exists.
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
