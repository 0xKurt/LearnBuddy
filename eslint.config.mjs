// @ts-check
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';
import { fileAllowance } from './tools/guards/base.mjs';
import lb from './tools/guards/eslint-plugin.mjs';
import { MAX_LINES, pressableRestriction } from './tools/guards/measure.mjs';

// What a file may still have of the debt the guards below count: what it has on main (issue
// #452, tools/guards/base.mjs), plus what this branch grants itself in tools/guards/growth/.
const onMain = fileAllowance();

// The colour rule below (issue #29) and the Pressable guard (issue #313) are both options of
// `no-restricted-imports`; a later block replaces the option of an earlier one, so the pattern
// lives here once and both blocks spread it.
const COLOURS_FROM_THEME = {
  group: ['**/theme/colors', '**/theme/colors.js'],
  message:
    'Farben kommen aus useTheme() (lib/theme/ThemeProvider.tsx), nicht aus lib/theme/colors.ts — LB & Co. sind lebende Objekte und frieren sonst die Startpalette ein (Issue #29).',
};
/** A file path as a glob that matches only itself (`app/practice/[id].tsx` has brackets). */
const literal = (/** @type {string} */ file) => file.replace(/[[\]*?{}()!]/g, '\\$&');
const UI_FILES = [
  'apps/mobile/app/**/*.ts',
  'apps/mobile/app/**/*.tsx',
  'apps/mobile/components/**/*.ts',
  'apps/mobile/components/**/*.tsx',
];

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
    // Colours come from the palette in use, never from the module that applies it
    // (issue #29, layer 3). `LB` and its derived maps in lib/theme/colors.ts are live
    // objects: read into a screen at import time they can only be right for the palette
    // that happened to start the app. Screens and components ask `useTheme()` instead —
    // the tokens then arrive as props of a render, and React knows when they change.
    // Palette data and types (lib/theme/palettes.ts) stay free to import: they are plain
    // values, tied to no active theme.
    files: UI_FILES,
    rules: {
      'no-restricted-imports': ['error', { patterns: [COLOURS_FROM_THEME] }],
    },
  },
  // ── Engineering guards (issue #313, docs/engineering-guards.md) ──────────────────────────
  // A file that breaks one today may keep what it has on main and never get worse; what it fixes
  // stays fixed once it is on main, because main is measured anew (`onMain` above).
  {
    // Rule 2 / CLAUDE.md rule 13: actions are <Btn>/<IconBtn> from components/lb. A raw
    // Pressable or Touchable* is the design system's business only.
    files: [...UI_FILES, 'apps/mobile/lib/**/*.ts', 'apps/mobile/lib/**/*.tsx'],
    ignores: ['apps/mobile/components/lb/**', ...onMain.pressable.map(literal)],
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: [COLOURS_FROM_THEME], ...pressableRestriction() },
      ],
    },
  },
  {
    // Forbidden code shapes, each its own rule (tools/guards/syntax-rules.mjs): as entries of
    // `no-restricted-syntax` a later block replaced an earlier one's list and a guard went silent.
    files: ['apps/**/*.{ts,tsx}', 'packages/**/*.ts'],
    plugins: { lb },
    rules: { 'lb/no-context-bump': 'error', 'lb/no-default-zone': 'error' },
  },
  {
    // The one door itself (issue #315).
    files: ['apps/api/src/modules/buddy/plan.ts'],
    rules: { 'lb/no-context-bump': 'off' },
  },
  {
    // Tests and fixtures pick their zones on purpose; the context fence still holds there.
    files: [
      '**/__tests__/**',
      '**/*.test.ts',
      '**/*.test.tsx',
      'apps/api/src/testing/**',
      'apps/api/evals/**',
      'apps/mobile/testing/**',
      'packages/shared-types/src/contracts/common.ts',
    ],
    rules: { 'lb/no-default-zone': 'off' },
  },
  {
    files: ['apps/mobile/**/*.{ts,tsx}'],
    rules: { 'lb/no-public-secret': 'error' },
  },
  {
    files: ['apps/api/src/__tests__/**/*.ts'],
    rules: { 'lb/no-early-script-report': 'error' },
  },
  {
    // One text field (issue #365): React Native's TextInput only inside the field itself.
    files: ['apps/mobile/**/*.{ts,tsx}'],
    ignores: ['apps/mobile/components/lb/LbTextInput.tsx'],
    rules: { 'lb/one-text-field': 'error' },
  },
  {
    files: ['apps/mobile/app/**/*.{ts,tsx}', 'apps/mobile/components/**/*.{ts,tsx}'],
    rules: { 'lb/no-window-height': 'error' },
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
    // Rule 5: spacing, type size, line height and radius only from lib/theme.
    files: UI_FILES,
    ignores: ['**/__tests__/**'],
    plugins: { lb },
    rules: { 'lb/no-raw-style-number': ['error', { allowed: onMain.styleNumbers }] },
  },
  // Rule 4: small units — 600 lines per file in the app, 800 in the API, blank lines and
  // comments not counted. A file above it on main keeps its size there as its limit.
  ...Object.entries(MAX_LINES).map(([dir, max]) => ({
    files: [`${dir}/**/*.{ts,tsx,js,mjs}`],
    rules: { 'max-lines': ['error', { max, skipBlankLines: true, skipComments: true }] },
  })),
  ...Object.entries(onMain.maxLines).map(([file, max]) => ({
    files: [literal(file)],
    rules: { 'max-lines': ['error', { max, skipBlankLines: true, skipComments: true }] },
  })),
  {
    // Plain Node scripts (tooling): Node's globals.
    files: ['**/*.mjs'],
    languageOptions: {
      globals: { process: 'readonly', console: 'readonly', URL: 'readonly', Buffer: 'readonly' },
    },
  },
  prettier,
);
