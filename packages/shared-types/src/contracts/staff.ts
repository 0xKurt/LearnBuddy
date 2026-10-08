// Die NOTENZEILE: Noten lesen, selbst schreiben und anhören (issue #226, Welle 6 der
// Analyse #224).
//
// Musik war bis hierher das schwächste Fach: Notenschrift stand in `NotPracticableForm`
// unter `drawing` — eine Form, deren Produkt eine Zeichnung ist, also nicht übbar. Dabei ist
// Notenlehre der Teil des Lehrplans mit dem **höchsten Anteil formal entscheidbarer
// Fehlerklassen** (`docs/lehrplan-und-uebungsformen.md` §10.2): ein Notenname, ein Intervall,
// ein Notenwert, eine Taktart und die Frage, ob ein Takt voll ist, sind rechenbar. Es gibt
// hier kein Erkennungsproblem, nur einen Antwortvergleich — und deshalb **keinen
// Modellaufruf pro Antwort** (CLAUDE.md Regel 1).
//
// Dieselbe Bauweise wie der Bruchbalken (`bars.ts`, issue #162), und aus demselben Grund:
// **das Modell wählt, Code rechnet.** Ein `StaffTask` ist alles, was das Modell sagen darf —
// welche von fünf geprüften Aufgaben, welcher Schlüssel, welche Tonhöhen, welche Dauern. Es
// hat kein Feld für einen Fragetext, eine Antwort, eine Figur, einen Tipp oder eine
// Musterlösung: die schreibt `apps/api/src/modules/practice/staff.ts` aus genau diesem Objekt.
// Ein Schlüssel, der der gezeichneten Zeile widerspricht, ist damit nicht sagbar — es gibt
// keinen zweiten Autor, dem er widersprechen könnte. Das Schlimmste, was ein schlechter
// Parametersatz anrichtet, ist **keine** Frage (issue #226, Plan 5 verlangt genau das, nur
// als Nachprüfung; Berechnen ist die stärkere Form derselben Zusage).
//
// Was die Wertebereiche schon unsagbar machen, muss nicht wegvalidiert werden: eine Tonhöhe
// ist ein Name aus einer geschlossenen Liste von zwölf (keine erfundene Enharmonik, kein
// doppeltes Vorzeichen), eine Dauer eine von fünf, eine Taktart eine von sechs. Was danach
// noch voneinander abhängt — liegt die Note auf der gezeichneten Zeile? ergibt das Intervall
// eine Stufe, die es gibt? ist jeder Takt voll? — ergibt nichts, niemals etwas Falsches.
//
// Zwei Grenzen stehen ausdrücklich hier, weil ein Prüfer, der rät, ein sicheres falsches
// Urteil erzeugt (Regel 5):
//   · **keine Vorzeichen am Zeilenanfang** (Generalvorzeichen). Ein Kreuz vor der Zeile
//     ändert jede gleichnamige Note im ganzen Takt und in jeder Oktave; wer das halb
//     abbildet, markiert richtig geschriebene Noten als falsch. Vorzeichen stehen hier
//     einzeln vor ihrer Note — so, wie eine Notennamen-Aufgabe sie zeigt. Tonleitern und
//     Quintenzirkel warten darauf.
//   · **eine Stimme**. Mehrstimmigkeit, Akkorde als Klang und Partitur bleiben draußen
//     (#224 hat das so entschieden), und Notendiktat nach Gehör ebenfalls: dort wäre die
//     Notenzeile die Antwort auf einen gehörten Ton.
//
// Gehörbildung (issue #445) ist die eine Ausnahme vom „gezeichnet": `hear_interval` und
// `tap_rhythm` zeichnen nichts, die Töne SIND die Frage (`HeardTones`). Ein gehörtes Intervall
// wird angetippt wie ein gelesenes; ein gehörter Rhythmus wird nachgeklopft, und ihre Schläge
// reisen als Abstände in Millisekunden (`renderTaps`). Den Ton erzeugt die App aus genau diesen
// Daten (`lib/music/tone.ts`), den Schlüssel rechnet der Server aus denselben — beides aus einem
// Objekt.

import { z } from 'zod';

