import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: [
      'tests/**/*.{test,spec}.{js,mjs}',
      'src/**/*.{test,spec}.{js,mjs}'
    ],
    globals: true
  }
});
