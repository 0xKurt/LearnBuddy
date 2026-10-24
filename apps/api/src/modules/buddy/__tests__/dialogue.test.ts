// What the model sees of the conversation (audit H-32, M-49, M-50).

import { describe, expect, it } from 'vitest';

import { turnDialogue } from '../turn.js';

const m = (
  id: string,
  role: 'learner' | 'buddy',
  text: string,
  failure_code: string | null = null,
  recall_block: 'blocked' | 'concern' | null = failure_code === 'blocked' ? 'blocked' : null,
) => ({ id, role, text, status: 'done' as const, failure_code, recall_block });

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
  it('bridges only one linked clarification, never an earlier request or blocked words', () => {
    const wish = m('1', 'learner', '20 Vokabeln testen');
    const question = {
      ...m('2', 'buddy', 'Welche Sprache?'),
      ask: { options: ['Englisch'] },
      reply_to_id: '1',
    };
    const answer = m('3', 'learner', 'Englisch');
    const later = {
      ...m('4', 'buddy', 'Welche Richtung?'),
      ask: { options: ['Beide'] },
      reply_to_id: '3',
    };
    expect(turnDialogue([wish, question, answer], '3', 'de').clarificationWords).toEqual([
      wish.text,
    ]);
    expect(
      turnDialogue([wish, question, answer, later, m('5', 'learner', 'Beide')], '5', 'de')
        .clarificationWords,
    ).toEqual(['Englisch']);
    expect(turnDialogue([wish, question, answer], '3', 'de').learnerWords).toEqual(['Englisch']);
    expect(
      turnDialogue([{ ...wish, recall_block: 'concern' }, question, answer], '3', 'de')
        .clarificationWords,
    ).toEqual([]);
    expect(
      turnDialogue([wish, { ...question, reply_to_id: 'other' }, answer], '3', 'de')
        .clarificationWords,
    ).toEqual([]);
  });
});
