import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
    pool: 'forks',
    // node:sqlite still prints an ExperimentalWarning on Node 22; keep test output clean.
    execArgv: ['--disable-warning=ExperimentalWarning'],
  },
});
