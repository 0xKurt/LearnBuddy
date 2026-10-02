// Antwortkarten: wo die Wörter stehen dürfen und wo sie brechen (Issue #203).
//
// Im Produktvideo des Owners (02.10.) stand die Antwort A als „the / homewor / k“ — drei
// Zeilen, mitten im Wort getrennt, und die Karte dadurch höher als ihre Nachbarin. Zwei
// Ursachen, beide in `ChoiceList.tsx`: die Entscheidung für das 2er-Raster zählte nur
// ZEICHEN (12 ≤ 14) und fragte nie, ob das längste WORT in eine halbe Zeile passt; und
// react-native-web gibt jedem `<Text>` `word-wrap: break-word` mit, trennt also lieber im
// Wort als in die nächste Zeile zu gehen.
//
// Diese Schicht hält fest, was sie halten kann: die ENTSCHEIDUNG (welcher Satz Antworten
// zwei Spalten bekommt) und die DEKLARIERTEN Werte (Buchstabenkreis, Abstände, Padding,
// Wortumbruch). Geometrie sieht sie nicht — jsdom legt nichts aus (docs/testing-layers.md).
// Dass auf 360 und 390 px wirklich keine Zeile mitten im Wort endet und die Karten einer
// Reihe gleich hoch sind, misst `tests/web/layout.spec.ts` im Browser.

import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { TOUCH } from '../../../lib/theme/space.js';
import { renderInApp, styleOf } from '../../../testing/render.js';
import { ChoiceList, GRID_CHARS_MAX, GRID_WORD_MAX, twoColumnChoices } from '../ChoiceList.js';

const NOTHING_TRIED: ReadonlySet<string> = new Set();

function show(choices: string[]): void {
  renderInApp(
    <ChoiceList choices={choices} tried={NOTHING_TRIED} disabled={false} onChoose={() => {}} />,
  );
}

/** Die Pille einer Antwort (der `Btn`) und ihr innerer Kasten, der das Padding trägt. */
function pill(name: string): { button: HTMLElement; inner: Element } {
  const button = screen.getByRole('button', { name });
  const inner = button.firstElementChild;
  if (!inner) throw new Error(`der Knopf „${name}“ hat keinen inneren Kasten`);
  return { button, inner };
}

/** Der runde Buchstabenkreis vor einer Antwort (der Kasten um den Buchstaben). */
function badge(letter: string): Element {
  const text = screen.getByText(letter);
  const box = text.parentElement;
  if (!box) throw new Error(`der Buchstabe „${letter}“ steht in keinem Kreis`);
  return box;
}

describe('welcher Satz Antworten zwei Spalten bekommt', () => {
  // Gemessen, nicht geraten: die Rechnung steht in ChoiceList.tsx. Wenn jemand Padding,
  // Kreis oder Abstand ändert, wandert dieses Budget mit — und dieser Test sagt es.
  it('rechnet neun Zeichen als längstes Wort aus, das eine halbe Zeile hält', () => {
    expect(GRID_WORD_MAX).toBe(9);
    expect(GRID_CHARS_MAX).toBe(14);
  });

  it('nimmt kurze Vokabeln: „le cahier“, „la récré“ und Geschwister', () => {
    expect(twoColumnChoices(['le cahier', 'la récré', 'le stylo', 'la gomme'])).toBe(true);
  });

  it('nimmt „the homework“: zwölf Zeichen, längstes Wort acht — beides passt', () => {
    expect(twoColumnChoices(['the homework', 'the eraser', 'the ruler', 'the pencil'])).toBe(true);
  });

  it('nimmt Zahlen und Brüche', () => {
    expect(twoColumnChoices(['2/3', '3/5'])).toBe(true);
    expect(twoColumnChoices(['$\\frac{2}{3}$', '$\\frac{3}{5}$'])).toBe(true);
  });

  it('lehnt „das Federmäppchen“ ab: dreizehn Buchstaben in einem Stück', () => {
    expect(twoColumnChoices(['das Federmäppchen', 'das Heft', 'der Füller', 'das Lineal'])).toBe(
      false,
    );
  });

  it('lehnt „der Stundenplan“ ab — elf Buchstaben passen in keine halbe Zeile', () => {
    expect(twoColumnChoices(['der Stundenplan', 'die Pause'])).toBe(false);
  });

  it('lehnt „the exercise book“ ab: als Ganzes zu lang', () => {
    expect(twoColumnChoices(['the exercise book', 'the pen'])).toBe(false);
  });

  it('schickt den ganzen Satz in die volle Breite, sobald EIN Wort nicht passt', () => {
    // „Hausaufgabe“ ist das eine zu lange Wort; die anderen drei wären Raster.
    expect(twoColumnChoices(['die Hausaufgabe', 'das Heft', 'der Stift', 'die Mappe'])).toBe(false);
  });

  it('bleibt bei mehr als vier Antworten in der Liste', () => {
    expect(twoColumnChoices(['ja', 'nein', 'immer', 'nie', 'manchmal'])).toBe(false);
  });

  it('entscheidet nichts bei leerer Liste', () => {
    expect(twoColumnChoices([])).toBe(false);
  });
});

