// @ts-check
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      // Subagent worktrees (each lints itself from its own root).
      '.claude/**',
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
    // EXPO_PUBLIC_* is inlined into the shipped JS bundle at build time: a service
    // key read here once nearly shipped. Configuration flows through lib/env.ts
    // only (the one file allowed to read process.env, plus the build-time config).
    files: ['apps/mobile/**/*.ts', 'apps/mobile/**/*.tsx'],
    ignores: ['apps/mobile/lib/env.ts', 'apps/mobile/app.config.ts'],
    rules: {
      'no-restricted-properties': [
        'error',
        {
          object: 'process',
          property: 'env',
          message:
            'EXPO_PUBLIC_* wird ins Bundle inline kompiliert — Konfiguration nur über lib/env.ts.',
        },
      ],
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
