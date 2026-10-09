// One optimal-string-alignment distance for both of its callers (issue #311): the near-miss check
// (`editDistance`, evaluate.ts) and the Diktat's place of the first mistake (`checkDictation`,
// dictation.ts). Each had its own copy of the table until #311. The expectations below were read
// off those two copies before they were merged (main @ 3431bf1); the shared one must give exactly
// the same — a distance per pair, and the same spot per Diktat answer.

import { describe, expect, it } from 'vitest';

import { checkDictation, type DictationCheck } from '../dictation.js';
import { editDistance } from '../osa.js';

const DISTANCES: [string, string, number][] = [
  ['', '', 0],
  ['', 'abc', 3],
  ['abc', '', 3],
  ['garden', 'gardn', 1],
  ['garden', 'gadren', 1],
  ['kitchen', 'kitchen', 0],
  ['ab', 'ba', 1],
  // Optimal string alignment, not Damerau: a swapped pair is never edited again.
  ['abc', 'ca', 3],
  ['ca', 'abc', 3],
  ['abcd', 'badc', 2],
  ['Schlafzimmer', 'Schlafzimer', 1],
  ['bedroom', 'bedrm', 2],
  ['Straße', 'Strasse', 2],
  ['kitten', 'sitting', 3],
  ['flaw', 'lawn', 2],
  ['aaaa', 'aa', 2],
  ['abab', 'baba', 2],
  // UTF-16 code units, as before: an emoji is two of them.
  ['😀a', 'a😀', 2],
];

const miss = (spot: Exclude<DictationCheck, { correct: true }>['spot']): DictationCheck => ({
  correct: false,
  spot,
});

const SPOTS: [string, string, DictationCheck][] = [
  ['Schwimmen', 'Schwimen', miss({ kind: 'double_missing', word: 'Schwimen', letter: 'm' })],
  ['Schwimmen', 'Schwimmmen', miss({ kind: 'double_extra', word: 'Schwimmmen', letter: 'm' })],
  ['Hund', 'hund', miss({ kind: 'capital', word: 'hund' })],
  ['hund', 'Hund', miss({ kind: 'lower', word: 'Hund' })],
  ['Biene', 'Bine', miss({ kind: 'ie_missing', word: 'Bine' })],
  ['Igel', 'Iegel', miss({ kind: 'ie_extra', word: 'Iegel' })],
  ['dass', 'das', miss({ kind: 'double_missing', word: 'das', letter: 's' })],
  ['das', 'dass', miss({ kind: 'double_extra', word: 'dass', letter: 's' })],
  ['Straße', 'Strasse', miss({ kind: 'sz_needed', word: 'Strasse' })],
  ['Strasse', 'Straße', miss({ kind: 'ss_needed', word: 'Straße' })],
  ['Fluss', 'Fluß', miss({ kind: 'ss_needed', word: 'Fluß' })],
  ['Haus', 'Huas', miss({ kind: 'swapped', word: 'Huas' })],
  ['Garten', 'Gartn', miss({ kind: 'letter_missing', word: 'Gartn', before: 'Gart' })],
  ['Garten', 'Garrten', miss({ kind: 'double_extra', word: 'Garrten', letter: 'r' })],
  ['Garten', 'Garden', miss({ kind: 'letter_wrong', word: 'Garden', letter: 'd', n: 4 })],
  ['Garten', 'Gurken', miss({ kind: 'letter_wrong', word: 'Gurken', letter: 'u', n: 2 })],
  ['Elefant', 'Xylophon', miss({ kind: 'word_wrong', word: 'Xylophon' })],
  ['Fahrrad', 'Fahr rad', miss({ kind: 'together', first: 'Fahr', second: 'rad' })],
  ['zu Hause', 'zuhause', miss({ kind: 'word_missing', before: '' })],
  ['Der Hund bellt.', 'Der Hund bellt', miss({ kind: 'punctuation', word: 'bellt' })],
  ['Der Hund bellt.', 'Der bellt.', miss({ kind: 'word_missing', before: 'Der' })],
  ['Der Hund bellt.', 'Der große Hund bellt.', miss({ kind: 'word_extra', word: 'große' })],
  [
    'Der Hund bellt laut.',
    'Der Hunt bellt laut.',
    miss({ kind: 'letter_wrong', word: 'Hunt', letter: 't', n: 4 }),
  ],
  [
    'Der Hund bellt laut.',
    'Der Hund belt laut',
    miss({ kind: 'double_missing', word: 'belt', letter: 'l' }),
  ],
  ['Wir gehen nach Hause.', 'Wir gehen nach hause.', miss({ kind: 'capital', word: 'hause' })],
  [
    'Ich weiß, dass du kommst.',
    'Ich weiss das du kommst.',
    miss({ kind: 'sz_needed', word: 'weiss' }),
  ],
  ['Sie spielt im Garten.', 'Sie spielt im Gartne.', miss({ kind: 'swapped', word: 'Gartne' })],
  ['Sie spielt im Garten.', 'Sie im spielt Garten.', miss({ kind: 'word_wrong', word: 'im' })],
  ['Komm her!', 'Komm her?', miss({ kind: 'punctuation', word: 'her?' })],
  ['Mama und Papa', 'Mama Papa und', miss({ kind: 'word_wrong', word: 'Papa' })],
];

describe('one optimal-string-alignment distance (#311)', () => {
  it.each(DISTANCES)('editDistance(%j, %j) is %i, as before', (a, b, d) => {
    expect(editDistance(a, b)).toBe(d);
  });

  it.each(SPOTS)('the Diktat %j typed as %j names the same place as before', (key, typed, r) => {
    expect(checkDictation(key, typed)).toEqual(r);
  });
});
