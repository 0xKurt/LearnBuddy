import { describe, expect, it } from 'vitest';

import { givesAwayHomework, type TutorDecision } from '../tutor.js';

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
