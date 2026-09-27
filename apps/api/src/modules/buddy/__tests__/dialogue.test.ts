// What the model sees of the conversation (audit H-32, M-49, M-50).

import { describe, expect, it } from 'vitest';

import { turnDialogue } from '../turn.js';

const m = (
  id: string,
  role: 'learner' | 'buddy',
  text: string,
  failure_code: string | null = null,
) => ({ id, role, text, status: 'done' as const, failure_code });

describe('turnDialogue', () => {
  it('always ends with her messages, even when a reminder arrived after them (M-50)', () => {
    const { dialogue, learnerWords } = turnDialogue(
      [
        m('1', 'buddy', 'Hi!'),
        m('2', 'learner', 'Hi, bin da'),
        m('3', 'buddy', 'Wie verabredet: Vokabeln.'),
      ],
      '2',
      'de',
    );
    expect(dialogue.map((d) => d.role)).toEqual(['buddy', 'buddy', 'learner']);
    expect(dialogue[dialogue.length - 1]!.text).toBe('Hi, bin da');
    expect(learnerWords).toEqual(['Hi, bin da']);
  });

  it('her quick messages in a row are her words together (M-49)', () => {
    const { learnerWords } = turnDialogue(
      [
        m('1', 'buddy', 'Hi!'),
        m('2', 'learner', 'Mathearbeit am Freitag'),
        m('3', 'learner', 'über Brüche'),
      ],
      '3',
      'de',
    );
    expect(learnerWords).toEqual(['Mathearbeit am Freitag', 'über Brüche']);
  });

  it('a blocked message is replaced by a placeholder and never counts as her words (H-32)', () => {
    const { dialogue, learnerWords } = turnDialogue(
      [m('1', 'learner', 'etwas Blockiertes', 'blocked'), m('2', 'learner', 'Wollen wir üben?')],
      '2',
      'de',
    );
    expect(dialogue.map((d) => d.text).join(' ')).not.toContain('Blockiertes');
    expect(dialogue.map((d) => d.text).join(' ')).toContain('Schutzfilter');
    expect(learnerWords).toEqual(['Wollen wir üben?']);
  });
});
