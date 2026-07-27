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
   * One worker, in-process, on the deploy builder.
   *
   * After the checks were skipped the build still died — instantly, in the same
   * second, with no output, at "Collecting page data". That step forks a worker
   * pool sized from the CPU count, and an immediate silent death there is the
   * pool failing to start rather than a page failing to load: a page that
   * throws prints its own stack. Next swallows a worker that never comes up.
   *
   * `cpus: 1` plus `workerThreads: false` keeps page collection in one process.
   * It is slower, which is irrelevant for a deploy and would be annoying
   * locally — hence the flag.
   */
  experimental: constrainedBuild ? { cpus: 1, workerThreads: false } : {},
  reactStrictMode: true,
  // Shared workspace packages are compiled by this app rather than pre-built,
  // so a token change is picked up without a separate build step.
  transpilePackages: ['@autoworkshop/ui', '@autoworkshop/design-tokens'],
  poweredByHeader: false,
};

export default nextConfig;
