// Which answers the distress check reads (#747, review of #764): an answer code found right skips it
// only when every word of hers is already the task's own — never "one free word beyond the key".

import { describe, expect, it } from 'vitest';

import type { AnswerCase } from '../answerJudge.js';
import { ownWords } from '../answerSafeguard.js';

/** The fields `ownWords` reads, around one item; the rest of an answer is not its business. */
function answerCase(over: {
  text: string;
  rule?: string;
  answer?: string;
  prompt?: string;
  codeTask?: unknown;
  codeCheck?: unknown;
  via?: 'typed' | 'tapped';
}): AnswerCase {
  return {
    input: { text: over.text, via: over.via },
    text: over.text,
    rule: over.rule ?? 'correct',
    hintRequest: false,
    question: false,
    item: {
      kind: 'short',
      prompt: over.prompt ?? 'Was ist 1 + 1?',
      answer: over.answer ?? '2',
      accepted_answers: [],
      unit: null,
      choices: null,
      correct_choice: null,
    },
    structured: null,
    codeTask: over.codeTask ?? null,
    codeCheck: over.codeCheck ?? null,
    staffTask: null,
  } as unknown as AnswerCase;
}

describe('ownWords: what the distress check reads', () => {
  it.each(['2 hilfe', '2 Angst', '4 sterben'])(
    'reads a word beyond a numeric key, even when code called it right (%s)',
    (text) => {
      expect(ownWords(answerCase({ text }))).toBe(text);
    },
  );

  it('reads a word beyond a key in words', () => {
    const c = answerCase({ text: 'der Hund hilfe', answer: 'der Hund', prompt: 'Wer bellt?' });
    expect(ownWords(c)).toBe('der Hund hilfe');
  });

  it('reads the comment of a program code ran and found right', () => {
    const program = 'def verdoppeln(zahl):\n    # mein vater schlägt mich\n    return zahl + zahl';
    const c = answerCase({
      text: program,
      prompt: 'Schreibe verdoppeln(zahl).',
      answer: 'def verdoppeln(zahl):\n    return zahl * 2',
      codeTask: { task: 'write_function', name: 'verdoppeln' },
      codeCheck: { verdict: 'correct' },
    });
    expect(ownWords(c)).toBe(program);
  });

  it('skips the key itself, its words from the question, a number, a tap', () => {
    expect(ownWords(answerCase({ text: 'Paris', answer: 'Paris' }))).toBeNull();
    expect(
      ownWords(
        answerCase({
          text: 'Die Hauptstadt ist Paris',
          answer: 'Paris',
          prompt: 'Was ist die Hauptstadt von Frankreich?',
        }),
      ),
    ).toBeNull();
    expect(ownWords(answerCase({ text: '2' }))).toBeNull();
    expect(ownWords(answerCase({ text: '2x = 8', rule: 'incorrect' }))).toBeNull();
    expect(ownWords(answerCase({ text: 'Rom', rule: 'incorrect', via: 'tapped' }))).toBeNull();
  });

  it('reads every wrong answer in words', () => {
    expect(ownWords(answerCase({ text: 'Lyon', rule: 'incorrect', answer: 'Paris' }))).toBe('Lyon');
  });
});
