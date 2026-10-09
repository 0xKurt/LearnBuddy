// The spoken words of one language, arranged from locales/<lang>/math.json "spoken".
//
// Pure (no React, no i18next): components/math/useSpokenMath.ts hands in i18next's `t`,
// tests hand in a plain lookup over the JSON file. That is the point — the words the app
// speaks and the words the tests check are now the same words. Before issue #175 the tests
// carried their own hand-written copies, so "{{num}} durch {{den}}" passed every run while
// the app said "zwei durch fünf" for 2/5 out loud.

// Cost, measured 01.10. on this machine (the owner asked that reading aloud not slow the
// answer down): building one language's words with the real i18next takes **0.31 ms**, and
// speaking a dense sentence — two fractions, a squared unit, a power, a root, a temperature
// — takes **14 µs**. The build happens once per component per language change, the speaking
// once per message. Nothing here is on the path of a waiting child.
//
// Re-measured 01.10. after the root ordinals and the decimal word: the 22 lookups they add
// cost **0.033 ms**, so the build stays in the same third of a millisecond (0.22 → 0.25 ms
// on this run; the 0.31 ms above was the same build under more load, so it still holds as
// the upper figure). Speaking is unchanged at ~9 µs, with a repeating decimal added to the
// dense sentence.

import { SYMBOL_KEYS, type SpokenWords } from './speak.js';

/** The denominators a language names ("ein Fünftel"); anything else keeps "x durch y". */
const NAMED_DENOMINATORS = [
  2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 100, 1000,
] as const;

/**
 * The root indices a language has an ordinal word for ("vierte Wurzel"); an index outside
 * this set keeps the plain form ("n. Wurzel aus x") — clumsy, but never invented.
 */
const ROOT_ORDINALS = [
  1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20,
] as const;

/** The unit symbols a locale names; anything else is spoken as it is written. */
const UNIT_SYMBOLS = [
  'mm',
  'cm',
  'dm',
  'm',
  'km',
  'g',
  'kg',
  't',
  'ml',
  'l',
  's',
  'min',
  'h',
  '€',
  '°C',
  '°F',
] as const;

/** Templates keep their {{placeholders}} (i18next fills each with itself); speak.ts fills them. */
const KEEP_PLACEHOLDERS = {
  num: '{{num}}',
  den: '{{den}}',
  exp: '{{exp}}',
  sub: '{{sub}}',
  body: '{{body}}',
  index: '{{index}}',
  name: '{{name}}',
  frac: '{{frac}}',
  unit: '{{unit}}',
  ordinal: '{{ordinal}}',
  op: '{{op}}',
  from: '{{from}}',
  to: '{{to}}',
  top: '{{top}}',
  bottom: '{{bottom}}',
  entries: '{{entries}}',
  rows: '{{rows}}',
  label: '{{label}}',
  letter: '{{letter}}',
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
    unit_area: raw('unit_area'),
    unit_volume: raw('unit_volume'),
    units: Object.fromEntries(
      UNIT_SYMBOLS.map((sym) => [
        sym,
        {
          one: t(`spoken.units.${sym}.one`),
          many: t(`spoken.units.${sym}.many`),
          compound: t(`spoken.units.${sym}.compound`),
        },
      ]),
    ),
    sub: raw('sub'),
    sqrt: raw('sqrt'),
    root: raw('root'),
    root_named: raw('root_named'),
    root_ordinals: Object.fromEntries(
      ROOT_ORDINALS.map((n) => [String(n), t(`spoken.root_ordinals.${n}`)]),
    ),
    cbrt: raw('cbrt'),
    decimal: t('spoken.decimal'),
    period: raw('period'),
    segment: raw('segment'),
    vector: raw('vector'),
    blank: t('blank.label'),
    symbols,
    operators: {
      sum: t('spoken.operators.sum'),
      prod: t('spoken.operators.prod'),
      int: t('spoken.operators.int'),
      lim: t('spoken.operators.lim'),
    },
    op_range: raw('op_range'),
    op_lower: raw('op_lower'),
    op_upper: raw('op_upper'),
    binom: raw('binom'),
    column_vector: raw('column_vector'),
    matrix: raw('matrix'),
    arrow_label: raw('arrow_label'),
    allele_upper: raw('allele_upper'),
    allele_lower: raw('allele_lower'),
  };
}
