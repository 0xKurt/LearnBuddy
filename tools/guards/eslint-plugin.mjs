// LearnBuddy's own lint rules (issue #313, docs/engineering-guards.md).
//
// `lb/no-raw-style-number` — rule 5 "Nur Tokens": spacing, type size, line height and radius
// come from lib/theme (space.ts, type.ts …), never as a bare number in a screen or a component.
// One number may stay when the line (or the line above it) says why:
//
//     paddingTop: 3, // token-exempt: optical centre of the 17 pt glyph
//
// The files that break the rule today are on the Ausnahmeliste
// tools/guards/baselines/style-numbers.json with their count. A file may never have MORE than
// its count; when it has fewer, the list has to shrink with it (`pnpm guards:shrink`), so a
// fixed number cannot quietly come back.

import { readFileSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
/** The repository root: every path on an Ausnahmeliste is relative to it. */
export const REPO_ROOT = join(HERE, '..', '..');
export const STYLE_BASELINE = join(HERE, 'baselines', 'style-numbers.json');

/** padding*, margin*, gap/rowGap/columnGap, fontSize, lineHeight, border*Radius. */
const GUARDED =
  /^(padding|margin)([A-Z]\w*)?$|^(row|column)?[gG]ap$|^fontSize$|^lineHeight$|^border(\w*)Radius$/;
const EXEMPT = /token-exempt:\s*\S{3,}/;

/** @type {Record<string, number> | null} */
let baselineCache = null;
/** @returns {Record<string, number>} */
function styleBaseline() {
  if (baselineCache === null) {
    const parsed = JSON.parse(readFileSync(STYLE_BASELINE, 'utf8'));
    baselineCache = /** @type {Record<string, number>} */ (parsed.files ?? {});
  }
  return baselineCache;
}

/** @param {string} filename */
export function repoPath(filename) {
  return relative(REPO_ROOT, filename).split(sep).join('/');
}

/** @param {import('eslint').Rule.Node} node */
function propertyName(node) {
  if (node.type === 'Property' && !node.computed) {
    if (node.key.type === 'Identifier') return node.key.name;
    if (node.key.type === 'Literal' && typeof node.key.value === 'string') return node.key.value;
  }
  if (node.type === 'JSXAttribute' && node.name.type === 'JSXIdentifier') return node.name.name;
  return null;
}

/**
 * Every non-zero number literal inside a style value: `12`, `-4`, `cond ? 8 : 12`,
 * `SPACE.md + 2`, `Math.max(8, inset)`. A nested function or object is a value of its own and
 * is not entered (its own properties are visited by the rule anyway).
 * @param {import('eslint').Rule.Node} node
 * @param {import('eslint').Rule.Node[]} out
 */
function numbersIn(node, out) {
  if (!node) return;
  switch (node.type) {
    case 'Literal':
      if (typeof node.value === 'number' && node.value !== 0) out.push(node);
      return;
    case 'UnaryExpression':
      return numbersIn(node.argument, out);
    case 'BinaryExpression':
    case 'LogicalExpression':
      numbersIn(node.left, out);
      return numbersIn(node.right, out);
    case 'ConditionalExpression':
      numbersIn(node.consequent, out);
      return numbersIn(node.alternate, out);
    case 'CallExpression':
      for (const arg of node.arguments) numbersIn(arg, out);
      return;
    case 'TSAsExpression':
    case 'TSSatisfiesExpression':
    case 'TSNonNullExpression':
    case 'JSXExpressionContainer':
      return numbersIn(node.expression, out);
    default:
      return;
  }
}

/** @type {import('eslint').Rule.RuleModule} */
const noRawStyleNumber = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Abstände, Schriftgrößen, Zeilenhöhen und Radien nur aus lib/theme (Regel 5, Issue #313).',
    },
    schema: [],
    messages: {
      raw: '{{prop}}: {{value}} ist eine freie Zahl. Token aus lib/theme nehmen (SPACE, TYPE …) oder die Ausnahme begründen: `// token-exempt: <Grund>`. {{count}}',
      stale:
        'Ausnahmeliste veraltet: diese Datei hat noch {{now}} freie Stilzahlen, die Liste erlaubt {{allowed}}. Die Liste schrumpft mit: `pnpm guards:shrink` (tools/guards/baselines/style-numbers.json).',
    },
  },
  create(context) {
    const source = context.sourceCode;
    const file = repoPath(context.filename);
    const allowed = styleBaseline()[file] ?? 0;
    /** @type {{ node: import('eslint').Rule.Node, prop: string }[]} */
    const found = [];

    /** @param {import('eslint').Rule.Node} literal */
    const exempt = (literal) => {
      const line = literal.loc.start.line;
      return source
        .getAllComments()
        .some(
          (c) =>
            EXEMPT.test(c.value) &&
            c.loc != null &&
            (c.loc.start.line === line || c.loc.end.line === line - 1),
        );
    };

    /** @param {import('eslint').Rule.Node} node */
    const visit = (node) => {
      const prop = propertyName(node);
      if (prop === null || !GUARDED.test(prop)) return;
      /** @type {import('eslint').Rule.Node[]} */
      const numbers = [];
      numbersIn(node.value, numbers);
      for (const n of numbers) if (!exempt(n)) found.push({ node: n, prop });
    };

    return {
      Property: visit,
      JSXAttribute: visit,
      'Program:exit'(program) {
        if (found.length > allowed) {
          const count =
            allowed > 0
              ? `(Datei: ${found.length}, Ausnahmeliste erlaubt ${allowed} — eine neue kam dazu.)`
              : '';
          for (const { node, prop } of found) {
            context.report({
              node,
              messageId: 'raw',
              data: { prop, value: source.getText(node), count },
            });
          }
        } else if (found.length < allowed) {
          context.report({
            node: program,
            loc: { line: 1, column: 0 },
            messageId: 'stale',
            data: { now: String(found.length), allowed: String(allowed) },
          });
        }
      },
    };
  },
};

/**
 * The count a file has today — used by `pnpm guards:shrink` to rewrite the list. Exported so
 * the shrink script and the rule can never disagree about what counts.
 * @param {import('eslint').Linter} linter
 * @param {string} text
 * @param {string} filename
 * @param {import('eslint').Linter.Config[]} baseConfig
 */
export function countRawStyleNumbers(linter, text, filename, baseConfig) {
  const saved = baselineCache;
  baselineCache = {};
  try {
    const messages = linter.verify(
      text,
      [...baseConfig, { plugins: { lb: plugin }, rules: { 'lb/no-raw-style-number': 'error' } }],
      filename,
    );
    return messages.filter((m) => m.ruleId === 'lb/no-raw-style-number').length;
  } finally {
    baselineCache = saved;
  }
}

const plugin = {
  meta: { name: 'eslint-plugin-lb' },
  rules: { 'no-raw-style-number': noRawStyleNumber },
};

export default plugin;
