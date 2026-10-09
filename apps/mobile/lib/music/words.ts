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
// übereinander geschickt werden. Welcher Schlüssel zu einem Ton, Wert, Schlüssel oder einer
// Taktart gehört, steht dagegen nur einmal: `staffWords` in `contracts/staff.ts` (issue #311).
//
// Auf Deutsch heißt `B` das **H** und `A#` das **Ais**; auf Französisch **Si** und
// **La dièse**. Keine dieser Zuordnungen steht im Code: ein Name ist Daten, sein Wort ist
// Übersetzung (`contracts/staff.ts`).

import {
  staffWords,
  type NoteValue,
  type StaffElement,
  type StaffFigure,
} from '@learnbuddy/shared-types/contracts';

import type { Translate } from '../i18n/index.js';

/** Die Wörter der Zeile (`contracts/staff.ts`), hier unter `staff.*` in `math.json`. */
function words(t: Translate) {
  return staffWords((key, values) => t(`staff.${key}`, values));
}

/** „Viertelnote" / „Viertelpause", und „punktierte Viertelnote", wenn ein Punkt dahinter steht. */
export function valueWord(t: Translate, value: NoteValue, dotted: boolean, rest: boolean): string {
  return words(t).value(value, dotted, rest);
}

/** Ein Zeichen in Worten: „C als Viertelnote", „Viertelpause". */
export function elementWord(t: Translate, el: StaffElement): string {
  return words(t).element(el);
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
  const say = words(t);
  const head =
    fig.time === null
      ? say.clef(fig.clef)
      : t('staff.head', { clef: say.clef(fig.clef), time: say.time(fig.time) });
  // Eine Zeile ohne Taktart ist ein einzelnes Zeichen oder eine Frage nach dem Takt: dann wäre
  // „Takt 1" eine Behauptung über etwas, was nicht dasteht.
  const body =
    fig.time === null && fig.bars.length === 1
      ? fig.bars[0]!.map((el) => elementWord(t, el)).join(', ')
      : barsWords(t, fig.bars);
  return `${head}. ${body}`;
}
