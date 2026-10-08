// Scripted model answers for tasks in parts (issue #297): one situation, subtasks a), b), c), and
// a later part that goes on with an earlier part's result. Shared by the integration test
// (`__tests__/task-parts.int.test.ts`) and the browser walkthrough (tests/web/task-parts.spec.ts).
// Every formula here gives its part's key from the earlier keys, as the server checks
// (`modules/practice/taskParts.ts`). Test tooling only; answers are keyed by the learner's text.
// requires live verification in Claude Code session (stand-ins for the outside world; scripted model)

import { scriptGenerations } from './generations.js';
import { says, scriptTurns } from './turns.js';

/** The situation of the tariff task, as she reads it above every part. */
export const TARIFF_STEM =
  'Ein Handytarif kostet 12 € Grundgebühr im Monat und 0,15 € für jede Gesprächsminute. Lena telefoniert im Mai 80 Minuten.';

function part(prompt: string, answer: string, unit: string, from: string | null = null) {
  return {
    kind: 'numeric',
    prompt,
    answer,
    accepted_answers: [],
    unit,
    choices: null,
    correct_choice: null,
    tolerance: null,
    from,
  };
}

/** Maths, Klasse 8: a linear tariff in three steps, the last two building on the one before. */
export function tariffTask(bFrom = 'a + 12') {
  return {
    stem: TARIFF_STEM,
    topic: 'Lineare Funktionen',
    difficulty: 3,
    prompt_lang: 'de',
    parts: [
      part('Wie viel kosten Lenas Gesprächsminuten im Mai, ohne Grundgebühr?', '12', '€'),
      part('Wie hoch ist ihre Rechnung im Mai insgesamt?', '24', '€', bFrom),
      part('Was kostet eine Minute im Mai im Durchschnitt, mit Grundgebühr?', '0.3', '€', 'b / 80'),
    ],
  };
}

/** Physics, Klasse 7/8: a distance, and the time for it at another speed. */
const RIDE_TASK = {
  stem: 'Ein Radfahrer fährt 2,5 Stunden lang mit gleichbleibend 18 km/h.',
  topic: 'Gleichförmige Bewegung',
  difficulty: 2,
  prompt_lang: 'de',
  parts: [
    part('Wie weit fährt er in dieser Zeit?', '45', 'km'),
    part('Wie lange bräuchte er für dieselbe Strecke mit 15 km/h?', '3', 'h', 'a / 15'),
  ],
};

export function scriptTaskParts(): void {
  scriptGenerations({
    when: /Aufgaben wie in der Klassenarbeit/i,
    answer: () => ({
      usable: true,
      title: 'Handytarif und Radtour',
      subject: { name: 'Mathe', kind: 'math' },
      items: [],
      part_tasks: [tariffTask(), RIDE_TASK],
    }),
  });
  scriptTurns({
    when: /aufgaben mit teilaufgaben/i,
    answer: says('Gern – zwei Aufgaben wie in der Klassenarbeit, Schritt für Schritt.', [
      {
        tool: 'offer_learning',
        args: { kind: 'practice', text: 'Aufgaben wie in der Klassenarbeit' },
      },
    ]),
  });
}
