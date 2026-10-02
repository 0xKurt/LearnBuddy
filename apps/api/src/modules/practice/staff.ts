// Die Notenzeile: Frage, Zeichnung, Schlüssel und Urteil, alles von Code (issue #226).
//
// Das Modell wählt eine von fünf geprüften Aufgaben und ihre Parameter (`StaffTask`,
// `contracts/staff.ts`); alles, was eine Lernende sieht oder woran sie gemessen wird, steht
// hier. Genau wie bei den Bruchbalken (`bars.ts`, issue #162), und aus demselben Grund: ein
// Schlüssel, den jemand anders geschrieben hat als die Zeichnung, kann ihr falsch widersprechen,
// und eine Regelprüfung weist dann eine richtige Antwort mit voller Autorität ab (issue #157).
// Ein Schlüssel, der AUS der Zeichnung gerechnet ist, kann das nicht.
//
// ─────────────── Warum die Lesefragen angetippt werden ───────────────
//
// `name_note`, `name_value`, `interval` und `time_signature` sind `multiple_choice`, und das ist
// eine Entscheidung, nicht eine Abkürzung. Drei Gründe, und jeder einzelne würde reichen:
//
//   1. **So steht es in der Arbeit.** Notenlehre wird mit geschlossenen Antwortmengen geprüft —
//      „7 Intervall-Items aus 12 Möglichkeiten, 7 Akkord-Items aus einem 9er-Vokabular mit
//      vorgegebenen Antwortsymbolen" (`docs/lehrplan-und-uebungsformen.md` §10.2). Antippen ist
//      hier die Form der Aufgabe, nicht der schwächere Ersatz für Produzieren.
//   2. **Kein Modell urteilt und keines antwortet.** Ein angetippter Index ist sicher richtig
//      oder sicher falsch (`ruleCheck`), also kommt nie ein `unknown` heraus, das ans Modell
//      ginge. Das ist nicht bloß billiger: der Tutor SIEHT die gezeichnete Zeile nicht. Ihn über
//      ein Bild schreiben zu lassen, das er nicht hat, wäre genau das unsichere Fremdergebnis,
//      das Regel 5 verbietet. Deshalb hat auch die falsche Antwort hier ihre eigene feste,
//      freundliche Zeile (`staffAgain`) statt den Tutor zu rufen.
//   3. **Fünf Sprachen schreiben Tonnamen verschieden.** Auf Deutsch heißt `B` das **H** und
//      `A#` das **Ais**, auf Französisch **Si** und **La dièse**. Getippt müsste jede Groß- und
//      Kleinschreibung, jede Enharmonik und jede Abkürzung als Äquivalenzklasse gepflegt werden —
//      und jede Lücke darin wäre eine richtige Antwort, die als falsch gilt.
//
// Geschrieben wird dagegen wirklich geschrieben: `write_line` gibt ihr eine leere Notenzeile
// (`ItemView.surface`, `mode: 'notes'`), und `checkStaffLine` vergleicht Tonnamen, Dauern und
// Taktfüllung und nennt **eine** Stelle — nie die Liste aller Fehler, aus demselben Grund, aus
// dem `chemistry.ts` bei mehreren unausgeglichenen Elementen genau eines nennt.
//
// ─────────────── Was die Oktave hier NICHT entscheidet ───────────────
//
// Beim Schreiben vergleicht Code den Tonnamen und die Dauer, nicht die Oktave: die Frage, die
// Code geschrieben hat, nennt Tonnamen („C, E, G als Viertel"), also ist jede Oktave dieses
// Namens die richtige Antwort — dieselbe Lizenz wie `form_free` beim Bruchbalken (issue #162),
// und sie reicht genau so weit wie der Satz, den Code selbst verfasst hat. Damit die Übung
// dadurch nicht leer wird, liegen die Töne einer Schreibaufgabe innerhalb der fünf Linien
// (`WRITE_STEP_MAX`): dort gibt es von den meisten Namen nur einen.

import {
  BARS_MAX,
  StaffTask,
  TEMPO_DEFAULT,
  TIME_SIGNATURES,
  barTicks,
  diatonicOf,
  dottedRestOk,
  intervalBetween,
  onStaff,
  parseStaffLine,
  renderStaffLine,
  staffStep,
  ticksOf,
  type Clef,
  type Figure,
  type Interval,
  type NoteName,
  type NoteValue,
  type Pitch,
  type StaffBars,
  type StaffElement,
  type StaffFigure,
  type StaffWriteSurface,
  type TimeSignature,
} from '@learnbuddy/shared-types/contracts';

