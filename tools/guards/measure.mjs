// Shared measurements for the guards (issue #313, docs/engineering-guards.md): what main has is
// measured with these functions (base.mjs, issue #452), and they ask ESLint itself, so the
// measure can never disagree with `pnpm lint`. They take a file's text, not its path: main's
// version of a file comes from the object store, not from the checkout.

import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { Linter } from 'eslint';
import tseslint from 'typescript-eslint';

import { countRawStyleNumbers, REPO_ROOT, repoPath } from './eslint-plugin.mjs';

export { REPO_ROOT, repoPath };

/** Rule 4: lines per file, blank lines and comments not counted. */
export const MAX_LINES = { 'apps/mobile': 600, 'apps/api': 800 };

/** Where rule 5 (tokens only) applies. */
export const UI_DIRS = ['apps/mobile/app', 'apps/mobile/components'];

/** Where the Pressable rule applies (`components/lb` excepted: it is the design system). */
export const PRESSABLE_DIRS = [...UI_DIRS, 'apps/mobile/lib'];

const SOURCE = /\.(ts|tsx|mjs|js)$/;
const SKIP_DIR = new Set(['node_modules', 'dist', 'dist-web', '.expo', 'coverage', 'build']);

/** @param {string} dir repo-relative @returns {string[]} repo-relative files */
export function sourceFiles(dir) {
  /** @type {string[]} */
  const out = [];
  /** @param {string} abs */
  const walk = (abs) => {
    for (const name of readdirSync(abs)) {
      if (SKIP_DIR.has(name)) continue;
      const path = join(abs, name);
      if (statSync(path).isDirectory()) walk(path);
      else if (SOURCE.test(name)) out.push(repoPath(path));
    }
  };
  walk(join(REPO_ROOT, dir));
  return out.sort();
}

const linter = new Linter({ cwd: REPO_ROOT });
/** @type {import('eslint').Linter.Config[]} */
const PARSE = [
  {
    files: ['**/*.ts', '**/*.tsx', '**/*.mjs', '**/*.js'],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
  },
];

/**
 * Lines that count for `max-lines` with skipBlankLines + skipComments — read from ESLint's own
 * message, so the number is exactly the one the lint compares against.
 * @param {string} text @param {string} file repo-relative
 */
export function countedLines(text, file) {
  const messages = linter.verify(
    text,
    [
      ...PARSE,
      {
        rules: { 'max-lines': ['error', { max: 1, skipBlankLines: true, skipComments: true }] },
      },
    ],
    join(REPO_ROOT, file),
  );
  const hit = messages.find((m) => m.ruleId === 'max-lines');
  if (hit === undefined) return 1;
  const match = /\((\d+)\)/.exec(hit.message);
  if (match === null) throw new Error(`max-lines message changed shape: ${hit.message}`);
  return Number(match[1]);
}

/** Free style numbers (rule 5). @param {string} text @param {string} file repo-relative */
export function styleNumbers(text, file) {
  return countRawStyleNumbers(linter, text, join(REPO_ROOT, file), PARSE);
}

/** The interactive primitives that bypass <Btn> (CLAUDE.md rule 13). */
export const RAW_PRESSABLES = {
  'react-native': [
    'Pressable',
    'TouchableOpacity',
    'TouchableHighlight',
    'TouchableWithoutFeedback',
    'TouchableNativeFeedback',
  ],
  'react-native-gesture-handler': [
    'Pressable',
    'TouchableOpacity',
    'TouchableHighlight',
    'TouchableWithoutFeedback',
    'RectButton',
    'BorderlessButton',
    'BaseButton',
  ],
};

/**
 * Whether a file imports one of RAW_PRESSABLES — asked through ESLint's own
 * no-restricted-imports, the same rule `pnpm lint` runs.
 * @param {string} text @param {string} file repo-relative
 */
export function importsRawPressable(text, file) {
  const messages = linter.verify(
    text,
    [...PARSE, { rules: { 'no-restricted-imports': ['error', pressableRestriction()] } }],
    join(REPO_ROOT, file),
  );
  return messages.some((m) => m.ruleId === 'no-restricted-imports');
}

/** The `paths` option of no-restricted-imports that bans RAW_PRESSABLES. */
export function pressableRestriction() {
  return {
    paths: Object.entries(RAW_PRESSABLES).map(([name, importNames]) => ({
      name,
      importNames,
      message:
        'Aktionen sind <Btn>/<CircleBtn> aus components/lb (CLAUDE.md Regel 13, Issue #313). Fehlt dort ein Baustein, wird er in components/lb gebaut — nicht hier.',
    })),
  };
}
