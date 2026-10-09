// Unused texts (issue #322, docs/engineering-guards.md): every key in the app's language files
// (apps/mobile/locales/de) and the API's (apps/api/src/i18n/de.json) is named somewhere in
// product source. A key nobody names is a text nobody sees — it is translated five times and
// kept in step by the parity tests for nothing.
//
// Keys are often built at run time (`t(\`staff.clef.${clef}\`)`, `t(\`${action}_label\`)`), so
// "named" is generous on purpose: a key counts as used when its path is a string literal
// anywhere in product source (with or without `ns:`; an array such as `column.places` is one
// key), when a key-shaped template matches it, when a literal prefix ending in `.` or `_` starts
// it, when code reads it as a property path (`messages.voice.sample`), or when code indexes it
// or a parent (`messages.weekday[…]`). Plural forms (`_one`, `_other`, …) count with their
// base. A finding is therefore a key that no code can reach.

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { REPO_ROOT, sourceFiles } from './measure.mjs';

/** Product source: what the app and the API run (tests, the harness and the evals are not). */
const SOURCE_DIRS = ['apps/mobile', 'apps/api/src', 'packages'];
const NOT_PRODUCT = /(__tests__\/|\.test\.|\/testing\/|\/evals\/|\/scripts\/|vitest)/;
const MOBILE_LOCALES = 'apps/mobile/locales/de';
const API_MESSAGES = 'apps/api/src/i18n/de.json';
const PLURAL = /_(zero|one|two|few|many|other)$/;

/**
 * @typedef {{ ns: string | null, path: string }} Key  `ns` is the app's namespace file; the
 *   API's messages have none.
 */

/** @param {unknown} tree @param {string | null} ns @returns {Key[]} every leaf (an array is one) */
export function keysOf(tree, ns) {
  /** @type {Key[]} */
  const out = [];
  /** @param {unknown} node @param {string} path */
  const walk = (node, path) => {
    if (node !== null && typeof node === 'object' && !Array.isArray(node)) {
      for (const [k, v] of Object.entries(node)) walk(v, path === '' ? k : `${path}.${k}`);
    } else out.push({ ns, path });
  };
  walk(tree, '');
  return out;
}

/** @param {string} s */
const escape = (s) => s.replace(/[.*+?^$()|[\]\\{}]/g, '\\$&');

/**
 * What the source names: its string literals, the key-shaped templates as patterns, and the
 * literal prefixes.
 * @param {string[]} texts @param {ReadonlySet<string>} namespaces
 */
function namesIn(texts, namespaces) {
  /** @type {Set<string>} */
  const literals = new Set();
  /** @type {RegExp[]} */
  const patterns = [];
  /** @type {string[]} */
  const prefixes = [];
  const nsPrefix = new RegExp(`^(?:${[...namespaces].map(escape).join('|') || '(?!)'}):`);
  for (const text of texts) {
    for (const m of text.matchAll(/'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"/g)) {
      const s = /** @type {string} */ (m[1] ?? m[2]);
      literals.add(s);
      if (/^(?:\w+:)?[a-z]\w+(?:\.\w+)*[._]$/i.test(s)) prefixes.push(s.replace(nsPrefix, ''));
    }
    for (const m of text.matchAll(/`((?:[^`\\$]|\\.)*)`/g))
      literals.add(/** @type {string} */ (m[1]));
    // Every stretch between two backticks: a template nested in another one's ${…}
    // (`${base} ${t(`drill.carry_${c}`)}`) is no match of its own for a regular expression.
    for (const s of text.split('`')) {
      if (!s.includes('${')) continue;
      const parts = s.replace(nsPrefix, '').split(/\$\{(?:[^{}]|\{[^{}]*\})*\}/);
      if (!parts.every((p) => /^[\w.]*$/.test(p))) continue;
      // Enough fixed text to be a key and not an id: a separator and three letters.
      const fixed = parts.join('');
      if (!/[._]/.test(fixed) || (fixed.match(/[a-z]/gi) ?? []).length < 3) continue;
      patterns.push(new RegExp(`^${parts.map(escape).join('.+')}$`));
    }
  }
  return { literals, patterns, prefixes };
}

/**
 * The keys no source names.
 * @param {Key[]} keys @param {string[]} texts product source
 * @returns {Key[]}
 */
export function unusedKeys(keys, texts) {
  const namespaces = new Set(keys.flatMap((k) => (k.ns === null ? [] : [k.ns])));
  const { literals, patterns, prefixes } = namesIn(texts, namespaces);
  const all = texts.join('\n');
  /** @param {Key} key */
  const named = ({ ns, path }) => {
    for (const p of new Set([path, path.replace(PLURAL, '')])) {
      const full = ns === null ? p : `${ns}:${p}`;
      if (literals.has(p) || literals.has(full)) return true;
      if (patterns.some((re) => re.test(p))) return true;
      if (prefixes.some((pre) => p.startsWith(pre))) return true;
      const segs = p.split('.');
      // Read as a property path (messages.voice.sample: two segments at least, a single word
      // is too common), or it or a parent indexed by code (messages.weekday[…]).
      if (segs.length > 1 && new RegExp(`\\.${escape(p)}(?![\\w.])`).test(all)) return true;
      for (let i = 1; i <= segs.length; i++) {
        const node = segs.slice(0, i).join('.');
        if (new RegExp(`\\.${escape(node)}\\[`).test(all)) return true;
      }
    }
    return false;
  };
  return keys.filter((k) => !named(k));
}

/** The repository's findings, as `file: key`. @returns {string[]} */
export function findUnusedKeys() {
  const texts = SOURCE_DIRS.flatMap(sourceFiles)
    .filter((f) => !NOT_PRODUCT.test(f))
    .map((f) => readFileSync(join(REPO_ROOT, f), 'utf8'));
  const read = (/** @type {string} */ f) => JSON.parse(readFileSync(join(REPO_ROOT, f), 'utf8'));
  const mobile = readdirSync(join(REPO_ROOT, MOBILE_LOCALES))
    .filter((f) => f.endsWith('.json'))
    .flatMap((f) => keysOf(read(`${MOBILE_LOCALES}/${f}`), f.replace(/\.json$/, '')));
  return [
    ...unusedKeys(mobile, texts).map((k) => `${MOBILE_LOCALES}/${k.ns}.json: ${k.path}`),
    ...unusedKeys(keysOf(read(API_MESSAGES), null), texts).map((k) => `${API_MESSAGES}: ${k.path}`),
  ];
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const found = findUnusedKeys();
  if (found.length > 0) {
    console.error(
      `✗ Ungenutzte Texte: ${found.length} — in allen fünf Sprachen löschen, oder den Aufrufer ` +
        `so schreiben, dass der Key im Quelltext steht\n\n${found.join('\n')}`,
    );
    process.exit(1);
  }
  console.log('✓ Ungenutzte Texte: keine');
}
