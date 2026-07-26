import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.spec.ts'],
    environment: 'node',
    // Windows + the default worker-thread pool produced "Timeout calling
    // resolveSnapshotPath" and a 4-minute run. Forks are stable here and the
    // suite completes in seconds.
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
    testTimeout: 10_000,
    hookTimeout: 10_000,
    reporters: ['default'],
  },
});
