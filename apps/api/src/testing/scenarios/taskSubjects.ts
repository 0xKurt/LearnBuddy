// Tasks in parts beyond maths (issue #297, Schnitt 4): chemistry, history and German as a class test
// from grade 9/10 asks them, and a material that is a table or a chart. Scripted model answers for
// the integration tests (`__tests__/task-parts-subjects.int.test.ts`); every formula gives its
// part's key from the earlier keys, and every reading off a chart is what the chart says, as the
// server checks (`modules/practice/taskParts.ts`). Test tooling only.
// requires live verification in Claude Code session (stand-ins for the outside world; scripted model)

type KeyPoint = { name: string; point: string; ask: string; exact: string[] };

/** A part as the generator writes it: a form, its key, and how it follows from earlier parts. */
function part(
  kind: 'numeric' | 'short' | 'multiple_choice' | 'long',
  prompt: string,
  answer: string,
  more: {
    unit?: string | null;
    from?: string | null;
    choices?: string[];
    correct?: number;
    points?: KeyPoint[];
    read?: { q: string; s: number; i: number; j: number };
  } = {},
) {
  return {
    kind,
    prompt,
    answer,
    accepted_answers: [],
    unit: more.unit ?? null,
    choices: more.choices ?? null,
    correct_choice: more.correct ?? null,
    tolerance: null,
    from: more.from ?? null,
    points: more.points ?? [],
    ...(more.read ? { read: more.read } : {}),
  };
}

const point = (name: string, statement: string, ask: string): KeyPoint => ({
  name,
  point: statement,
  ask,
  exact: [],
});

/** Chemistry, Klasse 9: a reaction, its amounts in two steps — and why the mass stays. */
export const BURN_STEM =
  'Wasserstoff verbrennt mit Sauerstoff zu Wasser: 2 H2 + O2 → 2 H2O. Im Versuch entstehen 36 g Wasser. Die molare Masse von Wasser beträgt 18 g/mol, die von Sauerstoff 32 g/mol.';

const BURN_WHY = 'Erkläre, warum die Masse der Stoffe bei der Reaktion insgesamt gleich bleibt.';

export function burnTask() {
  return {
    stem: BURN_STEM,
    topic: 'Stöchiometrie',
    difficulty: 4,
    prompt_lang: 'de',
    parts: [
      part('numeric', 'Welche Stoffmenge Wasser entsteht?', '2', { unit: 'mol' }),
      part('numeric', 'Welche Stoffmenge Sauerstoff reagiert dabei?', '1', {
        unit: 'mol',
        from: 'a / 2',
      }),
      part('numeric', 'Welche Masse Sauerstoff reagiert?', '32', { unit: 'g', from: 'b * 32' }),
      part('long', BURN_WHY, 'Atome bleiben erhalten, sie ordnen sich nur neu', {
        points: [
          point(
            'Atome',
            'die Atome bleiben bei der Reaktion erhalten',
            'Was passiert mit den Atomen der Ausgangsstoffe?',
          ),
          point(
            'Umordnung',
            'die Atome werden nur neu zu anderen Teilchen verbunden',
            'Wie entstehen dann die neuen Teilchen?',
          ),
        ],
      }),
    ],
  };
}

/**
 * History, Klasse 10: a source longer than a situation (Weimarer Reichsverfassung, 1919, Art. 48
 * Abs. 2 — public domain), read from a photographed sheet.
 */
export const SOURCE_STEM =
  'Weimarer Reichsverfassung vom 11. August 1919, Artikel 48, Absatz 2:\n„Der Reichspräsident kann, wenn im Deutschen Reiche die öffentliche Sicherheit und Ordnung erheblich gestört oder gefährdet wird, die zur Wiederherstellung der öffentlichen Sicherheit und Ordnung nötigen Maßnahmen treffen, erforderlichenfalls mit Hilfe der bewaffneten Macht einschreiten. Zu diesem Zwecke darf er vorübergehend die in den Artikeln 114, 115, 117, 118, 123, 124 und 153 festgesetzten Grundrechte ganz oder zum Teil außer Kraft setzen.“';

export const SOURCE_WHO = 'Wer darf nach diesem Artikel Grundrechte außer Kraft setzen?';
const SOURCE_WHY = 'Beurteile, welche Gefahr dieser Artikel für die Demokratie barg.';