describe('wie das Raster gesetzt ist', () => {
  it('stellt kurze Antworten in eine umbrechende Reihe, je halbe Breite', () => {
    show(['2/3', '3/5']);
    const { button } = pill('2/3');
    const card = button.parentElement!;
    const row = card.parentElement!;
    expect(styleOf(row).flexDirection).toBe('row');
    expect(styleOf(row).flexWrap).toBe('wrap');
    expect(styleOf(card).flexBasis).toBe('45%');
  });

  it('stellt lange Antworten untereinander, jede über die ganze Breite', () => {
    show(['der Stundenplan', 'die Pause']);
    const card = pill('der Stundenplan').button.parentElement!;
    const column = card.parentElement!;
    // Keine Reihe: die Spalte ist die Vorgabe von View, also sagt sie gar nichts.
    expect(styleOf(column).flexDirection).not.toBe('row');
    expect(styleOf(card).flexBasis).not.toBe('45%');
  });

  it('macht im Raster den Buchstabenkreis klein (26 statt 34) und das Padding eng (12 statt 22)', () => {
    show(['2/3', '3/5']);
    expect(styleOf(badge('A')).width).toBe('26px');
    expect(styleOf(badge('A')).height).toBe('26px');
    expect(styleOf(pill('2/3').inner).paddingLeft).toBe('12px');
    expect(styleOf(pill('2/3').inner).paddingRight).toBe('12px');
  });

  it('lässt der vollen Breite ihren großen Kreis und ihr Padding', () => {
    show(['der Stundenplan', 'die Pause']);
    expect(styleOf(badge('A')).width).toBe('34px');
    expect(styleOf(pill('der Stundenplan').inner).paddingLeft).toBe('22px');
  });

  it('hält das Touch-Ziel auch im engen Raster bei mindestens 44 pt', () => {
    show(['2/3', '3/5']);
    const minHeight = Number.parseFloat(styleOf(pill('2/3').inner).minHeight);
    expect(minHeight).toBeGreaterThanOrEqual(TOUCH);
  });

  it('lässt die Karte im Raster von ihrem Knopf gefüllt werden (gleich hohe Karten einer Reihe)', () => {
    show(['2/3', '3/5']);
    // `grow` auf dem Btn: der Knopf wächst mit der Karte, die ihrerseits auf die Höhe der
    // Reihe gestreckt wird. Ohne das endet die tippbare Fläche über dem Kartenrand.
    expect(styleOf(pill('2/3').button).flexGrow).toBe('1');
  });
});

describe('nie mitten im Wort', () => {
  it('verlangt im Raster ganze Wörter: „the homework“ bricht am Leerzeichen oder nicht', () => {
    show(['the homework', 'the eraser', 'the ruler', 'the pencil']);
    const style = styleOf(screen.getByText('the homework'));
    expect(style.overflowWrap).toBe('normal');
    expect(style.wordBreak).toBe('normal');
  });

  it('verlangt ganze Wörter auch in der vollen Breite, wo die Zeile dafür reicht', () => {
    show(['das Federmäppchen', 'das Heft']);
    expect(styleOf(screen.getByText('das Federmäppchen')).overflowWrap).toBe('normal');
  });

  it('lässt nur dort trennen, wo ein Wort in keine Zeile passt', () => {
    // Länger als die volle Breite (21 Zeichen) hält: hier ist Trennen das kleinere Übel,
    // sonst läuft das Wort aus der Karte heraus.
    const monster = 'Donaudampfschifffahrtsgesellschaft';
    show([monster, 'das Schiff']);
    expect(styleOf(screen.getByText(monster)).overflowWrap).not.toBe('normal');
  });
});
