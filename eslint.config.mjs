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
    // A screen lays itself out on the height she can SEE, never on the window's (issue #289).
    // Since edge-to-edge Android keeps the window's height while the keyboard is up, so a
    // layout decided on `useWindowDimensions().height` stayed roomy behind it: one field above
    // the pinned CTA, the others and their errors under it. `useVisibleHeight()`
    // (lib/useVisibleHeight.ts) subtracts the keyboard; `formDensity()` (lib/keyboard.ts)
    // turns it into roomy/compact. Widths are free — the keyboard never takes any.
    files: [
      'apps/mobile/app/**/*.ts',
      'apps/mobile/app/**/*.tsx',
      'apps/mobile/components/**/*.ts',
      'apps/mobile/components/**/*.tsx',
    ],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector:
            "MemberExpression[object.callee.name='useWindowDimensions'][property.name='height']",
          message:
            'Die Fensterhöhe ignoriert die Tastatur (edge-to-edge) — useVisibleHeight() aus lib/useVisibleHeight.ts nehmen (Issue #289).',
        },
        {
          selector:
            "VariableDeclarator[init.callee.name='useWindowDimensions'] > ObjectPattern > Property[key.name='height']",
          message:
            'Die Fensterhöhe ignoriert die Tastatur (edge-to-edge) — useVisibleHeight() aus lib/useVisibleHeight.ts nehmen (Issue #289).',
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