/** The source task as the reading reports it: a) a choice, b) open, with the printed letters. */
export function sourceTask() {
  const help = { hints: ['Lies den Artikel noch einmal Satz für Satz.'], worked_solution: null };
  return {
    stem: SOURCE_STEM,
    topic: 'Weimarer Republik',
    difficulty: 4,
    prompt_lang: 'de',
    parts: [
      {
        ...part('multiple_choice', SOURCE_WHO, 'der Reichspräsident', {
          choices: ['der Reichstag', 'der Reichspräsident', 'der Reichskanzler'],
          correct: 1,
        }),
        letter: 'a',
        ...help,
      },
      {
        ...part('long', SOURCE_WHY, 'am Parlament vorbei regieren, Grundrechte aushebeln', {
          points: [
            point(
              'Parlament',
              'der Präsident konnte ohne den Reichstag regieren',
              'Wer musste den Maßnahmen nicht zustimmen?',
            ),
            point(
              'Missbrauch',
              'eine Notlage konnte zum Vorwand für eine Diktatur werden',
              'Was konnte geschehen, wenn ein Präsident die Notlage nur behauptete?',
            ),
          ],
        }),
        letter: 'b',
        ...help,
      },
    ],
  };
}

/** German, Klasse 9: a short text written for her level, then a choice and an open part. */
export const STORY_STEM = [
  'Mara steht vor dem Klassenzimmer und hält ihr Referat in der Hand. Seit Tagen hat sie geübt,',
  'doch jetzt zittern ihre Finger. Durch die Tür hört sie das Lachen der anderen. Sie denkt an',
  'ihre Großmutter, die immer sagt, Mut heiße nicht, keine Angst zu haben. Mara atmet tief ein,',
  'drückt die Klinke herunter und geht nach vorn. Als sie den ersten Satz sagt, wird es still.',
  'Am Ende klatscht sogar Jonas, der sonst über alles lacht.',
].join(' ');

const STORY_WHY = 'Deute, was der Satz der Großmutter für Mara bedeutet.';

export function storyTask() {
  return {
    stem: STORY_STEM,
    topic: 'Kurzgeschichte deuten',
    difficulty: 3,
    prompt_lang: 'de',
    parts: [
      part('multiple_choice', 'Wie fühlt sich Mara vor der Tür?', 'aufgeregt', {
        choices: ['gelangweilt', 'aufgeregt', 'wütend'],
        correct: 1,
      }),
      part('long', STORY_WHY, 'Mut trotz Angst', {
        points: [
          point('Angst', 'Mara darf Angst haben', 'Muss Mara ihre Angst erst loswerden?'),
          point(
            'Handeln',
            'mutig ist, wer trotz der Angst handelt',
            'Was macht Mara, obwohl ihre Finger zittern?',
          ),
        ],
      }),
    ],
  };
}

/** Physics, Klasse 8: measured values in a table as the material, the speed computed from them. */
export const CART_STEM =
  'Ein Spielzeugwagen fährt gleichmäßig. Die Tabelle zeigt, wie weit er nach jeder Sekunde gekommen ist.';

export const CART_TABLE = {
  type: 'table',
  header: ['Zeit in s', 'Weg in m'],
  rows: [
    ['0', '0'],
    ['1', '2'],
    ['2', '4'],
    ['3', '6'],
  ],
};

export function cartTask(table: unknown = CART_TABLE) {
  return {
    stem: CART_STEM,
    figure: table,
    topic: 'Gleichförmige Bewegung',
    difficulty: 2,
    prompt_lang: 'de',
    parts: [
      part('numeric', 'Wie weit ist der Wagen nach 3 s gefahren?', '6', { unit: 'm' }),
      part('numeric', 'Mit welcher Geschwindigkeit fährt er?', '2', { unit: 'm/s', from: 'a / 3' }),
      part('numeric', 'Wie weit käme er in 10 s?', '20', { unit: 'm', from: 'b * 10' }),
    ],
  };
}

/** Geography, Klasse 7: a city's growth as a line chart, a value read off it — checked by code. */
const CITY_STEM = 'Das Diagramm zeigt, wie viele Menschen in einer Stadt gelebt haben.';

export function cityTask(readKey = '3.7') {
  return {
    stem: CITY_STEM,
    figure: {
      type: 'line_chart',
      x: ['2000', '2010', '2020'],
      xt: 'Jahr',
      s: [{ n: 'Einwohner', u: 'Mio.', v: [3.4, 3.5, 3.7], bar: false, r: false }],
    },
    topic: 'Stadtentwicklung',
    difficulty: 2,
    prompt_lang: 'de',
    parts: [
      part('numeric', 'Wie viele Menschen lebten 2020 in der Stadt?', readKey, {
        unit: 'Mio.',
        read: { q: 'value', s: 0, i: 2, j: 0 },
      }),
      part('long', 'Beschreibe, wie sich die Zahl der Einwohner entwickelt hat.', 'wächst', {
        points: [
          point('Richtung', 'die Zahl der Einwohner wächst', 'Wird die Stadt größer oder kleiner?'),
          point(
            'Tempo',
            'nach 2010 wächst sie schneller als davor',
            'Wann kamen mehr Menschen dazu, vor oder nach 2010?',
          ),
        ],
      }),
    ],
  };
}