// ─────────────── Tonhöhe ───────────────

/**
 * Die zwölf Tonnamen einer Oktave, in den Daten immer mit Kreuz geschrieben.
 *
 * Eine geschlossene Liste und kein Paar aus Buchstabe und Vorzeichen — dasselbe Mittel wie
 * `BAR_FRACTIONS`: „Eis", „His", ein Doppelkreuz und ein Ces sind damit nicht sagbar, und
 * zwei verschiedene Mitglieder sind immer zwei verschiedene Töne. Die B-Schreibungen fehlen
 * absichtlich: As und Gis klingen gleich, heißen aber verschieden, und welcher von beiden
 * gemeint ist, entscheidet in einer Notenaufgabe das gezeichnete Vorzeichen. Mit nur einer
 * Schreibung pro Taste gibt es diese Frage nicht — und keine Antwort, die „derselbe Ton,
 * anderer Name" ist und trotzdem falsch sein müsste.
 *
 * Wie ein Name in der Sprache der Lernenden heißt, steht nicht hier, sondern in den
 * Sprachdateien: auf Deutsch ist `B` das **H** und `A#` das **Ais**, auf Französisch heißt `D`
 * **Ré**. Ein Name ist Daten, sein Wort ist Übersetzung.
 */
export const NOTE_NAMES = [
  'C',
  'C#',
  'D',
  'D#',
  'E',
  'F',
  'F#',
  'G',
  'G#',
  'A',
  'A#',
  'B',
] as const;
export const NoteName = z.enum(NOTE_NAMES);
export type NoteName = z.infer<typeof NoteName>;

/** Die tiefste und höchste Oktave (wissenschaftliche Zählung: C4 ist das mittlere C). */
export const OCTAVE_MIN = 2;
export const OCTAVE_MAX = 6;

/** Ein Ton: sein Name und seine Oktave. */
export const Pitch = z.object({
  name: NoteName,
  octave: z.number().int().min(OCTAVE_MIN).max(OCTAVE_MAX),
});
export type Pitch = z.infer<typeof Pitch>;

// ─────────────── Dauer ───────────────

/**
 * Die Notenwerte, die eine Zeile tragen darf. Fünf, weil das die Werte sind, die eine
 * Klassenarbeit der Sek I kennt (ganze, halbe, Viertel-, Achtel-, Sechzehntelnote); eine
 * Zweiunddreißigstel ist auf einem Handy kein Tippziel mehr und in einer Rhythmusaufgabe
 * dieser Stufe nicht verlangt.
 */
export const NOTE_VALUES = ['whole', 'half', 'quarter', 'eighth', 'sixteenth'] as const;
export const NoteValue = z.enum(NOTE_VALUES);
export type NoteValue = z.infer<typeof NoteValue>;

/**
 * Wie lang ein Wert ist, in Zweiunddreißigsteln.
 *
 * Zweiunddreißigstel und nicht Sechzehntel, damit **jede** erlaubte Dauer eine ganze Zahl
 * ist: eine punktierte Sechzehntel sind 3, eine punktierte Viertel 12. Dadurch ist „ist
 * dieser Takt voll?" eine Gleichheit zwischen ganzen Zahlen und nie ein Vergleich von
 * Gleitkommazahlen — ein Urteil über die Arbeit eines Kindes darf nicht an einer Rundung
 * hängen.
 */
export const TICKS: Record<NoteValue, number> = {
  whole: 32,
  half: 16,
  quarter: 8,
  eighth: 4,
  sixteenth: 2,
};

/** Wie lang eine Note oder Pause wirklich ist: punktiert ist die Hälfte mehr. */
export function ticksOf(value: NoteValue, dotted: boolean): number {
  const plain = TICKS[value];
  return dotted ? plain + plain / 2 : plain;
}

// ─────────────── Schlüssel und Taktart ───────────────

/** Violin- und Bassschlüssel — die beiden, die die Sek I schreibt. */
export const Clef = z.enum(['treble', 'bass']);
export type Clef = z.infer<typeof Clef>;

/**
 * Die Taktarten, die eine Zeile tragen darf — eine geschlossene Liste wie bei den Tonnamen,
 * damit ein 7/16-Takt nicht erst wegvalidiert werden muss.
 */
