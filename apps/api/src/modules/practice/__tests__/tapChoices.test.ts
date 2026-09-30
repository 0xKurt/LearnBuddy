// Tapping a word instead of typing it (issue #147): where it is offered, and where not.

import { describe, expect, it } from 'vitest';

import { TAP_CHOICE_COUNT, tapChoicesFor, type VocabSibling } from '../tapChoices.js';

const words: VocabSibling[] = [
  { id: 'a', answer: 'das Fahrrad', lang: 'de' },
  { id: 'b', answer: 'der Bahnhof', lang: 'de' },
  { id: 'c', answer: 'die Schule', lang: 'de' },
  { id: 'd', answer: 'das Buch', lang: 'de' },
  { id: 'e', answer: 'der Hund', lang: 'de' },
];
const vocab = (id: string, answer: string, lang: string | null = 'de') => ({
  id,
  kind: 'vocab',
  answer,
  lang,
});

describe('words to tap', () => {
  it('offers her own words when she is recognising a foreign one', () => {
    const choices = tapChoicesFor(vocab('a', 'das Fahrrad'), words, 'de');
    expect(choices).toHaveLength(TAP_CHOICE_COUNT);
    expect(choices).toContain('das Fahrrad');
    expect(new Set(choices).size).toBe(TAP_CHOICE_COUNT);
    for (const c of choices!) expect(words.map((w) => w.answer)).toContain(c);
  });

  it('never offers them while she is meant to write the foreign word', () => {
    // The answer is French: this is production, and four words would hand it over.
    const french: VocabSibling[] = words.map((w, i) => ({ ...w, answer: `mot ${i}`, lang: 'fr' }));
    expect(tapChoicesFor(vocab('a', 'le vélo', 'fr'), french, 'de')).toBeNull();
  });

  it('never offers them for anything but vocabulary', () => {
    expect(tapChoicesFor({ ...vocab('a', 'das Fahrrad'), kind: 'short' }, words, 'de')).toBeNull();
  });

  it('stays quiet when there are too few of her own words to choose from', () => {
    expect(tapChoicesFor(vocab('a', 'das Fahrrad'), words.slice(0, 3), 'de')).toBeNull();
  });

  it('never repeats the right answer among the wrong ones', () => {
    const twins: VocabSibling[] = [
      ...words,
      { id: 'f', answer: 'das Fahrrad', lang: 'de' },
      { id: 'g', answer: 'das Rad', lang: 'de' },
    ];
    const choices = tapChoicesFor(vocab('a', 'das Fahrrad'), twins, 'de')!;
    expect(choices.filter((c) => c === 'das Fahrrad')).toHaveLength(1);
  });

  it('shows the same words again when the screen reloads', () => {
    const once = tapChoicesFor(vocab('c', 'die Schule'), words, 'de');
    const twice = tapChoicesFor(vocab('c', 'die Schule'), words, 'de');
    expect(once).toEqual(twice);
  });

  it('does not put the answer in the same place every time', () => {
    const places = new Set(
      words.map((w) => tapChoicesFor(vocab(w.id, w.answer), words, 'de')!.indexOf(w.answer)),
    );
    expect(places.size).toBeGreaterThan(1);
  });
});
