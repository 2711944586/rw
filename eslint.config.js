import js from '@eslint/js';
import globals from 'globals';

const vitestGlobals = {
  afterAll: 'readonly',
  afterEach: 'readonly',
  beforeAll: 'readonly',
  beforeEach: 'readonly',
  describe: 'readonly',
  expect: 'readonly',
  it: 'readonly',
  test: 'readonly',
  vi: 'readonly',
};

export default [
  {
    ignores: [
      'coverage/**',
      'dist/**',
      'node_modules/**',
      'output/**',
      'playwright-report/**',
      'test-results/**',
      '.playwright-cli/**',
      '.playwright-mcp/**',
      '.vercel/**',
    ],
  },
  {
    files: ['**/*.{js,mjs,cjs}'],
    ...js.configs.recommended,
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
    },
    linterOptions: {
      reportUnusedDisableDirectives: 'error',
    },
    rules: {
      ...js.configs.recommended.rules,
      'no-unused-vars': ['error', {
        argsIgnorePattern: '^_',
        caughtErrors: 'none',
        varsIgnorePattern: '^_',
      }],
    },
  },
  {
    files: ['src/**/*.js'],
    languageOptions: {
      globals: globals.browser,
    },
  },
  {
    files: ['tests/**/*.js'],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
        ...vitestGlobals,
      },
    },
  },
  {
    files: ['scripts/**/*.{js,mjs,cjs}', '*.config.js', 'eslint.config.js'],
    languageOptions: {
      globals: globals.node,
    },
  },
  {
    // Scripts that drive a headless browser: the callbacks passed to
    // `page.evaluate()` run in the page, so they legitimately reference browser
    // globals that Node does not define.
    files: ['scripts/verify-*.mjs', 'scripts/diag-*.mjs', 'scripts/capture-*.mjs'],
    languageOptions: {
      globals: globals.browser,
    },
  },
];
