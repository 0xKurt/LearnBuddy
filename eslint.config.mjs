// @ts-check
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';
import { createRequire } from 'node:module';

// The one definition of a secret-sounding EXPO_PUBLIC_* name (issue #290), shared with the
// Metro gate and the bundle scan.
const { SECRET_NAME } = createRequire(import.meta.url)('./apps/mobile/scripts/client-secrets.cjs');

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
    ignores: [
      'apps/mobile/lib/env.ts',
      'apps/mobile/lib/processEnv.ts',
      'apps/mobile/app.config.ts',
    ],
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
    // A secret-sounding name under EXPO_PUBLIC_* is a secret in every bundle (issue #290):
    // reading one in the app is an error at the source already, before Metro's gate
    // (metro.config.js) and the scan of the finished bundle (scripts/web-walkthrough.sh).
    files: ['apps/mobile/**/*.ts', 'apps/mobile/**/*.tsx'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: `MemberExpression[object.object.name='process'][object.property.name='env'][property.name=/^EXPO_PUBLIC_.*${SECRET_NAME.source}/]`,
          message:
            'Ein EXPO_PUBLIC_*-Name mit SERVICE/SECRET/ADMIN/… landet im App-Bundle — Administrator- und Server-Schlüssel gehören nur auf den Server (Issue #290).',
        },
      ],
    },
  },
  {
    // Colours come from the palette in use, never from the module that applies it
    // (issue #29, layer 3). `LB` and its derived maps in lib/theme/colors.ts are live
    // objects: read into a screen at import time they can only be right for the palette
    // that happened to start the app. Screens and components ask `useTheme()` instead —
    // the tokens then arrive as props of a render, and React knows when they change.
    // Palette data and types (lib/theme/palettes.ts) stay free to import: they are plain
    // values, tied to no active theme.
    files: [
      'apps/mobile/app/**/*.ts',
      'apps/mobile/app/**/*.tsx',
      'apps/mobile/components/**/*.ts',
      'apps/mobile/components/**/*.tsx',
    ],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/theme/colors', '**/theme/colors.js'],
              message:
                'Farben kommen aus useTheme() (lib/theme/ThemeProvider.tsx), nicht aus lib/theme/colors.ts — LB & Co. sind lebende Objekte und frieren sonst die Startpalette ein (Issue #29).',
            },
          ],
        },
      ],
    },
  },
  {
    // CommonJS tooling loaded by Metro with `require` (apps/mobile/scripts/client-secrets.cjs).
    files: ['**/*.cjs'],
    languageOptions: {
      sourceType: 'commonjs',
      globals: {
        require: 'readonly',
        module: 'writable',
        process: 'readonly',
        console: 'readonly',
        URL: 'readonly',
        Buffer: 'readonly',
      },
    },
    rules: { '@typescript-eslint/no-require-imports': 'off' },
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