export const TIME_SIGNATURES = ['2/4', '3/4', '4/4', '3/8', '6/8', '2/2'] as const;
export const TimeSignature = z.enum(TIME_SIGNATURES);
export type TimeSignature = z.infer<typeof TimeSignature>;

/** Wie viele Zweiunddreißigstel in einen Takt dieser Taktart passen. */
export function barTicks(time: TimeSignature): number {
  const [beats, unit] = time.split('/').map(Number) as [number, number];
  return (beats * 32) / unit;
}

// ─────────────── was auf der Zeile steht ───────────────

/** Die meisten Noten oder Pausen in einem Takt — mehr wird auf einem Handy zu eng. */
export const ELEMENTS_PER_BAR_MAX = 8;
/**
 * Die meisten Takte einer Zeile. Zwei, und das ist gerechnet, nicht geschätzt: ein Takt
 * braucht auf einem 360 pt breiten Handy innerhalb der Figurkarte (2 × 12 pt Polster, 2 × 1 pt
 * Rahmen) etwa 150 pt, damit acht Notenköpfe mit ihren Hälsen und Vorzeichen auseinander
 * liegen. Drei Takte wären 100 pt je Takt, und dann berühren sich die Köpfe.
 */
export const BARS_MAX = 2;

/** Eine Note oder eine Pause. */
export const StaffElement = z.discriminatedUnion('el', [
  z.object({
    el: z.literal('note'),
    pitch: Pitch,
    value: NoteValue,
    dotted: z.boolean().default(false),
  }),
  z.object({
    el: z.literal('rest'),
    value: NoteValue,
    dotted: z.boolean().default(false),
  }),
]);
export type StaffElement = z.infer<typeof StaffElement>;

/** Die Takte einer Zeile, jeder mit seinen Noten und Pausen. */
export const StaffBars = z
  .array(z.array(StaffElement).min(1).max(ELEMENTS_PER_BAR_MAX))
  .min(1)
  .max(BARS_MAX);
export type StaffBars = z.infer<typeof StaffBars>;

/** Das langsamste und schnellste Tempo, das „Anhören" spielt (Viertel pro Minute). */
export const TEMPO_MIN = 40;
export const TEMPO_MAX = 200;
/** Das Tempo, in dem eine Übungszeile klingt — ruhig genug, um mitzulesen. */
export const TEMPO_DEFAULT = 80;

/** Die meisten Noten einer Zeile: zwei Takte zu je acht Zeichen. */
const STAFF_NOTES_MAX = BARS_MAX * ELEMENTS_PER_BAR_MAX;

/**
 * Welche Noten ihren NAMEN unter sich tragen (issue #312, Owner 03.10.: „dass die für gewisse
 * Übungen auch beschriftet werden müssen"): die Nummern der Noten in Leserichtung über die ganze
 * Zeile, von 0 an; Pausen haben keinen Namen und zählen nicht mit.
 *
 * Eine Liste von Nummern und nicht `'none' | 'given' | 'all'`, weil die Regel, die hier gilt, eine
 * Regel über EINZELNE Noten ist: die Note, deren Name gefragt ist, steht nie beschriftet da — auch
 * dann nicht, wenn die anderen es sind. Ein Schalter für die ganze Zeile müsste daneben noch sagen,
 * welche Noten „gegeben" sind; die Liste sagt es direkt, und „keine" (`[]`), „alle" und „die schon
 * gelösten" sind drei Inhalte derselben Form.
 *
 * Gesetzt wird sie nur von Code aus der geprüften Aufgabe (`practice/staff.ts`, `staffLabels`),
 * nie vom Modell: `StaffFigure` steht nicht in `ModelFigure`. Fehlt sie (eine Zeile von vor #312),
 * ist sie leer — ohne Beschriftung, wie diese Zeilen immer aussahen.
 */
const StaffLabels = z
  .array(
    z
      .number()
      .int()
      .min(0)
      .max(STAFF_NOTES_MAX - 1),
  )
  .max(STAFF_NOTES_MAX)
  .default([]);

