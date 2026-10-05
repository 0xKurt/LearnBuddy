// Scripted tutor answers for her questions in practice (tests/web/modes.spec.ts, issue #402):
// one question about the task under tap options (the pie chart), one that has nothing to do with
// the task on a board (the order) — the tutor steers back and the app offers „Merk ich mir für
// nachher" — and one in the Probetest, whose reply the server replaces by the test's fixed line
// (the tutor call there only looks for distress). Keyed by her own words, which no other spec types, so no rule of another scenario
// answers them and these answer nothing else (issue #350).
// Test tooling only.
// requires live verification in Claude Code session (stand-ins for the outside world; scripted model)

import { tutorRules } from './rules.js';

/** Her questions about the pie chart, beside the order and in the Probetest (all typed by modes.spec). */
const ASK_ABOUT_TASK = 'Was bedeutet der Strich im Bruch?';
const ASK_OFF_TOPIC = 'Hast du eigentlich ein Haustier?';
const ASK_IN_TEST = 'War Augustus nicht ein Monat?';

const escaped = (s: string) => new RegExp(s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));

export function scriptAsk(): void {
  tutorRules.add(
    {
      when: escaped(ASK_ABOUT_TASK),
      answer: () => ({
        intent: 'question',
        verdict: 'not_an_attempt',
        reply:
          'Der Strich heißt Bruchstrich: oben steht, wie viele Teile gefärbt sind, unten, in wie viele Teile das Ganze geteilt ist.',
        gave_hint: false,
        revealed_answer: false,
      }),
    },
    {
      when: escaped(ASK_OFF_TOPIC),
      answer: () => ({
        intent: 'off_topic',
        verdict: 'not_an_attempt',
        reply: 'Erzähl ich dir nach dem Üben – erst die Reihenfolge!',
        gave_hint: false,
        revealed_answer: false,
      }),
    },
    {
      when: escaped(ASK_IN_TEST),
      // Never shown: a test answers every question with its fixed line.
      answer: () => ({
        intent: 'question',
        verdict: 'not_an_attempt',
        reply: 'Ja, der August ist nach ihm benannt.',
        gave_hint: false,
        revealed_answer: false,
      }),
    },
  );
}
