import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: [
      'tests/**/*.{test,spec}.{js,mjs}',
      'src/**/*.{test,spec}.{js,mjs}'
    ],
    globals: true,
    // Deliberately kept out of the `quality` chain: coverage is a diagnostic,
    // not a gate. The thresholds are set just below the measured baseline so
    // `npm run test:coverage` fails when coverage regresses rather than asking
    // for a number nobody maintains.
    coverage: {
      provider: 'v8',
      thresholds: {
        statements: 49,
        branches: 45,
        functions: 49,
        lines: 50
      }
    }
  }
});