/**
 * Die gezeichnete Notenzeile (`ItemView.figure`): Schlüssel, Taktart, Takte, Tempo und welche
 * Noten beschriftet sind.
 *
 * Sie steht in `Figure` und **nicht** in `ModelFigure`: eine Notenzeile schreibt nur Code
 * (`practice/staff.ts`), aus der geprüften Aufgabe, aus der auch Frage und Schlüssel kommen.
 * Dürfte das Modell sie neben eine selbst geschriebene Frage legen, wäre der Schlüssel wieder
 * eine Behauptung über ein Bild, das jemand anders gezeichnet hat — genau der Fehler, den
 * issue #157 teuer bezahlt hat.
 *
 * `time: null` heißt: die Zeile zeigt **keine** Taktart. Das ist kein fehlendes Feld, sondern
 * eine Aussage — entweder ist die Zeile ein einzelnes Zeichen ohne Takt (ein Ton, dessen Name
 * gefragt ist), oder nach der Taktart wird gefragt, und dann darf sie erst recht nicht dastehen.
 */
export const StaffFigure = z.object({
  type: z.literal('staff'),
  clef: Clef,
  time: TimeSignature.nullable(),
  bars: StaffBars,
  tempo: z.number().int().min(TEMPO_MIN).max(TEMPO_MAX),
  labels: StaffLabels,
});
export type StaffFigure = z.infer<typeof StaffFigure>;

/**
 * Was eine Hör-Aufgabe spielt (`ItemView.tones`, issue #445): die Töne als Zeile und ihr Tempo —
 * die zwei Töne eines Intervalls oder ein Rhythmus auf einem Ton, dieselben Daten, aus denen
 * „Anhören" eine gezeichnete Zeile spielt, nur ohne Zeichnung. Sie sind damit im Gerät, wie bei
 * jeder gezeichneten Notenfrage; sie stehen nirgends als Text auf dem Bildschirm.
 */
export const HeardTones = z.object({
  bars: StaffBars,
  tempo: z.number().int().min(TEMPO_MIN).max(TEMPO_MAX),
});
export type HeardTones = z.infer<typeof HeardTones>;

// ─────────────── Linien und Zwischenräume ───────────────

/** C D E F G A B → 0 … 6; ein Kreuz sitzt auf der Linie seines Stammtons. */
const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'] as const;

/**
 * Die Stufe eines Tons in der diatonischen Leiter, über alle Oktaven gezählt. Das ist die
 * Zahl, die über die **Linie** entscheidet: ein Kreuz steht links vor dem Kopf und verschiebt
 * ihn nicht.
 */
export function diatonicOf(pitch: Pitch): number {
  const letter = pitch.name[0] as (typeof LETTERS)[number];
  return LETTERS.indexOf(letter) + 7 * pitch.octave;
}

/** Halbtöne über C−1, also die MIDI-Nummer: A4 ist 69. */
export function semitonesOf(pitch: Pitch): number {
  return (pitch.octave + 1) * 12 + NOTE_NAMES.indexOf(pitch.name);
}

/** Die Frequenz in Hertz, gleichstufig gestimmt mit A4 = 440 Hz. */
export function frequencyOf(pitch: Pitch): number {
  return 440 * Math.pow(2, (semitonesOf(pitch) - 69) / 12);
}

/** Der Ton auf der MITTLEREN der fünf Linien — der Nullpunkt jedes Schlüssels. */
const MIDDLE: Record<Clef, Pitch> = {
  treble: { name: 'B', octave: 4 },
  bass: { name: 'D', octave: 3 },
};

/**
 * Wo ein Ton in diesem Schlüssel sitzt, in halben Linienabständen von der mittleren Linie:
 * 0 ist die mittlere Linie, +1 der Zwischenraum darüber, −4 die unterste Linie.
 */
export function staffStep(pitch: Pitch, clef: Clef): number {
  return diatonicOf(pitch) - diatonicOf(MIDDLE[clef]);
}

