import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // BOTH suffixes, deliberately. The packages settled on `.test.ts` and
    // `apps/api` on `.spec.ts`, and NOTHING enforced which one you were in — a
    // file named with the other convention was silently never collected, and a
    // suite that runs zero tests still exits 0. This repo lost two days to
    // exactly that (`pnpm e2e` green while collecting nothing), so the include
    // accepts either rather than depending on everyone remembering which
    // directory they are in.
    include: ['src/**/*.{test,spec}.ts'],
    environment: 'node',
    // Same Windows workaround as apps/api and packages/next-shell: the default
    // worker-thread pool produces "Timeout calling resolveSnapshotPath" and
    // multi-minute runs on this platform. Forks are stable and finish in seconds.
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
    testTimeout: 10_000,
    hookTimeout: 10_000,
    reporters: ['default'],
  },
});