import { t, type MessageKey } from '../../i18n/index.js';
import type { ItemDraft } from './items.js';

/**
 * Wie viele Notenfragen in einem vorbereiteten Satz stehen dürfen: acht.
 *
 * Mehr als die drei Bruchbalken, und das ist der Unterschied zwischen einer Beigabe und einem
 * Fach. Ein Balken steht NEBEN Textfragen über Brüche; eine Notenzeile IST die Frage — ohne sie
 * gibt es „Wie heißt diese Note?" gar nicht. Wer „Notennamen üben" sagt, soll eine ganze Übung
 * aus Notenzeilen bekommen und nicht drei davon und fünf Fragen über Musikgeschichte. Acht, weil
 * ein Übungssatz 6–10 Fragen hat (`TASK.practice`), und die Obergrenze bleibt eine Obergrenze:
 * leer ist erlaubt, und wo eine Zeile nur Dekoration wäre, steht keine.
 */
export const MAX_STAFF_ITEMS = 8;

/** How many options a reading question offers — the number a phone shows without scrolling. */
const CHOICES = 4;

/**
 * Die Taktarten, nach denen gefragt werden darf. Vier, und nicht alle sechs: 3/4 und 6/8 füllen
 * einen Takt mit derselben Zahl von Zweiunddreißigsteln, 4/4 und 2/2 ebenso. Welche von zwei
 * gleich langen Taktarten gemeint ist, verrät erst die Balkung — die zeichnet diese Zeile nicht,
 * also gäbe es zwei richtige Antworten, und eine davon würde als falsch gelten. Diese vier haben
 * paarweise verschiedene Taktlängen, und die Ablenker kommen aus derselben Liste.
 */
const TIME_READABLE: readonly TimeSignature[] = ['2/4', '3/4', '4/4', '3/8'];

/**
 * Wie weit ein Ton einer SCHREIBAUFGABE von der mittleren Linie liegen darf: fünf halbe
 * Linienabstände, also innerhalb der fünf Linien und einen Zwischenraum darüber oder darunter,
 * ohne Hilfslinie. Gelesen wird großzügiger (`onStaff`, eine Hilfslinie); geschrieben enger,
 * weil der Tonname die Antwort ist und in diesem Fenster von den meisten Namen nur einer liegt
 * (siehe den Kopf dieser Datei).
 */
const WRITE_STEP_MAX = 5;

/**
 * Was dem Generator über Notenzeilen gesagt wird. Es sagt, was das Modell WÄHLEN darf, und
 * genauso wichtig, was es nicht schreiben soll — es gibt kein Feld dafür, und dieser Satz ist
 * da, damit das Modell es nicht versucht (CLAUDE.md Regel 1). Kategorien und Verbote, nie ein
 * ausgeschriebenes Beispiel (die stehende Regel: ein Satz im Prompt kommt als Lesart ihres
 * eigenen Blattes zurück).
 */
export const STAFF_RULES = `Note lines ("staffs"): a small music staff the learner reads, hears and writes on. You choose only the task and its musical parameters; the app writes the question, draws the staff, offers the options and computes the solution, so never write a question text, an answer, options or a figure for one, and never put a note line in "figure". Use them for note reading in the treble or bass clef, note and rest values, intervals within an octave, time signatures read off the note values, and writing a short line yourself — and only for a learner who has music as a subject. One voice only: no key signature at the start of the line (write an accidental on the note that needs it), no chords, no second part, and nothing that has to be recognised by ear. At most ${MAX_STAFF_ITEMS}, and an empty list wherever a staff would only be decoration. The ordinary questions in "items" are unaffected.`;

/** An item whose every field was computed from `staff_task`; `insertItems` stores both. */
export type StaffItem = Omit<ItemDraft, 'figure'> & {
  figure: Figure | null;
  staff_task: StaffTask;
};

// ─────────────── Worte ───────────────

/** The suffixes `practice.staff.*` really has, so a typo here fails the typecheck. */
type SuffixOf<T> = T extends `practice.staff.${infer S}` ? S : never;
type StaffMessage = SuffixOf<MessageKey>;

function text(
  locale: string,
  suffix: StaffMessage,
  vars: Record<string, string | number> = {},
): string {
  return t(locale, `practice.staff.${suffix}`, vars);
}

/** `C#` → the key `note.Cs`: a sharp cannot be part of a JSON key, so it is spelled out. */
function noteKey(name: NoteName): StaffMessage {
  return `note.${name.replace('#', 's')}` as StaffMessage;
}

/** What a note is called in her language: `B` is "H" in German, "Si" in French. */
export function noteWord(locale: string, name: NoteName): string {
  return text(locale, noteKey(name));
}