/**
 * Die äußerste Stufe, die noch gezeichnet wird: eine Hilfslinie über und unter den fünf
 * Linien. Weiter hinaus braucht zwei Hilfslinien, und dann wird das Abzählen für ein Kind zum
 * eigentlichen Problem — in beiden Schlüsseln bleibt so ein ganzes Dutzend Töne übrig
 * (Violinschlüssel C4 … A5, Bassschlüssel E2 … C4).
 */
export const STAFF_STEP_MAX = 6;

/** Liegt dieser Ton auf der gezeichneten Zeile? Sonst entsteht keine Frage. */
export function onStaff(pitch: Pitch, clef: Clef): boolean {
  return Math.abs(staffStep(pitch, clef)) <= STAFF_STEP_MAX;
}

/**
 * Der Ton, der in diesem Schlüssel auf dieser Stufe liegt — die Umkehrung von `staffStep`, und
 * die Rechnung, mit der die Schreibfläche einen Tipp in einen Ton verwandelt. Sie steht hier und
 * nicht dort, weil zwei Fassungen derselben Zuordnung zwei Wahrheiten wären: ein Tipp muss auf
 * der Linie landen, auf der die Note dann gezeichnet wird.
 */
export function pitchAtStep(step: number, clef: Clef, sharp = false): Pitch {
  const dia = diatonicOf(MIDDLE[clef]) + step;
  const letter = LETTERS[((dia % 7) + 7) % 7] as NoteName;
  const names: readonly string[] = NOTE_NAMES;
  const raised = `${letter}#`;
  return {
    name: sharp && names.includes(raised) ? (raised as NoteName) : letter,
    octave: Math.floor(dia / 7),
  };
}

/**
 * Lässt sich der Ton auf dieser Stufe mit einem Kreuz versehen? „Eis" und „His" gehören nicht zu
 * den zwölf Namen (siehe `NOTE_NAMES`), also ist die Antwort dort nein — und die Fläche schaltet
 * ihre Kreuz-Taste dann aus, statt ein Kreuz zu zeigen, das nichts bewirkt.
 */
export function canSharp(step: number, clef: Clef): boolean {
  const names: readonly string[] = NOTE_NAMES;
  return names.includes(`${pitchAtStep(step, clef).name}#`);
}

/**
 * Darf eine Pause dieses Werts punktiert sein? Eine punktierte ganze oder halbe Pause kommt in
 * der Notenschrift der Sek I nicht vor (eine ganze Pause IST der Takt), und sie zu erlauben
 * hieße, eine Form zu zeichnen und zu benennen, die niemand so schreibt. Die punktierte
 * Viertelpause dagegen steht in jedem Sechsachteltakt.
 */
export function dottedRestOk(value: NoteValue): boolean {
  return value !== 'whole' && value !== 'half';
}

/** Alle zeichenbaren Töne eines Schlüssels, von unten nach oben — die Stufen der Fläche. */
export function staffPitches(clef: Clef): Pitch[] {
  const out: Pitch[] = [];
  for (let octave = OCTAVE_MIN; octave <= OCTAVE_MAX; octave++) {
    for (const name of NOTE_NAMES) {
      const pitch = { name, octave };
      if (onStaff(pitch, clef)) out.push(pitch);
    }
  }
  return out.sort((a, b) => semitonesOf(a) - semitonesOf(b));
}

// ─────────────── Intervalle ───────────────

/** Die Stufen, die ein Intervall haben kann: Prime bis Oktave. */
export const INTERVAL_STEPS = [1, 2, 3, 4, 5, 6, 7, 8] as const;
export type IntervalStep = (typeof INTERVAL_STEPS)[number];

/** Rein gibt es nur bei Prime, Quarte, Quinte und Oktave, groß/klein nur bei den anderen. */
export type IntervalQuality = 'perfect' | 'major' | 'minor';

/** Wie viele Halbtöne eine reine bzw. große Stufe hat. */
const PURE_SEMITONES: Record<IntervalStep, number> = {
  1: 0,
  2: 2,
  3: 4,
  4: 5,
  5: 7,
  6: 9,
  7: 11,
  8: 12,
};
const PERFECT: ReadonlySet<number> = new Set([1, 4, 5, 8]);

export type Interval = { step: IntervalStep; quality: IntervalQuality };

