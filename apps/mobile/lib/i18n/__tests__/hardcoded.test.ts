// No text in a fixed language anywhere in the app (issue #116). The owner's rule, and the
// reason the five locale files exist at all — a string written straight into a component is
// invisible to every other language, and `parity.test.ts` cannot see it: that test compares
// the five files against each other, so text that never became a key simply is not there.
//
// This is the same guard that the theme needed (lib/theme/__tests__/frozen-colors.test.ts):
// the rule was known, the tree was clean, and it stopped being clean without anyone noticing.
// A scanner is what holds it.
//
// What counts as a violation: a string literal in a prop a person reads, or a JSX text node
// made of words. What does not: characters that mean the same in every language, technical
// values, and the exceptions named below — each with its reason, never a bare ignore list.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const ROOTS = ['app', 'components'];

/** Props whose value a person reads or hears. */
const VISIBLE_PROP =
  /\b(accessibilityLabel|accessibilityHint|placeholder|title|label)\s*=\s*["']([^"']+)["']/g;

/**
 * A JSX text node of real words: `>Weiter geht es</Text>`. The closing `</` is what tells it
 * apart from a type annotation — `useRef<() => Promise<void>>` also reads as `> word <`.
 */
const JSX_TEXT = />\s*([A-Za-zÄÖÜäöüß][A-Za-zÄÖÜäöüß ,.'’!?-]{4,})\s*<\//g;

/**
 * Text that reads the same in every language, so it carries no translation.
 * Kept narrow on purpose: symbols and digits, never words.
 */
const LANGUAGE_FREE = /^[^A-Za-zÄÖÜäöüß]+$/;

/**
 * Files that are not product surface, with the reason. A file lands here only when the text
 * in it is read by a developer or sent to the model — never to save work on a real screen.
 */
const EXEMPT: ReadonlyArray<{ file: string; why: string }> = [
  {
    file: 'components/lb/DevHostNote.tsx',
    why: 'diagnostic marker for developers; renders only in dev builds, never in a release',
  },
  {
    file: 'components/lb/Wordmark.tsx',
    why: 'the product name, which is the same word in every language — translating "LearnBuddy" would be translating the brand (issue #135)',
  },
];

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '__tests__') continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out.push(...sourceFiles(path));
    else if (name.endsWith('.tsx')) out.push(path);
  }
  return out;
}

export function hardcodedStrings(path: string, source: string): string[] {
  const hits: string[] = [];
  const lines = source.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const trimmed = line.trim();
    if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) continue;
    for (const m of line.matchAll(VISIBLE_PROP)) {
      if (!LANGUAGE_FREE.test(m[2]!)) hits.push(`${path}:${i + 1}: ${m[1]}="${m[2]}"`);
    }
    for (const m of line.matchAll(JSX_TEXT)) {
      hits.push(`${path}:${i + 1}: text "${m[1]!.trim()}"`);
    }
  }
  return hits;
}

describe('every word a person reads comes from the locale files', () => {
  it('no component writes text in a fixed language', () => {
    const root = join(__dirname, '../../..');
    const exempt = new Set(EXEMPT.map((e) => join(root, e.file)));
    const hits = ROOTS.flatMap((r) => sourceFiles(join(root, r)))
      .filter((f) => !exempt.has(f))
      .flatMap((f) => hardcodedStrings(f.slice(root.length + 1), readFileSync(f, 'utf8')));
    expect(
      hits,
      'move these into locales/<lang>/*.json and read them with t() (issue #116)',
    ).toEqual([]);
  });

  // The scanner is only worth its runtime if it actually catches the mistake it exists for.
  it('catches a fixed label, a fixed JSX text, and lets symbols through', () => {
    expect(hardcodedStrings('x.tsx', '<Btn accessibilityLabel="Foto machen" />')).toHaveLength(1);
    expect(hardcodedStrings('x.tsx', '<Text>Weiter geht es</Text>')).toHaveLength(1);
    expect(hardcodedStrings('x.tsx', '<LbTextInput placeholder="••••" />')).toEqual([]);
    expect(hardcodedStrings('x.tsx', '<Btn accessibilityLabel={t("a11y.photo")} />')).toEqual([]);
    // A comment may say anything; it is not on screen.
    expect(hardcodedStrings('x.tsx', '// placeholder="Foto machen"')).toEqual([]);
  });
});