/** "Viertelnote" / "Viertelpause", and "punktierte Viertelnote" when it carries a dot. */
export function valueWord(
  locale: string,
  value: NoteValue,
  dotted: boolean,
  rest: boolean,
): string {
  const plain = text(locale, `${rest ? 'value_rest' : 'value_note'}.${value}` as StaffMessage);
  return dotted ? text(locale, rest ? 'dotted_rest' : 'dotted_note', { value: plain }) : plain;
}

/** "reine Quinte" — the quality and the step, in the order the language puts them. */
export function intervalWord(locale: string, interval: Interval): string {
  return text(locale, 'interval_named', {
    quality: text(locale, `quality.${interval.quality}` as StaffMessage),
    interval: text(locale, `interval.i${interval.step}` as StaffMessage),
  });
}

/** "Viervierteltakt" — `4/4` cannot be a JSON key path, so it is written `t4_4`. */
export function timeWord(locale: string, time: TimeSignature): string {
  return text(locale, `time.t${time.replace('/', '_')}` as StaffMessage);
}

/** "Violinschlüssel" / "Bassschlüssel". */
export function clefWord(locale: string, clef: Clef): string {
  return text(locale, `clef.${clef}` as StaffMessage);
}

/** One element in words: "C als Viertelnote", "Viertelpause". */
function elementWord(locale: string, el: StaffElement): string {
  const value = valueWord(locale, el.value, el.dotted, el.el === 'rest');
  return el.el === 'rest'
    ? value
    : text(locale, 'element_note', { name: noteWord(locale, el.pitch.name), value });
}

/**
 * A whole line in words — what the question of a writing task names, and what the solution
 * shows afterwards. Bar lines are deliberately NOT named: where one bar ends follows from the
 * values and the time signature, and finding that out is the exercise.
 */
export function lineWords(locale: string, bars: StaffBars): string {
  return bars
    .flat()
    .map((el) => elementWord(locale, el))
    .join(', ');
}

// ─────────────── Aufgaben prüfen, bevor es eine Frage gibt ───────────────

/** Every element of every bar, in order. */
function flat(bars: StaffBars): StaffElement[] {
  return bars.flat();
}

/** The notes of a line (rests have no pitch). */
function notesOf(bars: StaffBars): Pitch[] {
  return flat(bars).flatMap((el) => (el.el === 'note' ? [el.pitch] : []));
}

/**
 * Eine punktierte ganze oder halbe Pause wird nicht gezeichnet und nicht benannt
 * (`dottedRestOk` sagt, warum). Eine Aufgabe, die eine verlangt, entsteht nicht.
 */
function restsWritable(bars: StaffBars): boolean {
  return flat(bars).every((el) => el.el !== 'rest' || !el.dotted || dottedRestOk(el.value));
}

/** Does every bar hold exactly as much as this time signature says? */
function barsExactlyFull(bars: StaffBars, time: TimeSignature): boolean {
  const want = barTicks(time);
  return bars.every(
    (bar) => bar.reduce((sum, el) => sum + ticksOf(el.value, el.dotted), 0) === want,
  );
}

/**
 * Die Aufgabe, oder null — und null heißt, die Frage entsteht nicht (wie bei einem Bruchbalken
 * mit unmöglichen Parametern, issue #162). Jede Ablehnung hier ist eine Frage, die das Modell
 * verliert, und nie ein Urteil, das ein Kind verliert.
 */
export function usableStaffTask(task: StaffTask): StaffTask | null {
  switch (task.task) {
    case 'name_note':
      // A note that does not sit on the drawn staff cannot be read off it.
      return onStaff(task.pitch, task.clef) ? task : null;
    case 'name_value':
      // The app places the symbol on the middle line, so the pitch needs no check — only the dot
      // on a whole or half rest, which is a shape nobody writes.
      return task.rest && task.dotted && !dottedRestOk(task.value) ? null : task;
    case 'interval': {
      if (!onStaff(task.lower, task.clef) || !onStaff(task.upper, task.clef)) return null;
      // A step that has no perfect, major or minor name has no key either (`intervalBetween`),
      // and two notes in the wrong order are no interval to read upwards.
      return intervalBetween(task.lower, task.upper) === null ? null : task;
    }
    case 'time_signature': {
      if (!TIME_READABLE.includes(task.time)) return null;
      if (!notesOf(task.bars).every((p) => onStaff(p, task.clef))) return null;
      if (!restsWritable(task.bars)) return null;
      // The whole point: the time signature is read off the values, so the values must add up.
      // A model that miscounts costs a question, never her trust in a right answer.
      return barsExactlyFull(task.bars, task.time) ? task : null;
    }
    case 'write_line': {
      const notes = notesOf(task.bars);
      if (!notes.every((p) => Math.abs(staffStep(p, task.clef)) <= WRITE_STEP_MAX)) return null;
      if (!restsWritable(task.bars)) return null;
      // One symbol is not a line to write, and a bar that does not add up cannot be asked for.
      if (flat(task.bars).length < 2) return null;
      return barsExactlyFull(task.bars, task.time) ? task : null;
    }
  }
}

