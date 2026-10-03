// Shared measurements for the guards (issue #313, docs/engineering-guards.md): the ratchet test
// and `pnpm guards:shrink` both ask these functions, so they can never disagree with each
// other — and they ask ESLint itself, so they can never disagree with `pnpm lint`.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { Linter } from 'eslint';
import tseslint from 'typescript-eslint';

import { countRawStyleNumbers, REPO_ROOT, repoPath } from './eslint-plugin.mjs';

export { REPO_ROOT, repoPath };

export const BASELINES = join(REPO_ROOT, 'tools', 'guards', 'baselines');

/** Rule 4: lines per file, blank lines and comments not counted. */
export const MAX_LINES = { 'apps/mobile': 600, 'apps/api': 800 };

/** Where rule 5 (tokens only) and the Pressable rule apply. */
export const UI_DIRS = ['apps/mobile/app', 'apps/mobile/components'];

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

/** @param {string} file repo-relative */
function read(file) {
  return readFileSync(join(REPO_ROOT, file), 'utf8');
}

/**
 * Lines that count for `max-lines` with skipBlankLines + skipComments — read from ESLint's own
 * message, so the number is exactly the one the lint compares against.
 * @param {string} file repo-relative
 */
export function countedLines(file) {
  const messages = linter.verify(
    read(file),
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

/** @param {string} file repo-relative */
export function styleNumbers(file) {
  return countRawStyleNumbers(linter, read(file), join(REPO_ROOT, file), PARSE);
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
 * @param {string} file repo-relative
 */
export function importsRawPressable(file) {
  const messages = linter.verify(
    read(file),
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

/** @param {string} name a file in baselines/ @returns {Record<string, unknown>} */
export function readBaseline(name) {
  return JSON.parse(readFileSync(join(BASELINES, name), 'utf8'));
}
