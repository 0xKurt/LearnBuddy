// Scripted model answers for tasks in parts (issue #297): one situation, subtasks a), b), c), a
// later part that goes on with an earlier part's result, and an open part („Begründe …") checked
// against key points — written by the generator, and read from a photographed worksheet (step 3:
// its own learner, keyed by her age, 9, nobody else's in the walkthrough, #350). Shared by the
// integration tests (`__tests__/task-parts*.int.test.ts`) and the browser walkthrough
// (tests/web/task-parts.spec.ts). Every formula here gives its part's key from the earlier keys, as
// the server checks (`modules/practice/taskParts.ts`). Test tooling only; answers are keyed by the
// learner's text.
// requires live verification in Claude Code session (stand-ins for the outside world; scripted model)

import { scriptChecks } from './checks.js';
import { scriptGenerations } from './generations.js';
import { readingRules, tutorRules } from './rules.js';
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

/** The situation of the ride task, as she reads it above every part. */
export const RIDE_STEM = 'Ein Radfahrer fährt 2,5 Stunden lang mit gleichbleibend 18 km/h.';

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

/** The material of the task on the photographed worksheet, as printed before a). */
export const POOL_STEM =
  'Ein Schwimmbecken fasst 450 m³ Wasser. Am Morgen sind schon 150 m³ im Becken. Eine Pumpe füllt pro Stunde 25 m³ nach.';

/** The open subtask of the sheet's task: her reasoning, checked against key points. */
export const POOL_WHY = 'Begründe, warum zwei gleich starke Pumpen nur halb so lange brauchen.';

/** Its key points: never on screen; their follow-ups are. */
const POOL_POINTS = [
  {
    name: 'Menge',
    point: 'die fehlende Wassermenge bleibt dieselbe',
    ask: 'Was ändert sich an der Wassermenge, die noch fehlt?',
    exact: [],
  },
  {
    name: 'Leistung',
    point: 'zusammen fördern sie in jeder Stunde doppelt so viel Wasser',
    ask: 'Wie viel Wasser schaffen beide zusammen in einer Stunde?',
    exact: [],
  },
];

/** One subtask as the reading writes it: its printed letter, its question, its key and its help. */
function sheetPart(
  letter: string,
  prompt: string,
  answer: string,
  unit: string,
  from: string | null,
) {
  return {
    ...part(prompt, answer, unit, from),
    letter,
    hints: ['Schau, welche Werte im Text stehen.', 'Welche Rechenart passt dazu?'],
    worked_solution: null,
  };
}

/**
 * Aufgabe 2 of a worksheet as the reading reports it: the material, a) and b) computed
 * (b goes on from a), c) open. `letters` and `bFrom` let a test break its structure.
 */
export function poolTask(letters = ['a', 'b', 'c'], bFrom = 'a / 25') {
  return {
    stem: POOL_STEM,
    topic: 'Lineare Zusammenhänge',
    difficulty: 3,
    prompt_lang: 'de',
    parts: [
      sheetPart(
        letters[0]!,
        'Wie viel Wasser fehlt noch, bis das Becken voll ist?',
        '300',
        'm³',
        null,
      ),
      sheetPart(letters[1]!, 'Wie viele Stunden braucht die Pumpe dafür?', '12', 'h', bFrom),
      {
        ...sheetPart(letters[2]!, POOL_WHY, 'Menge gleich, doppelt so viel pro Stunde', '', null),
        kind: 'long',
        unit: null,
        hints: [],
        points: POOL_POINTS,
      },
    ],
  };
}

/** The ordinary question beside the task on the same sheet: a question of its own, as before. */
export const LITRES = {
  kind: 'numeric',
  prompt: 'Wie viele Liter sind 1 m³?',
  answer: '1000',
  accepted_answers: [],
  unit: 'l',
  choices: null,
  correct_choice: null,
  topic: 'Einheiten',
  difficulty: 1,
  prompt_lang: 'de',
  lang: null,
  figure: null,
  source_excerpt: null,
  hints: ['Ein Kubikmeter ist ein Würfel mit 10 dm Kante.'],
};

/** The worksheet as printed, transcribed. */
const POOL_TRANSCRIPT = [
  '# Arbeitsblatt',
  `1. ${LITRES.prompt}`,
  `2. ${POOL_STEM}`,
  'a) Wie viel Wasser fehlt noch, bis das Becken voll ist?',
  'b) Wie viele Stunden braucht die Pumpe dafür?',
  `c) ${POOL_WHY}`,
].join('\n');

/** What the reading of the photographed worksheet answers; `task` is its task in parts. */
export function poolSheet(task: unknown = poolTask()) {
  return {
    is_learning_material: true,
    readable: true,
    pages: [{ page: 1, read: 'all', problem: null }],
    title: 'Arbeitsblatt Schwimmbad',
    subject: { name: 'Mathe', kind: 'math' },
    extracted_text: POOL_TRANSCRIPT,
    items: [LITRES],
    structured: [],
    reading: [],
    part_tasks: [task],
    more_items: false,
  };
}

/** The photographed worksheet with its task in parts (step 3), read and prepared for practice. */
function scriptPhotographedTask(): void {
  readingRules.add({
    when: /LEARNER: 9 years/,
    system: /learner's study material/,
    answer: () => poolSheet(),
  });
  scriptChecks({
    when: /new material is ready: "Arbeitsblatt Schwimmbad"/,
    answer: () => ({
      disposition: 'act',
      reason: 'A worksheet with a task in parts is ready: prepare it.',
      actions: [
        {
          tool: 'prepare_practice',
          args: { goal: null, subject: null, minutes: 10, focus_topics: [] },
        },
      ],
      outreach: null,
    }),
  });
  tutorRules.add(
    judgedBy(/Begründe, warum zwei gleich starke Pumpen/, [
      ['r1', /Menge[^.]*(gleich|dieselbe)|(gleich|dieselbe)[^.]*Menge/i],
      ['r2', /doppelt so viel/i],
    ]),
  );
}

export function scriptTaskParts(): void {
  scriptPhotographedTask();
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
