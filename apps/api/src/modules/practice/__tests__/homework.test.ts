import { describe, expect, it } from 'vitest';

import {
  givesAwayHomework,
  homeworkSolved,
  type HomeworkKey,
  type TutorDecision,
} from '../tutor.js';

const reply = (text: string, revealed = false): TutorDecision => ({
  intent: 'no_answer',
  verdict: 'not_an_attempt',
  reply: text,
  gave_hint: true,
  revealed_answer: revealed,
});

describe('givesAwayHomework', () => {
  it('finds the solution in any math notation', () => {
    expect(givesAwayHomework(reply('Das ist $\\frac{7}{8}$.'), '7/8', 'Berechne 3/4 + 1/8')).toBe(
      true,
    );
    expect(givesAwayHomework(reply('Es sind 0,5 Liter.'), '0.5', 'Wie viel Liter?')).toBe(true);
    expect(
      givesAwayHomework(
        reply('Weil Zähler und Nenner mit derselben Zahl multipliziert werden'),
        'Zähler und Nenner mit derselben Zahl multipliziert werden',
        'Warum?',
      ),
    ).toBe(true);
  });

  it('trusts the model when it says it revealed', () => {
    expect(givesAwayHomework(reply('…', true), 'x', 'y')).toBe(true);
  });

  it('allows hints that only repeat numbers from the task', () => {
    expect(
      givesAwayHomework(reply('Schau dir die 12 in der Aufgabe an.'), '12', 'Teile 144 durch 12.'),
    ).toBe(false);
    expect(
      givesAwayHomework(
        reply('Wie viele Achtel sind $\\frac{3}{4}$?'),
        '7/8',
        'Berechne 3/4 + 1/8',
      ),
    ).toBe(false);
  });

  it('catches a short answer as its own word, not inside other numbers', () => {
    expect(givesAwayHomework(reply('Die Antwort ist 42.'), '42', 'Rechne 6·7.')).toBe(true);
    expect(givesAwayHomework(reply('Denk an 420 geteilt durch 10.'), '42', 'Rechne 6·7.')).toBe(
      false,
    );
  });
});

describe('fromLearnerText', () => {
  it('keeps the typed task and drops tasks the model added', async () => {
    const { fromLearnerText } = await import('../generate.js');
    const typed = 'Ein Rechteck ist 7 cm lang und 4 cm breit. Berechne den Flächeninhalt.';
    expect(
      fromLearnerText(
        'Ein Rechteck ist 7 cm lang und 4 cm breit. Welchen Flächeninhalt hat es?',
        typed,
      ),
    ).toBe(true);
    expect(
      fromLearnerText('Wie berechnest du den Flächeninhalt eines Rechtecks, Lena?', typed),
    ).toBe(false);
  });
});

describe('homeworkSolved', () => {
  const task = (answer: string, over: Partial<HomeworkKey> = {}): HomeworkKey => ({
    prompt: 'Berechne $\\frac{2}{3} + \\frac{1}{4}$.',
    answer,
    accepted_answers: [],
    unit: null,
    tolerance: null,
    ...over,
  });

  it('needs the final answer, not a right step', () => {
    expect(homeworkSolved(task('11/12'), 'ok also gleicher nenner 12')).toBe(false);
    expect(homeworkSolved(task('$\\frac{11}{12}$'), '8/12 + 3/12 = 11/12')).toBe(true);
  });

  it('H-10: closes a right answer written in another form than the key', () => {
    const sevenEighths = task('$\\frac{7}{8}$', { prompt: 'Berechne ¾ + ⅛.' });
    expect(homeworkSolved(sevenEighths, '0,875')).toBe(true);
    expect(homeworkSolved(task('$\\frac{3}{4}$', { prompt: 'Kürze 6/8.' }), '0,75')).toBe(true);
    // An accepted answer counts like the key.
    expect(
      homeworkSolved(task('Berlin', { prompt: 'Hauptstadt?', accepted_answers: ['BER'] }), 'BER'),
    ).toBe(true);
    expect(homeworkSolved(task('x = 5', { prompt: 'Löse 2x = 10.' }), '5')).toBe(true);
    expect(homeworkSolved(task('12', { prompt: 'Fläche?', unit: 'cm²' }), '12 cm²')).toBe(true);
    // Another value is not solved.
    expect(homeworkSolved(sevenEighths, '0,8')).toBe(false);
  });

  it('M-28: a list of guesses is no solution', () => {
    const t = task('7/8', { prompt: 'Berechne $\\frac{3}{4} + \\frac{1}{8}$.' });
    expect(homeworkSolved(t, 'Ist es 1/8, 3/8, 5/8 oder 7/8?')).toBe(false);
    // A worked line uses the task's values and the result.
    expect(homeworkSolved(t, '6/8 + 1/8 = 7/8')).toBe(true);
  });
});

describe('givesAwayHomework on the final verdict (H-9, M-28)', () => {
  const reply = (text: string, verdict: TutorDecision['verdict']): TutorDecision => ({
    intent: 'answer',
    verdict,
    reply: text,
    gave_hint: false,
    revealed_answer: false,
  });
  it('checks a demoted reply and every form of the solution', () => {
    expect(
      givesAwayHomework(
        reply('Super – das ergibt 11/12.', 'partially_correct'),
        ['11/12'],
        'Berechne 2/3 + 1/4',
      ),
    ).toBe(true);
    expect(
      givesAwayHomework(
        reply('Genau, 0,875!', 'partially_correct'),
        ['$\\frac{7}{8}$', '0.875'],
        'Berechne 3/4 + 1/8',
      ),
    ).toBe(true);
  });
  it('her own guesses are no licence: only the task exempts a value', () => {
    expect(
      givesAwayHomework(
        reply('Von deinen Vorschlägen stimmt 7/8.', 'incorrect'),
        ['7/8'],
        'Berechne $\\frac{3}{4} + \\frac{1}{8}$.',
      ),
    ).toBe(true);
  });
});