/** The task a stored row carries, or null (an unreadable column is no task, never a guess). */
export function staffTaskOf(stored: unknown): StaffTask | null {
  if (stored === null || stored === undefined) return null;
  const parsed = StaffTask.safeParse(stored);
  return parsed.success ? parsed.data : null;
}

/**
 * Die leere Notenzeile, auf die sie schreibt — oder null für jede andere Notenaufgabe (die
 * werden angetippt). Sie verrät nichts: Schlüssel, Taktart und Taktzahl stehen schon in der
 * Frage, die Töne dort in Worten.
 */
export function staffSurfaceOf(task: StaffTask): StaffWriteSurface | null {
  if (task.task !== 'write_line') return null;
  return {
    mode: 'notes',
    clef: task.clef,
    time: task.time,
    bars: Math.min(task.bars.length, BARS_MAX),
    tempo: TEMPO_DEFAULT,
  };
}

// ─────────────── die Zeichnung ───────────────

/** The pitch on the MIDDLE line — where the app puts a symbol whose pitch is not the point. */
const MIDDLE_PITCH: Record<Clef, Pitch> = {
  treble: { name: 'B', octave: 4 },
  bass: { name: 'D', octave: 3 },
};

function staffFigure(clef: Clef, time: TimeSignature | null, bars: StaffBars): StaffFigure {
  return { type: 'staff', clef, time, bars, tempo: TEMPO_DEFAULT };
}

// ─────────────── die Auswahl ───────────────

/** C D E F G A B → 0 … 6 and back, for naming the neighbours of a note on the staff. */
const LETTERS: readonly NoteName[] = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];

/**
 * Die Optionen einer Lesefrage: die richtige und ihre nächsten Nachbarn, in einer festen
 * Ordnung. Fest ist hier das Entscheidende — kein `Math.random()` und keine Uhr (Regel 7,
 * `shuffle.ts`): zwei Läufe müssen dieselbe Frage ergeben, sonst ist nichts nachrechenbar.
 *
 * Null, wenn nicht genug verschiedene Nachbarn zusammenkommen; dann entsteht keine Frage,
 * statt einer mit zwei gleichen Optionen (was `usableItems` einem vom Modell geschriebenen
 * Multiple-Choice als „silently grades wrong" vorwirft).
 */
function optionsAround<T>(right: T, neighbours: readonly T[], same: (a: T, b: T) => boolean) {
  const out: T[] = [right];
  for (const candidate of neighbours) {
    if (out.length >= CHOICES) break;
    if (!out.some((x) => same(x, candidate))) out.push(candidate);
  }
  return out.length === CHOICES ? out : null;
}

/** The note names around one: a second and a third either way, naturals first. */
function nameNeighbours(name: NoteName): NoteName[] {
  const natural = name[0] as NoteName;
  const at = LETTERS.indexOf(natural);
  const step = (d: number) => LETTERS[(at + d + LETTERS.length * 2) % LETTERS.length] as NoteName;
  return [natural, step(1), step(-1), step(2), step(-2)];
}

/** The values around one, long to short, so a wrong tap is a near miss and not a guess. */
function valueNeighbours(value: NoteValue): NoteValue[] {
  const order: NoteValue[] = ['whole', 'half', 'quarter', 'eighth', 'sixteenth'];
  const at = order.indexOf(value);
  return [order[at - 1], order[at + 1], order[at - 2], order[at + 2], order[0], order[4]].filter(
    (v): v is NoteValue => v !== undefined,
  );
}

/** The intervals around one: the other quality of the same step, then the steps either side. */
function intervalNeighbours(interval: Interval): Interval[] {
  const other: Interval[] = [];
  if (interval.quality === 'major') other.push({ step: interval.step, quality: 'minor' });
  if (interval.quality === 'minor') other.push({ step: interval.step, quality: 'major' });
  const around = [1, -1, 2, -2]
    .map((d) => interval.step + d)
    .filter((s): s is Interval['step'] => s >= 1 && s <= 8)
    .map((step) => ({
      step,
      quality: (step === 1 || step === 4 || step === 5 || step === 8
        ? 'perfect'
        : 'major') as Interval['quality'],
    }));
  return [...other, ...around];
}

