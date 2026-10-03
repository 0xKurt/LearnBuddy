// Die Geometrie der Notenzeile (issues #226, #275, #312): wo eine Stufe liegt und welche Stufe ein
// Finger getroffen hat. Sie steht hier, ohne VexFlow, und das mit Absicht:
//
//   · Die Schreibfläche (`practice/StaffAnswer.tsx`) legt ihre Tippziele und rechnet einen Tipp in
//     eine Stufe um, BEVOR die Notenschrift geladen ist (`useEngraver` lädt VexFlow erst auf einem
//     Bildschirm mit Notenzeile). Ein Tipp in diesem Moment muss trotzdem auf der Linie landen, die
//     er getroffen hat.
//   · Der Stecher (`engrave.ts`) zeichnet mit DENSELBEN Zahlen: eine Stufe ist ein halber
//     Linienabstand, die mittlere Linie ist Stufe 0, und der erste Takt beginnt bei `headUnits`.
//     Zwei Sätze Konstanten wären zwei Zeilen — eine, die man sieht, und eine, die man trifft.
//
// Einheiten: VexFlow rechnet mit 10 Einheiten je Linienabstand (`SPACE_UNITS`). Ein Bildschirm-
// Linienabstand (`gap`, in Punkten) ist also `gap / 10` Punkte je Einheit.

/** VexFlows Linienabstand in seinen eigenen Einheiten. */
export const SPACE_UNITS = 10;

/**
 * Wo die oberste der fünf Linien liegt, in Einheiten über dem oberen Rand eines VexFlow-Systems
 * (`Stave`, vier Linienabstände Luft darüber) — und daraus die mittlere Linie, Stufe 0.
 */
const TOP_LINE_UNITS = 4 * SPACE_UNITS;
const MIDDLE_UNITS = TOP_LINE_UNITS + 2 * SPACE_UNITS;

/** Wo eine Stufe in VexFlow-Einheiten liegt: 0 ist die mittlere Linie, +1 der Raum darüber. */
export function unitsOfStep(step: number): number {
  return MIDDLE_UNITS - (step * SPACE_UNITS) / 2;
}

/**
 * Wie weit die SCHREIBfläche reicht: vier Linienabstände über und unter der Mitte. Das trägt die
 * Hilfslinie (±6) mit ihrem Kopf, und ein Hals, der zur Mitte zeigt, ragt höchstens wenig über die
 * Zeile hinaus. Auf 360×740 unter einer langen Frage und Buddys Antwort genau der Platz, den es
 * gibt (issue #275).
 */
export const WRITE_REACH = { top: 8, bottom: -8 } as const;

/** Die Höhe der Schreibfläche bei diesem Linienabstand (Punkte). */
export function writeHeight(gap: number): number {
  return ((WRITE_REACH.top - WRITE_REACH.bottom) / 2) * gap;
}

/**
 * Welche Stufe an dieser Stelle der Schreibfläche liegt (`y` in Punkten von ihrem oberen Rand), und
 * der Grund, warum die Fläche hier mitrechnet: ein Tipp muss auf der Linie landen, die ihr Finger
 * getroffen hat, und nicht auf der, die ein zweiter Satz Konstanten meint.
 */
export function stepAtWriteY(y: number, gap: number): number {
  return Math.round(WRITE_REACH.top - (2 * y) / gap);
}

/**
 * Wie breit Schlüssel und Taktart am Zeilenanfang sind, in Einheiten — dort wird nicht geschrieben.
 * VexFlow misst einen Violinschlüssel mit 32,1, einen Bassschlüssel mit 32,9 Einheiten bis zur
 * ersten Note, mit Taktart 63,1 bis 65,2; wir setzen den Beginn des ersten Takts fest dahinter
 * (`Stave.setNoteStartX`), damit die Tippziele schon vor dem Laden der Notenschrift stimmen.
 */
export function headUnits(hasTime: boolean): number {
  return hasTime ? 68 : 36;
}

/** Wie viel Luft hinter dem Schlussstrich bleibt, in Einheiten. */
export const TAIL_UNITS = 4;