/**
 * Das Intervall zwischen zwei Tönen — oder null, und dann entsteht keine Frage.
 *
 * Null heißt hier immer „das hat keinen eindeutigen Namen auf dieser Stufe", nie „ich konnte
 * es nicht ausrechnen": der zweite Ton liegt nicht über dem ersten, die Stufe geht über die
 * Oktave hinaus, oder die Halbtonzahl passt zu keiner reinen, großen oder kleinen Stufe — eine
 * verminderte Quinte und eine übermäßige Sekunde sind richtige Intervalle und heißen in jedem
 * Bundesland etwas anderes genug, dass ein Schlüssel dafür eine Behauptung wäre (Regel 5).
 */
export function intervalBetween(lower: Pitch, upper: Pitch): Interval | null {
  const steps = diatonicOf(upper) - diatonicOf(lower);
  const semitones = semitonesOf(upper) - semitonesOf(lower);
  if (steps < 1 || steps > 7) return null;
  const step = (steps + 1) as IntervalStep;
  const pure = PURE_SEMITONES[step];
  if (PERFECT.has(step)) {
    return semitones === pure ? { step, quality: 'perfect' } : null;
  }
  if (semitones === pure) return { step, quality: 'major' };
  if (semitones === pure - 1) return { step, quality: 'minor' };
  return null;
}

// ─────────────── ihre Zeile, wie sie reist ───────────────

/**
 * Die Fläche, auf die sie selbst schreibt (`ItemView.surface`, `mode: 'notes'`).
 *
 * Sie verrät nichts: der Schlüssel, die Taktart und die Zahl der Takte stehen schon in der
 * Frage, die Code geschrieben hat („Schreibe im Viervierteltakt: …"), und die Töne stehen dort
 * in Worten. Was sie HIER tut, ist das, worum es geht — sie auf die richtige Linie setzen.
 */
export const StaffWriteSurface = z.object({
  mode: z.literal('notes'),
  clef: Clef,
  time: TimeSignature,
  /** Wie viele Takte sie füllt. */
  bars: z.number().int().min(1).max(BARS_MAX),
  tempo: z.number().int().min(TEMPO_MIN).max(TEMPO_MAX),
});
export type StaffWriteSurface = z.infer<typeof StaffWriteSurface>;

/** Die Buchstaben, mit denen eine Dauer in einer Zeile geschrieben wird. */
const VALUE_LETTER: Record<NoteValue, string> = {
  whole: 'w',
  half: 'h',
  quarter: 'q',
  eighth: 'e',
  sixteenth: 's',
};
const VALUE_OF_LETTER: Record<string, NoteValue> = Object.fromEntries(
  Object.entries(VALUE_LETTER).map(([value, letter]) => [letter, value as NoteValue]),
) as Record<string, NoteValue>;

/**
 * Die längste Zeile als Zeichenkette: zwei Takte, acht Elemente, je höchstens fünf Zeichen,
 * dazu die Trenner. Großzügig gerundet, damit `AnswerRequest.text` (2000) nie die Grenze ist.
 */
export const STAFF_LINE_MAX = 200;

