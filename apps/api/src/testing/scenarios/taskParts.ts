// Scripted model answers for tasks in parts (issue #297): one situation, subtasks a), b), c), a
// later part that goes on with an earlier part's result, and an open part („Begründe …") checked
// against key points. Shared by the integration tests (`__tests__/task-parts*.int.test.ts`) and the
// browser walkthrough (tests/web/task-parts.spec.ts). Every formula here gives its part's key from
// the earlier keys, as the server checks (`modules/practice/taskParts.ts`). Test tooling only;
// answers are keyed by the learner's text.
// requires live verification in Claude Code session (stand-ins for the outside world; scripted model)

import { scriptGenerations } from './generations.js';
import { tutorRules } from './rules.js';
import { judgedBy } from './teachBack.js';
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

/**
 * The situation of the ride task, as she reads it above every part. At 360 pt its first line ends
 * at "18" — where "km/h" broke away before issue #467; the shots keep it in view.
 */
export const RIDE_STEM = 'Ein Radfahrer fährt 2,5 Stunden mit 18 km/h.';

/** The open part of the ride task (#297, step 2): her reasoning, not a number. */
export const RIDE_WHY = 'Begründe, warum er mit 15 km/h länger braucht als mit 18 km/h.';

/** Its key points: what a complete answer says, never shown to her; their follow-ups are. */
export const RIDE_POINTS: { name: string; point: string; ask: string; exact: string[] }[] = [
  {
    name: 'Strecke',
    point: 'die Strecke ist bei beiden Fahrten gleich lang',
    ask: 'Was ist bei beiden Fahrten gleich?',
    exact: [],
  },
  {
    name: 'Tempo',
    point: 'langsamer schafft er in jeder Stunde weniger Kilometer',
    ask: 'Wie weit kommt er mit 15 km/h in einer Stunde?',
    exact: [],
  },
];

/**
 * Physics, Klasse 7/8: a distance, the time for it at another speed — and why that takes longer,
 * an open part checked against key points.
 */
export function rideTask() {
  return {
    stem: RIDE_STEM,
    topic: 'Gleichförmige Bewegung',
    difficulty: 2,
    prompt_lang: 'de',
    parts: [
      part('Wie weit fährt er in dieser Zeit?', '45', 'km'),
      part('Wie lange bräuchte er für dieselbe Strecke mit 15 km/h?', '3', 'h', 'a / 15'),
      {
        ...part(RIDE_WHY, 'Strecke gleich, weniger Kilometer pro Stunde', ''),
        kind: 'long',
        unit: null,
        points: RIDE_POINTS,
      },
    ],
  };
}

export function scriptTaskParts(): void {
  scriptGenerations({
    when: /Aufgaben wie in der Klassenarbeit/i,
    answer: () => ({
      usable: true,
      title: 'Handytarif und Radtour',
      subject: { name: 'Mathe', kind: 'math' },
      items: [],
      part_tasks: [tariffTask(), rideTask()],
    }),
  });
  // The open part: a point counts when her words carry it, quoted out of what she typed.
  tutorRules.add(
    judgedBy(/Begründe, warum er mit 15 km\/h länger braucht/, [
      ['r1', /Strecke[^.]*gleich|gleich[^.]*Strecke/i],
      ['r2', /weniger Kilometer/i],
    ]),
  );
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
