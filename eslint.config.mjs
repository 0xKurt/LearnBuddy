// @ts-check
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/.expo/**',
      '**/.vercel/**',
      '**/.turbo/**',
      '**/coverage/**',
      // Build output and browser-walkthrough results (see scripts/web-walkthrough.sh).
      '**/dist-web/**',
      'test-results/**',
      'playwright-report/**',
      'design-examples/**',
      'docs/**',
      // Local work-in-progress parked outside the build (gitignored, may not exist).
      'wip/**',
      // Tool config files loaded as CommonJS by their tools regardless of
      // package.json type — let them speak require/module without lint noise.
      '**/babel.config.js',
      '**/metro.config.js',
      '**/tailwind.config.js',
      // Expo config plugins (app.json), loaded by the Expo CLI as CommonJS.
      'apps/mobile/plugins/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': [
        'warn',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
  {
    // Plain Node scripts (tooling): Node's globals.
    files: ['**/*.mjs'],
    languageOptions: {
      globals: { process: 'readonly', console: 'readonly', URL: 'readonly', Buffer: 'readonly' },
    },
  },
  prettier,
);