// ─────────────── die Frage, die daraus wird ───────────────

const COMMON = {
  accepted_answers: [] as string[],
  unit: null,
  prompt_lang: null,
  lang: null,
  tolerance: null,
  spelling: null,
  source_excerpt: null,
  // A note question is one value against one key; its answer has no parts (issues #228–#230).
  parts_task: null,
  // None of the twelve state-dependent curriculum places is about music (issue #214), a note
  // question is no writing task with required elements (issue #211), and nothing here is heard
  // from a spoken text — the note itself is what sounds (issue #210).
  curriculum_point: null,
  rubric: null,
  listen_task: null,
} as const;

type Multi = {
  choices: string[];
  correct_choice: number;
  answer: string;
};

/** The options as the question shows them, with the index of the right one. */
function multi<T>(options: readonly T[], right: T, word: (x: T) => string): Multi | null {
  const words = options.map(word);
  // Two options that read the same are one option for her: she taps the other right one and is
  // told she is wrong, with no way to argue (`usableItems` drops exactly that for the model).
  if (new Set(words.map((w) => w.toLocaleLowerCase())).size !== words.length) return null;
  const index = options.indexOf(right);
  if (index < 0) return null;
  return { choices: words, correct_choice: index, answer: words[index] as string };
}

/**
 * Die Frage, die eine geprüfte Aufgabe wird, oder null. Null ist das Schlimmste, was passieren
 * kann — kein Parametersatz kann einen Schlüssel erzeugen, der seiner eigenen Zeile widerspricht.
 */
