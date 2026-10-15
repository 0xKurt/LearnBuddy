// A German noun key and its article (issue #759): the right noun without its article (right, as
// #146 decided) or with another one (partly right) is decided by code — read off the key's own
// spelling, never off a list of articles (CLAUDE.md rules 1 and 3). docs/architecture.md
// §Practice (grading).

import { describe, expect, it } from 'vitest';

import { ruleCheck, type ItemForCheck } from '../evaluate.js';

const vocab = (answer: string, lang: string | null, accepted: string[] = []): ItemForCheck => ({
  kind: 'vocab',
  answer,
  accepted_answers: accepted,
  unit: null,
  choices: null,
  correct_choice: null,
  tolerance: null,
  spelling: null,
  subject_kind: null,
  lang,
});
const check = (answer: string, text: string, lang: string | null = 'de', accepted?: string[]) =>
  ruleCheck(vocab(answer, lang, accepted), { text, choice: null });

describe('a German noun and its article (#759)', () => {
  it('knows the right noun without its article: right, as #146 decided', () => {
    expect(check('die Küche', 'küche')).toBe('no_article');
    expect(check('die Küche', 'Küche')).toBe('no_article');
  });

  it('knows the right noun with another article: the wrong gender, partly right', () => {
    expect(check('die Küche', 'der Küche')).toBe('other_article');
    expect(check('das Fahrrad', 'die Fahrrad')).toBe('other_article');
  });

  it('leaves the right answer right and another word open', () => {
    expect(check('die Küche', 'die Küche')).toBe('correct');
    expect(check('die Küche', 'Küche', 'de', ['Küche'])).toBe('correct');
    expect(check('die Küche', 'Kuchen')).toBe('unknown');
  });

  it('reads the article off the key only where its spelling shows it', () => {
    // A verb phrase: the dropped word stands before no lone noun — still just a missing word.
    expect(check('zur Schule gehen', 'Schule gehen')).toBe('missing_word');
    expect(check('sich freuen', 'freuen')).toBe('missing_word');
    // French, Spanish, Italian keys carry no such sign: the tutor tells the article (#146).
    expect(check('le vélo', 'vélo', 'fr')).toBe('missing_word');
    expect(check('la cocina', 'cocina', 'es')).toBe('missing_word');
    expect(check('la cucina', 'cucina', 'it')).toBe('missing_word');
    // Without a language the key's spelling proves nothing.
    expect(check('der Schüler', 'Schüler', null)).toBe('missing_word');
  });
});
