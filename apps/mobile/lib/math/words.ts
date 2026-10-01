// The spoken words of one language, arranged from locales/<lang>/math.json "spoken".
//
// Pure (no React, no i18next): components/math/useSpokenMath.ts hands in i18next's `t`,
// tests hand in a plain lookup over the JSON file. That is the point — the words the app
// speaks and the words the tests check are now the same words. Before issue #175 the tests
// carried their own hand-written copies, so "{{num}} durch {{den}}" passed every run while
// the app said "zwei durch fünf" for 2/5 out loud.

import { SYMBOL_KEYS, type SpokenWords } from './speak.js';

/** The denominators a language names ("ein Fünftel"); anything else keeps "x durch y". */
export const NAMED_DENOMINATORS = [
  2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 100, 1000,
] as const;

/** Templates keep their {{placeholders}} (i18next fills each with itself); speak.ts fills them. */
export const KEEP_PLACEHOLDERS = {
  num: '{{num}}',
  den: '{{den}}',
  exp: '{{exp}}',
  sub: '{{sub}}',
  body: '{{body}}',
  index: '{{index}}',
  name: '{{name}}',
  frac: '{{frac}}',
} as const;

/** Looks up one key under the "math" namespace ("spoken.frac", "blank.label"). */
export type Lookup = (key: string, vars?: Record<string, string>) => string;

export function spokenWordsFrom(t: Lookup): SpokenWords {
  const symbols: Record<string, string> = {};
  for (const [char, key] of Object.entries(SYMBOL_KEYS)) symbols[char] = t(`spoken.symbols.${key}`);
  const raw = (key: string) => t(`spoken.${key}`, KEEP_PLACEHOLDERS);
  return {
    frac: raw('frac'),
    frac_one: raw('frac_one'),
    frac_named: raw('frac_named'),
    frac_names: Object.fromEntries(
      NAMED_DENOMINATORS.map((den) => [
        String(den),
        { one: t(`spoken.frac_names.${den}.one`), many: t(`spoken.frac_names.${den}.many`) },
      ]),
    ),
    frac_long: raw('frac_long'),
    mixed: raw('mixed'),
    power: raw('power'),
    squared: raw('squared'),
    cubed: raw('cubed'),
    sub: raw('sub'),
    sqrt: raw('sqrt'),
    root: raw('root'),
    cbrt: raw('cbrt'),
    period: raw('period'),
    segment: raw('segment'),
    vector: raw('vector'),
    blank: t('blank.label'),
    symbols,
  };
}