export function staffItem(raw: StaffTask, locale: string): StaffItem | null {
  const task = usableStaffTask(raw);
  if (task === null) return null;
  const common = { ...COMMON, staff_task: task };
  switch (task.task) {
    case 'name_note': {
      const bars: StaffBars = [
        [{ el: 'note', pitch: task.pitch, value: 'quarter', dotted: false }],
      ];
      const options = optionsAround(
        task.pitch.name,
        nameNeighbours(task.pitch.name),
        (a, b) => a === b,
      );
      if (options === null) return null;
      // Sorted by their place in the octave, so the list reads like the scale she counts along.
      const sorted = [...options].sort(
        (a, b) =>
          LETTERS.indexOf(a[0] as NoteName) - LETTERS.indexOf(b[0] as NoteName) ||
          a.localeCompare(b),
      );
      const picked = multi(sorted, task.pitch.name, (n) => noteWord(locale, n));
      if (picked === null) return null;
      return {
        ...common,
        kind: 'multiple_choice',
        prompt: text(locale, 'name_note_prompt'),
        ...picked,
        topic: text(locale, 'topic_notes'),
        // A note inside the five lines is the easier one; a ledger line is the step up.
        difficulty: Math.abs(staffStep(task.pitch, task.clef)) > 4 ? 3 : 2,
        figure: staffFigure(task.clef, null, bars),
        hints: [
          text(locale, 'hint_note_clef', { clef: clefWord(locale, task.clef) }),
          text(locale, 'hint_note_step'),
        ],
        worked_solution: text(locale, 'worked_note', {
          clef: clefWord(locale, task.clef),
          answer: picked.answer,
        }),
      };
    }
    case 'name_value': {
      const el: StaffElement = task.rest
        ? { el: 'rest', value: task.value, dotted: task.dotted }
        : {
            el: 'note',
            pitch: MIDDLE_PITCH[task.clef],
            value: task.value,
            dotted: task.dotted,
          };
      const options = optionsAround(
        task.value,
        // Bei einer punktierten Pause kommen nur Werte als Ablenker in Frage, die punktiert
        // überhaupt vorkommen: eine „punktierte ganze Pause" als falsche Antwort anzubieten
        // wäre eine Form, die niemand schreibt, und damit keine echte Wahl.
        valueNeighbours(task.value).filter((v) => !(task.rest && task.dotted) || dottedRestOk(v)),
        (a, b) => a === b,
      );
      if (options === null) return null;
      const picked = multi(options, task.value, (v) =>
        valueWord(locale, v, task.dotted, task.rest),
      );
      if (picked === null) return null;
      return {
        ...common,
        kind: 'multiple_choice',
        prompt: text(locale, task.rest ? 'name_rest_prompt' : 'name_value_prompt'),
        ...picked,
        topic: text(locale, 'topic_values'),
        difficulty: task.dotted ? 3 : 2,
        figure: staffFigure(task.clef, null, [[el]]),
        hints: [
          text(locale, task.rest ? 'hint_value_rest' : 'hint_value_head'),
          text(locale, 'hint_value_flag'),
          ...(task.dotted ? [text(locale, 'hint_value_dot')] : []),
        ],
        worked_solution: text(locale, 'worked_value', { answer: picked.answer }),
      };
    }
    case 'interval': {
      const interval = intervalBetween(task.lower, task.upper);
      if (interval === null) return null;
      const bars: StaffBars = [
        [
          { el: 'note', pitch: task.lower, value: 'quarter', dotted: false },
          { el: 'note', pitch: task.upper, value: 'quarter', dotted: false },
        ],
      ];
      const options = optionsAround(
        interval,
        intervalNeighbours(interval),
        (a, b) => a.step === b.step && a.quality === b.quality,
      );
      if (options === null) return null;
      const sorted = [...options].sort(
        (a, b) => a.step - b.step || a.quality.localeCompare(b.quality),
      );
      const picked = multi(sorted, interval, (i) => intervalWord(locale, i));
      if (picked === null) return null;
      return {
        ...common,
        kind: 'multiple_choice',
        prompt: text(locale, 'interval_prompt'),
        ...picked,
        topic: text(locale, 'topic_intervals'),
        // Telling a major from a minor third needs the semitones, not just the steps.
        difficulty: interval.quality === 'perfect' ? 3 : 4,
        figure: staffFigure(task.clef, null, bars),
        hints: [text(locale, 'hint_interval_count'), text(locale, 'hint_interval_quality')],
        worked_solution: text(locale, 'worked_interval', {
          lower: noteWord(locale, task.lower.name),
          upper: noteWord(locale, task.upper.name),
          steps: diatonicOf(task.upper) - diatonicOf(task.lower) + 1,
          answer: picked.answer,
        }),
      };
    }
    case 'time_signature': {
      const others = TIME_READABLE.filter((x) => x !== task.time);
      const options = optionsAround(task.time, others, (a, b) => a === b);
      if (options === null) return null;
      const sorted = [...options].sort(
        (a, b) => TIME_SIGNATURES.indexOf(a) - TIME_SIGNATURES.indexOf(b),
      );
      // The options are the signatures themselves, not their names: "3/4" is what stands at the
      // start of a line, and it is the same in every language.
      const picked = multi(sorted, task.time, (x) => x);
      if (picked === null) return null;
      return {
        ...common,
        kind: 'multiple_choice',
        prompt: text(locale, 'time_prompt'),
        ...picked,
        topic: text(locale, 'topic_time'),
        difficulty: 3,
        // Drawn WITHOUT its time signature: it is what the question asks for.
        figure: staffFigure(task.clef, null, task.bars),
        hints: [text(locale, 'hint_time_add'), text(locale, 'hint_time_unit')],
        worked_solution: text(locale, 'worked_time', { answer: timeWord(locale, task.time) }),
      };
    }
    case 'write_line': {
      const line = lineWords(locale, task.bars);
      return {
        ...common,
        kind: 'short',
        prompt: text(locale, 'write_prompt', {
          clef: clefWord(locale, task.clef),
          time: timeWord(locale, task.time),
          line,
        }),
        // The key is the line in WORDS, so "Lösung zeigen", the material list and a disputed
        // verdict all show something a learner can read. What is compared is the structure
        // (`checkStaffLine`), never this string.
        answer: line,
        choices: null,
        correct_choice: null,
        topic: text(locale, 'topic_write'),
        difficulty: task.bars.length > 1 ? 4 : 3,
        // No figure: the staff she writes on IS the surface (`staffSurfaceOf`).
        figure: null,
        hints: [
          text(locale, 'hint_write_clef', { clef: clefWord(locale, task.clef) }),
          text(locale, 'hint_write_fill'),
        ],
        worked_solution: text(locale, 'worked_write', {
          answer: line,
          time: timeWord(locale, task.time),
        }),
      };
    }
  }
}

/** The tasks of one prepared set, as questions; unusable parameters yield nothing. */
export function staffItems(tasks: readonly StaffTask[], locale: string): StaffItem[] {
  return tasks.slice(0, MAX_STAFF_ITEMS).flatMap((task) => {
    const item = staffItem(task, locale);
    return item ? [item] : [];
  });
}

// ─────────────── ihre Zeile prüfen ───────────────

/**
 * Die EINE Stelle, auf die sie als nächstes schauen kann. Nie die Liste aller Fehler: `held`
 * sagt, wie viel hält, und genau eine Stelle sagt, wo es aufhört — dieselbe Entscheidung wie in
 * `parts.ts` und `chemistry.ts`, aus demselben Grund (alles auf einmal zu nennen ist eine Liste
 * zum Abarbeiten statt eines nächsten Schritts).
 */