const NOTE_TOKEN = /^([A-G]#?)([2-6])([whqes])(\.?)$/;
const REST_TOKEN = /^R([whqes])(\.?)$/;

/**
 * Die Zeile als eine Zeichenkette, so wie die App sie als Antwort schickt und wie Code sie
 * zurückliest: Takte durch `|` getrennt, Elemente durch ein Leerzeichen, eine Note als
 * `C#4q`, eine Pause als `Rq`, ein Punkt dahinter heißt punktiert.
 *
 * Eine Maschinenform und kein Satz, und beides mit Absicht: die App soll nichts Deutsches
 * zusammenbauen (dafür ist der Server zuständig, in der Sprache der Lernenden), und der Server
 * soll nichts raten müssen. Was im Gesprächsfaden steht, schreibt `practice/staff.ts` daraus
 * in Worten — genauso, wie `writtenParts` aus einer Anordnung einen lesbaren Satz macht.
 */
export function renderStaffLine(bars: StaffBars): string {
  return bars
    .map((bar) =>
      bar
        .map((el) => {
          const tail = VALUE_LETTER[el.value] + (el.dotted ? '.' : '');
          return el.el === 'rest' ? `R${tail}` : `${el.pitch.name}${el.pitch.octave}${tail}`;
        })
        .join(' '),
    )
    .join(' | ');
}

/**
 * Eine solche Zeichenkette zurück als Takte — oder null, wenn sie keine Zeile ist. Null ist
 * kein Urteil über ihre Antwort, sondern die Feststellung, dass hier nichts zu vergleichen
 * ist; der Aufrufer sagt dann „noch nicht lesbar" und nicht „falsch".
 */
export function parseStaffLine(text: string): StaffBars | null {
  if (text.trim() === '' || text.length > STAFF_LINE_MAX) return null;
  const bars: StaffElement[][] = [];
  for (const barText of text.split('|')) {
    const tokens = barText.trim().split(/\s+/).filter(Boolean);
    if (tokens.length === 0 || tokens.length > ELEMENTS_PER_BAR_MAX) return null;
    const bar: StaffElement[] = [];
    for (const token of tokens) {
      const rest = REST_TOKEN.exec(token);
      if (rest) {
        bar.push({
          el: 'rest',
          value: VALUE_OF_LETTER[rest[1] as string] as NoteValue,
          dotted: rest[2] === '.',
        });
        continue;
      }
      const note = NOTE_TOKEN.exec(token);
      if (!note) return null;
      const parsedName = NoteName.safeParse(note[1]);
      if (!parsedName.success) return null;
      bar.push({
        el: 'note',
        pitch: { name: parsedName.data, octave: Number(note[2]) },
        value: VALUE_OF_LETTER[note[3] as string] as NoteValue,
        dotted: note[4] === '.',
      });
    }
    bars.push(bar);
  }
  return bars.length >= 1 && bars.length <= BARS_MAX ? bars : null;
}

// ─────────────── ein Rhythmus zum Nachklopfen (issue #445) ───────────────

/**
 * Ein Zeichen eines Rhythmus: Note oder Pause und ihr Wert — ohne Tonhöhe. Ein Rhythmus zum
 * Nachklopfen klingt auf EINEM Ton, und den setzt Code (`practice/staff.ts`): eine Tonhöhe, die
 * das Modell wählen dürfte, wäre ein Parameter, der nichts entscheidet.
 */
export const RhythmElement = z.object({
  el: z.enum(['note', 'rest']),
  value: NoteValue,
  dotted: z.boolean().default(false),
});
export type RhythmElement = z.infer<typeof RhythmElement>;

/** Die Takte eines Rhythmus — mit denselben Grenzen wie eine Notenzeile. */
export const RhythmBars = z
  .array(z.array(RhythmElement).min(1).max(ELEMENTS_PER_BAR_MAX))
  .min(1)
  .max(BARS_MAX);
export type RhythmBars = z.infer<typeof RhythmBars>;

/**
 * Die Fläche, auf die sie einen gehörten Rhythmus klopft (`ItemView.surface`, `mode: 'taps'`).
 * Sie trägt nichts: wie viele Töne kamen und wie lang sie waren, ist genau das, was sie hören soll.
 */
export const RhythmTapSurface = z.object({ mode: z.literal('taps') });
export type RhythmTapSurface = z.infer<typeof RhythmTapSurface>;

/** Die meisten Schläge einer Antwort: doppelt so viele, wie ein Rhythmus Töne haben kann. */
export const TAPS_MAX = 2 * BARS_MAX * ELEMENTS_PER_BAR_MAX;
/**
 * Der späteste Schlag nach dem ersten: eine Minute. Ein Rhythmus hier dauert ein paar Sekunden;
 * die Grenze hält nur eine Antwort klein, die keiner ist.
 */
const TAP_SPAN_MAX_MS = 60_000;

/**
 * Ihre Schläge, wie sie als Antwort reisen: die Abstände vom ersten Schlag in ganzen
 * Millisekunden, durch Leerzeichen getrennt („0 742 1130 1497"). Gemessen auf dem Gerät mit
 * einer monotonen Uhr; ein Zeitpunkt reist nicht, nur wie lang es von Schlag zu Schlag dauerte.
 */
export function renderTaps(at: readonly number[]): string {
  const first = at[0] ?? 0;
  return at.map((t) => Math.max(0, Math.round(t - first))).join(' ');
}

/**
 * Die Schläge zurück — oder null, wenn der Text keine Schläge sind. Null ist kein Urteil über ihr
 * Klopfen, sondern „hier ist nichts zu vergleichen" (dieselbe Regel wie `parseStaffLine`).
 */
export function parseTaps(text: string): number[] | null {
  const parts = text.trim().split(/\s+/);
  if (parts.length > TAPS_MAX || !parts.every((p) => /^\d{1,5}$/.test(p))) return null;
  const taps = parts.map(Number);
  const ordered = taps.every((t, i) => i === 0 || t >= (taps[i - 1] as number));
  return taps[0] === 0 && ordered && (taps[taps.length - 1] as number) <= TAP_SPAN_MAX_MS
    ? taps
    : null;
}

// ─────────────── die geprüfte Aufgabe ───────────────

/**
 * Eine der sieben geprüften Notenaufgaben. Der Server schreibt daraus die Frage, zeichnet die
 * Zeile (oder lässt sie hören, `hear_interval`, `tap_rhythm`) und rechnet die Lösung aus
 * (`practice/staff.ts`) — es gibt hier kein Feld für irgendetwas davon.
 */
export const StaffTask = z.discriminatedUnion('task', [
  z
    .object({ task: z.literal('name_note'), clef: Clef, pitch: Pitch })
    .describe(
      'Name this note: ONE note is drawn in the chosen clef and the learner writes its name. Pick a pitch that really sits on that clef (treble C4 to A5, bass E2 to C4), otherwise no question is written.',
    ),
  z
    .object({
      task: z.literal('name_value'),
      clef: Clef,
      value: NoteValue,
      dotted: z.boolean().default(false),
      rest: z
        .boolean()
        .default(false)
        .describe('true draws a rest instead of a note, so the task asks for a rest.'),
    })
    .describe(
      'Name this duration: one note or one rest is drawn and the learner writes what it is worth. The app places it, so there is no pitch to choose.',
    ),
  z
    .object({ task: z.literal('interval'), clef: Clef, lower: Pitch, upper: Pitch })
    .describe(
      'Name this interval: two notes are drawn one after the other and the learner names the interval. `upper` must be ABOVE `lower` and within an octave of it, and the interval must be a perfect, major or minor one — a diminished or augmented one gets no question.',
    ),
  z
    .object({ task: z.literal('hear_interval'), lower: Pitch, upper: Pitch })
    .describe(
      'Hear this interval (ear training): the app PLAYS two notes one after the other, nothing is drawn, and the learner names the interval. Same rules as "interval": `upper` ABOVE `lower`, within an octave, a perfect, major or minor one; both notes between E2 and A5.',
    ),
  z
    .object({ task: z.literal('tap_rhythm'), time: TimeSignature, bars: RhythmBars })
    .describe(
      'Tap this rhythm back (ear training): the app PLAYS the rhythm on one tone, nothing is drawn, and the learner taps it back; the app measures the timing. Every bar must be filled exactly. Start with a note, use at least four notes, and let every note start on an eighth — no sixteenths, no dotted eighths — otherwise no question is written.',
    ),
  z
    .object({
      task: z.literal('time_signature'),
      clef: Clef,
      time: TimeSignature,
      bars: StaffBars,
    })
    .describe(
      'Which time signature? The line is drawn WITHOUT its time signature and the learner reads it off the note values. Every bar must be filled exactly — the server adds the durations up and writes no question when one bar does not come out right, so this is a way to have your own counting checked.',
    ),
  z
    .object({
      task: z.literal('write_line'),
      clef: Clef,
      time: TimeSignature,
      bars: StaffBars,
    })
    .describe(
      'Write this line yourself: the learner gets an empty staff and places the notes and rests the question names. Every bar must be filled exactly, as above.',
    ),
]);
export type StaffTask = z.infer<typeof StaffTask>;

/** Welche der sieben Aufgaben es ist. */
export type StaffTaskName = StaffTask['task'];
