import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    // Same Windows workaround as apps/api: the default worker-thread pool
    // produces "Timeout calling resolveSnapshotPath" and multi-minute runs on
    // this platform. Forks are stable and finish in seconds.
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
    testTimeout: 10_000,
    hookTimeout: 10_000,
    reporters: ['default'],
  },
});