export type StaffFault =
  /** Zu viele oder zu wenige Zeichen insgesamt. */
  | { at: 'count'; given: number; wanted: number }
  /** Ein Takt ist voller oder leerer als die Taktart erlaubt (1-basiert, wie sie zählt). */
  | { at: 'bar'; bar: number; over: boolean }
  /** Die n-te Note dieses Takts liegt auf der falschen Linie. */
  | { at: 'pitch'; bar: number; index: number }
  /** Sie hat den richtigen Ton, aber die falsche Dauer. */
  | { at: 'value'; bar: number; index: number }
  /** Hier gehört eine Pause hin, und sie hat eine Note gesetzt — oder umgekehrt. */
  | { at: 'rest_here'; bar: number; index: number }
  | { at: 'note_here'; bar: number; index: number };

export type StaffCheck = {
  /** Wie viele Zeichen von vorne stimmen (ein PRÄFIX, siehe unten). */
  held: number;
  total: number;
  verdict: 'correct' | 'partly' | 'wrong';
  fault: StaffFault | null;
};

/** Two elements are the same symbol: the same name, the same value, both note or both rest. */
function sameElement(a: StaffElement, b: StaffElement): boolean {
  if (a.el !== b.el) return false;
  if (a.value !== b.value || a.dotted !== b.dotted) return false;
  // The octave is deliberately not compared — see the head of this file.
  return a.el === 'note' && b.el === 'note' ? a.pitch.name === b.pitch.name : true;
}

/** Where the n-th element of the whole line sits: which bar, and which place in it. */
function placeOf(bars: StaffBars, at: number): { bar: number; index: number } {
  let seen = 0;
  for (let b = 0; b < bars.length; b++) {
    const bar = bars[b] as StaffElement[];
    if (at < seen + bar.length) return { bar: b + 1, index: at - seen + 1 };
    seen += bar.length;
  }
  return { bar: bars.length, index: (bars[bars.length - 1]?.length ?? 0) + 1 };
}

/**
 * Ihre Notenzeile gegen die Aufgabe, Zeichen für Zeichen. Kein Modell, in keinem Zweig.
 *
 * **null** heißt zweierlei, und beide Male „hier ist nichts zu vergleichen": die Frage ist keine
 * Schreibaufgabe, oder ihre Antwort ist überhaupt keine Notenzeile. Das zweite kann über die App
 * nicht passieren (dort gibt es kein Textfeld daneben), und wenn es doch ankommt, wird sie nicht
 * für falsch erklärt, sondern wie eine gewöhnliche Kurzantwort gegen den Schlüssel in Worten
 * geprüft — Regel 5: nichts behaupten, was nicht gemessen wurde.
 *
 * `held` ist ein PRÄFIX und keine Zahl übereinstimmender Stellen — dieselbe Messung wie bei
 * `order` in `parts.ts` und bei einem gerechneten Weg in `steps.ts`: wer die richtige Folge hat
 * und eine Note zu früh anfängt, hat sonst „alles falsch", obwohl sie die Zeile kennt, und „bis
 * hierher stimmt alles" ist der Satz, mit dem sie weiterarbeiten kann.
 *
 * Die Reihenfolge der Befunde ist nicht beliebig. Zuerst die Zahl der Zeichen, dann der Takt,
 * der nicht aufgeht, dann die erste Stelle, die abweicht: ein nicht voller Takt ist der Fehler,
 * den die Aufgabe eigentlich prüft („ob der Takt voll ist"), und er erklärt meistens auch, warum
 * danach alles verschoben ist.
 */
