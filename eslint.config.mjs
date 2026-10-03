// @ts-check
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

/** In a string or a template (SQL), both checked; `.` stands for the slash esquery cannot escape. */
const forbidText = (pattern, message) => [
  { selector: `TemplateElement[value.raw=/${pattern}/]`, message },
  { selector: `Literal[value=/${pattern}/]`, message },
];

// The context fence has one door (CLAUDE.md rule 4, issue #315): every change a decision depends
// on moves `context_version` through `bumpContext` (apps/api/src/modules/buddy/plan.ts), in the
// caller's transaction. The #311 audit found a hand-written `context_version + 1` at three
// places — the same SQL that day, a silent drift the next.
const CONTEXT_BUMP_GUARD = forbidText(
  'context_version\\s*\\+',
  'context_version nur über bumpContext() (modules/buddy/plan.ts) erhöhen — CLAUDE.md Regel 4, Issue #315.',
);

// One default zone (issue #315): DEFAULT_TIMEZONE in packages/shared-types
// (src/contracts/common.ts) is the only place that names it; a learner's zone comes from
// learnerTimezone() / learnerZoneSql() (apps/api/src/lib/zone.ts). The audit found it written
// 14 times, and one lookup without any fallback.
const DEFAULT_ZONE_GUARD = forbidText(
  'Europe.Berlin',
  'Standard-Zeitzone nur als DEFAULT_TIMEZONE (@learnbuddy/shared-types/contracts); die Zone eines Lernenden über learnerTimezone() — Issue #315.',
);

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
    // Two guards of issue #315, as one `no-restricted-syntax` list (a later block replaces the
    // list for its files, it does not add to it — hence the variants below).
    files: ['apps/**/*.ts', 'apps/**/*.tsx', 'packages/**/*.ts'],
    rules: { 'no-restricted-syntax': ['error', ...CONTEXT_BUMP_GUARD, ...DEFAULT_ZONE_GUARD] },
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
    rules: { 'no-restricted-syntax': ['error', ...CONTEXT_BUMP_GUARD] },
  },
  {
    // The one door itself.
    files: ['apps/api/src/modules/buddy/plan.ts'],
    rules: { 'no-restricted-syntax': ['error', ...DEFAULT_ZONE_GUARD] },
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
