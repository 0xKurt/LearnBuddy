// Scripted model answers for the browser shots of help at a question (issue #388,
// tests/web/help.spec.ts): „Tipp" standing out after two misses, a similar task after the shown
// solution, „Warum stimmt das?" with its three reasons, and a Probetest whose fixed line fits a
// tap form and whose review explains. Her own sentences ("Malnehmen"), which no other spec types,
// so no rule of another scenario answers them and these answer nothing else (issue #350).
// Test tooling only; answers are keyed by the learner's text.
// requires live verification in Claude Code session (stand-ins for the outside world; scripted model)

import { scriptGenerations } from './generations.js';
import { base } from './learning-modes.js';
import { hintRules, tutorRules } from './rules.js';
import { quoteFrom, says, scriptTurns } from './turns.js';

/** The question she misses three times: four options, so two misses still leave a real choice. */
const ROWS = 'Welche Rechnung passt zu 3 Reihen mit je 4 Punkten?';

const malnehmen = (prompt: string, choices: string[], correct: number, topic = 'Malnehmen') => ({
  ...base,
  kind: 'multiple_choice',
  prompt,
  answer: choices[correct]!,
  choices,
  correct_choice: correct,
  topic,
});

export function scriptHelp(): void {
  scriptTurns(
    {
      when: /malnehmen üben/i,
      answer: says('Gern – hier sind ein paar Aufgaben zum Malnehmen.', [
        { tool: 'offer_learning', args: { kind: 'practice', text: 'Malnehmen' } },
      ]),
    },
    {
      // The same once more, as a new run (the walkthrough walks it again in the dark).
      when: /malnehmen wiederholen/i,
      answer: says('Gern – noch eine Runde Malnehmen.', [
        { tool: 'offer_learning', args: { kind: 'practice', text: 'Malnehmen wiederholen' } },
      ]),
    },
    {
      // She asks for it herself: her words go along, so code lets the test be offered (#388).
      when: /probetest zum malnehmen/i,
      answer: (req) =>
        says('Klar – ein Probetest zum Malnehmen.', [
          {
            tool: 'offer_learning',
            args: { kind: 'test', text: 'Malnehmen', asked: quoteFrom(req, 'Probetest') },
          },
        ])(req),
    },
  );
  scriptGenerations({
    when: /Malnehmen/i,
    answer: () => ({
      usable: true,
      title: 'Malnehmen',
      subject: { name: 'Mathe', kind: 'math' },
      items: [
        malnehmen(ROWS, ['3 + 4', '3 · 4', '4 − 3', '4 + 4'], 1),
        // Another topic in between: after the shown solution the similar task comes first.
        malnehmen('Was ist 7 + 5?', ['11', '12', '13'], 1, 'Plus'),
        malnehmen('Welche Rechnung passt zu 5 Reihen mit je 2 Punkten?', ['5 · 2', '5 + 2'], 0),
      ],
    }),
  });
  // Prepared with the questions, in the background (hints.ts): two hints and the reasons for
  // „Warum stimmt das?" — the true one in the middle, none of them stating the key.
  hintRules.add({
    when: new RegExp(ROWS.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
    answer: () => ({
      items: [
        {
          n: 1,
          hints: ['Zähl, wie viele Reihen es sind.', 'Jede Reihe hat gleich viele Punkte.'],
          worked_solution:
            'Drei Reihen mit je vier Punkten sind dreimal die Vier – das schreibt man als Malaufgabe.',
          why: {
            reasons: [
              'Weil man die beiden Zahlen einfach zusammenzählt.',
              'Weil gleich große Reihen ein Vielfaches derselben Anzahl sind.',
              'Weil die kleinere Zahl immer vorne steht.',
            ],
            correct: 1,
          },
        },
      ],
    }),
  });
  // Her second miss goes to the tutor (#156): a hint-free nudge, so „Tipp" still stands out.
  tutorRules.add({
    when: new RegExp(ROWS.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
    answer: () => ({
      intent: 'answer',
      verdict: 'incorrect',
      reply: 'Noch nicht. Schau dir die Punkte genau an.',
      gave_hint: false,
      revealed_answer: false,
    }),
  });
}