export function checkStaffLine(task: StaffTask, answer: string): StaffCheck | null {
  if (task.task !== 'write_line') return null;
  const wanted = flat(task.bars);
  const mine = parseStaffLine(answer);
  if (mine === null) return null;
  const given = flat(mine);
  let held = 0;
  while (
    held < wanted.length &&
    held < given.length &&
    sameElement(wanted[held] as StaffElement, given[held] as StaffElement)
  ) {
    held += 1;
  }
  const whole =
    held === wanted.length && given.length === wanted.length && mine.length === task.bars.length;
  const verdict = whole ? 'correct' : held > 0 ? 'partly' : 'wrong';
  const base = { held, total: wanted.length, verdict } as const;
  if (whole) return { ...base, fault: null };
  if (given.length !== wanted.length) {
    return { ...base, fault: { at: 'count', given: given.length, wanted: wanted.length } };
  }
  const want = barTicks(task.time);
  for (let b = 0; b < mine.length; b++) {
    const ticks = (mine[b] as StaffElement[]).reduce(
      (sum, el) => sum + ticksOf(el.value, el.dotted),
      0,
    );
    if (ticks !== want) return { ...base, fault: { at: 'bar', bar: b + 1, over: ticks > want } };
  }
  // Same count, every bar full, and still not her line: one symbol differs.
  const place = placeOf(mine, held);
  const target = wanted[held] as StaffElement | undefined;
  const hers = given[held] as StaffElement | undefined;
  if (target === undefined || hers === undefined) {
    return { ...base, fault: { at: 'count', given: given.length, wanted: wanted.length } };
  }
  if (target.el !== hers.el) {
    return { ...base, fault: { at: target.el === 'rest' ? 'rest_here' : 'note_here', ...place } };
  }
  if (target.el === 'note' && hers.el === 'note' && target.pitch.name !== hers.pitch.name) {
    return { ...base, fault: { at: 'pitch', ...place } };
  }
  return { ...base, fault: { at: 'value', ...place } };
}

/**
 * Ihre Zeile in Worten — was im Gesprächsfaden steht, damit der Verlauf lesbar bleibt, ein
 * späterer Leser sieht, was sie wirklich getan hat, und ein zurückgenommenes Urteil dasselbe vor
 * sich hat wie sie. In derselben Form wie die Lösung, damit die beiden Zeilen übereinander mit
 * dem Auge vergleichbar sind (`writtenParts` tut dasselbe für eine Anordnung).
 */
export function writtenStaffLine(locale: string, answer: string): string | null {
  const bars = parseStaffLine(answer);
  return bars === null ? null : lineWords(locale, bars);
}

/**
 * Die Rückmeldung auf eine Notenzeile, die noch nicht stimmt: wie viel hält, und ab dem zweiten
 * Versuch auch die Stelle — dieselbe Hinweisleiter wie bei den mehrteiligen Antworten.
 */
export function staffLineReply(locale: string, check: StaffCheck, attempts: number): string {
  // `count` liegt dabei, damit ein einzelnes Zeichen seinen eigenen Satz bekommt
  // („Das erste von 3 Zeichen stimmt." statt „Die ersten 1 von 3") — die Regel
  // p2-server-texts-no-grammar-or-plural, und `t` sucht dafür `held_one`.
  const counts = { held: String(check.held), total: String(check.total), count: check.held };
  const held = check.held > 0 ? text(locale, 'held', counts) : text(locale, 'held_none');
  const fault = attempts > 0 ? check.fault : null;
  if (fault === null) return held;
  switch (fault.at) {
    case 'count':
      return `${held} ${text(locale, fault.given > fault.wanted ? 'fault_too_many' : 'fault_too_few')}`;
    case 'bar':
      return `${held} ${text(locale, fault.over ? 'fault_bar_over' : 'fault_bar_under', { bar: fault.bar })}`;
    case 'pitch':
      return `${held} ${text(locale, 'fault_pitch', { bar: fault.bar, index: fault.index })}`;
    case 'value':
      return `${held} ${text(locale, 'fault_value', { bar: fault.bar, index: fault.index })}`;
    case 'rest_here':
      return `${held} ${text(locale, 'fault_rest_here', { bar: fault.bar, index: fault.index })}`;
    case 'note_here':
      return `${held} ${text(locale, 'fault_note_here', { bar: fault.bar, index: fault.index })}`;
  }
}

/**
 * Die feste, freundliche Zeile auf eine falsche Antwort bei einer ANGETIPPTEN Notenfrage. Sie
 * nennt, wo sie hinschauen kann, und sagt nichts, was die Lösung verrät.
 *
 * Sie ersetzt den Tutor, und das ist der Punkt: der Tutor sieht die gezeichnete Zeile nicht, und
 * ein Modell, das über ein Bild schreibt, das es nicht hat, erzeugt genau die sicher klingende
 * Falschaussage, die Regel 5 verbietet.
 */
export function staffAgain(locale: string, task: StaffTask): string {
  switch (task.task) {
    case 'name_note':
      return text(locale, 'again_note', { clef: clefWord(locale, task.clef) });
    case 'name_value':
      return text(locale, 'again_value');
    case 'interval':
      return text(locale, 'again_interval');
    case 'time_signature':
      return text(locale, 'again_time');
    case 'write_line':
      return text(locale, 'again_write');
  }
}

/** The canonical line of the task — what a test derives again and compares (issue #226). */
export function solutionLine(task: StaffTask): string | null {
  return task.task === 'write_line' ? renderStaffLine(task.bars) : null;
}
