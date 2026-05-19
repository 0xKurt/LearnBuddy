import { describe, it, expect } from 'vitest';

import { countTrailingSkipsOnItem, isNonAnswer } from '../give-up.js';

const t = (
  role: 'tutor' | 'learner',
  item_id: string,
  verdict: 'correct' | 'incorrect' | 'partially_correct' | 'skipped' | null,
) => ({ role, item_id, verdict });

describe('isNonAnswer', () => {
  it('flags multilingual give-ups / help-requests / non-answers', () => {
    for (const s of [
      '',
      '   ',
      '?',
      '...',
      'weiß nicht',
      'Weiss nicht',
      'weiss nicht aber', // bare "weiss nicht" leading the message
      'weiss nicht so genau', // leading + tail
      'weiss es nicht wirklich', // leading "weiss es nicht"
      'ich weiß es nicht',
      'keine Ahnung',
      'kA',
      'idk',
      "I don't know",
      'no idea',
      'not sure',
      'no sé',
      'ni idea',
      'je ne sais pas',
      'aucune idée',
      'non lo so',
      'boh',
      'hilf mir',
      'help me',
      'skip',
      'weiter',
    ]) {
      expect(isNonAnswer(s), `expected give-up: ${JSON.stringify(s)}`).toBe(true);
    }
  });

  it('does NOT flag genuine answers', () => {
    for (const s of [
      '4',
      'On-Chain-Attestierungen',
      'Die Hauptstadt ist Berlin',
      'x = 5',
      'weil die Zellmembran selektiv permeabel ist',
      'photosynthesis',
      'la cellule',
      // "weiss" (white) in a real descriptive answer — must NOT fire
      'Es ist weiss, nicht rot',
      'Die Farbe ist weiss, nicht blau',
      // "weiss" as a verb in a subordinate clause
      'Ich weiss, dass H2O Wasser ist',
      // "nicht" without "weiss"
      'Das ist nicht richtig, weil die Formel x=5 lautet',
    ]) {
      expect(isNonAnswer(s), `expected real answer: ${JSON.stringify(s)}`).toBe(false);
    }
  });
});

describe('countTrailingSkipsOnItem', () => {
  it('returns 0 when there are no tutor turns on the item', () => {
    expect(countTrailingSkipsOnItem([], 'i1')).toBe(0);
    expect(countTrailingSkipsOnItem([t('tutor', 'i2', 'skipped')], 'i1')).toBe(0);
  });

  it('returns 0 when the most recent tutor turn was not skipped', () => {
    const turns = [
      t('tutor', 'i1', 'skipped'),
      t('tutor', 'i1', 'skipped'),
      t('tutor', 'i1', 'incorrect'),
    ];
    expect(countTrailingSkipsOnItem(turns, 'i1')).toBe(0);
  });

  it('counts a single trailing skip', () => {
    const turns = [t('tutor', 'i1', 'incorrect'), t('tutor', 'i1', 'skipped')];
    expect(countTrailingSkipsOnItem(turns, 'i1')).toBe(1);
  });

  it('counts three trailing skips', () => {
    const turns = [
      t('tutor', 'i1', 'incorrect'),
      t('tutor', 'i1', 'skipped'),
      t('tutor', 'i1', 'skipped'),
      t('tutor', 'i1', 'skipped'),
    ];
    expect(countTrailingSkipsOnItem(turns, 'i1')).toBe(3);
  });

  it('ignores skipped turns interrupted by a non-skipped verdict', () => {
    const turns = [
      t('tutor', 'i1', 'skipped'),
      t('tutor', 'i1', 'incorrect'),
      t('tutor', 'i1', 'skipped'),
    ];
    // Only the very last skipped streak counts.
    expect(countTrailingSkipsOnItem(turns, 'i1')).toBe(1);
  });

  it('ignores turns from other items', () => {
    const turns = [
      t('tutor', 'i1', 'skipped'),
      t('tutor', 'i2', 'skipped'),
      t('tutor', 'i2', 'skipped'),
      t('tutor', 'i1', 'skipped'),
    ];
    // i1 has 2 skipped turns total, but only 1 is "trailing" because
    // the i2 turns interleave.
    // Actually i1's filter sequence is [skipped, skipped] — both are
    // trailing (no non-skip in between within i1's filtered view).
    expect(countTrailingSkipsOnItem(turns, 'i1')).toBe(2);
  });

  it('ignores learner turns', () => {
    const turns = [
      t('learner', 'i1', null),
      t('tutor', 'i1', 'skipped'),
      t('learner', 'i1', null),
      t('tutor', 'i1', 'skipped'),
    ];
    expect(countTrailingSkipsOnItem(turns, 'i1')).toBe(2);
  });
});
