// Eine Notenzeile in Worten (issue #226, Abnahme: „mit dem Screenreader in Worten verständlich").
//
// Eine gezeichnete Zeile ist für ein Kind, das nicht sehen kann, keine Aufgabe, sondern eine
// Leerstelle. Deshalb gibt es jede Zeile auch als Satz — nicht als Beschreibung des Bildes
// („fünf Linien, darauf Punkte"), sondern als denselben Inhalt in Sprache: „Violinschlüssel,
// Viervierteltakt. Takt 1: C als Viertelnote, E als Viertelnote, G als halbe Note." Damit ist
// die Frage hörbar lösbar und nicht bloß vorhanden.
//
// Die Wörter stehen im Namensraum `math` (`locales/<lang>/math.json`, `staff.*`), weil die
// Zeichnung dort zu Hause ist und sowohl die gelesene Figur als auch die Schreibfläche sie
// braucht. Dass der Server dieselben Namen ein zweites Mal führt
// (`apps/api/src/i18n/*.json`, `practice.staff.*`), ist kein Versehen: dort schreibt er
// Fragetexte und Musterlösungen in der Sprache der Lernenden, hier beschriftet die App ihre
// eigene Fläche — die beiden Sätze werden an verschiedenen Orten gebraucht und dürfen nicht
// übereinander geschickt werden.
//
// Auf Deutsch heißt `B` das **H** und `A#` das **Ais**; auf Französisch **Si** und
// **La dièse**. Keine dieser Zuordnungen steht im Code: ein Name ist Daten, sein Wort ist
// Übersetzung (`contracts/staff.ts`).

import type {
  Clef,
  NoteName,
  NoteValue,
  StaffElement,
  StaffFigure,
  TimeSignature,
} from '@learnbuddy/shared-types/contracts';

/** Was `useTranslation('math')` zurückgibt, so weit es hier gebraucht wird. */
export type Translate = (key: string, values?: Record<string, string | number>) => string;

/** `C#` → der Schlüssel `staff.note.Cs`: ein Kreuz kann kein JSON-Schlüssel sein. */
function noteWord(t: Translate, name: NoteName): string {
  return t(`staff.note.${name.replace('#', 's')}`);
}

/** „Viertelnote" / „Viertelpause", und „punktierte Viertelnote", wenn ein Punkt dahinter steht. */
export function valueWord(t: Translate, value: NoteValue, dotted: boolean, rest: boolean): string {
  const plain = t(`staff.${rest ? 'value_rest' : 'value_note'}.${value}`);
  return dotted ? t(rest ? 'staff.dotted_rest' : 'staff.dotted_note', { value: plain }) : plain;
}

/** „Violinschlüssel" / „Bassschlüssel". */
function clefWord(t: Translate, clef: Clef): string {
  return t(`staff.clef.${clef}`);
}

/** „Viervierteltakt" — `4/4` kann kein Schlüsselpfad sein, also steht dort `t4_4`. */
function timeWord(t: Translate, time: TimeSignature): string {
  return t(`staff.time.t${time.replace('/', '_')}`);
}

/** Ein Zeichen in Worten: „C als Viertelnote", „Viertelpause". */
export function elementWord(t: Translate, el: StaffElement): string {
  const value = valueWord(t, el.value, el.dotted, el.el === 'rest');
  return el.el === 'rest'
    ? value
    : t('staff.element_note', { name: noteWord(t, el.pitch.name), value });
}

/** Die Takte in Worten, jeder mit seiner Nummer — ein leerer Takt sagt, dass er leer ist. */
export function barsWords(t: Translate, bars: readonly StaffElement[][]): string {
  return bars
    .map((bar, i) =>
      t('staff.bar_list', {
        n: i + 1,
        list:
          bar.length === 0 ? t('staff.bar_empty') : bar.map((el) => elementWord(t, el)).join(', '),
      }),
    )
    .join('. ');
}

/**
 * Wo eine Stelle auf der Zeile liegt, in Worten: „auf der 2. Linie", „im 3. Zwischenraum",
 * „unter der Zeile".
 *
 * Das ist nicht Zierde, sondern notwendig: in einem Schlüssel kommt derselbe Tonname auf zwei
 * Stellen vor (im Violinschlüssel das E auf der untersten Linie und im vierten Zwischenraum).
 * Zwei Knöpfe, die gleich heißen, sind mit dem Screenreader nicht zu unterscheiden — und „auf
 * der 1. Linie" ist auch genau, wie ein Kind die Stelle denkt.
 */
export function stepWord(t: Translate, step: number): string {
  if (step > 4) return t('staff.above_staff');
  if (step < -4) return t('staff.below_staff');
  // Gerade Stufen sind Linien, ungerade Zwischenräume, beide von unten gezählt.
  return step % 2 === 0
    ? t('staff.on_line', { n: (step + 4) / 2 + 1 })
    : t('staff.in_space', { n: (step + 3) / 2 + 1 });
}

/** Die ganze gezeichnete Zeile als Satz — was ein Screenreader statt des Bildes hört. */
export function describeStaff(fig: StaffFigure, t: Translate): string {
  const head =
    fig.time === null
      ? clefWord(t, fig.clef)
      : t('staff.head', { clef: clefWord(t, fig.clef), time: timeWord(t, fig.time) });
  // Eine Zeile ohne Taktart ist ein einzelnes Zeichen oder eine Frage nach dem Takt: dann wäre
  // „Takt 1" eine Behauptung über etwas, was nicht dasteht.
  const body =
    fig.time === null && fig.bars.length === 1
      ? fig.bars[0]!.map((el) => elementWord(t, el)).join(', ')
      : barsWords(t, fig.bars);
  return `${head}. ${body}`;
}
