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
// zwei Spalten bekommt) und die DEKLARIERTEN Werte (Buchstabenspalte, Abstände, Padding,
// Wortumbruch). Geometrie sieht sie nicht — jsdom legt nichts aus (docs/testing-layers.md).
// Dass auf 360 und 390 px wirklich keine Zeile mitten im Wort endet und die Karten einer
// Reihe gleich hoch sind, misst `tests/web/layout.spec.ts` im Browser.

import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { TOUCH } from '../../../lib/theme/space.js';
import { renderInApp, styleOf } from '../../../testing/render.js';
import { ChoiceList, GRID_CHARS_MAX, mathOnly, twoColumnChoices } from '../ChoiceList.js';

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

/** Die Buchstabenmarke vor einer Antwort (eine Spalte, kein Kreis). */
function letter(name: string): HTMLElement {
  const marks = screen.getAllByTestId('choice-letter');
  const mark = marks.find((m) => m.textContent === name);
  if (!mark) throw new Error(`keine Buchstabenmarke „${name}“`);
  return mark;
}

describe('welcher Satz Antworten zwei Spalten bekommt', () => {
  // Gemessen, nicht geraten: die Rechnung steht in ChoiceList.tsx. Wenn jemand Padding,
  // Buchstabenspalte oder Abstand ändert, wandert dieses Budget mit — und dieser Test sagt es.
  it('rechnet neun Zeichen als längste Antwort aus, die EINE Zeile einer halben Breite hält', () => {
    expect(GRID_CHARS_MAX).toBe(9);
  });

  it('nimmt kurze Antworten, die jede in eine Zeile passen', () => {
    expect(twoColumnChoices(['Paris', 'Lyon', 'Marseille', 'Nizza'])).toBe(true);
    expect(twoColumnChoices(['le cahier', 'la récré', 'le stylo', 'la gomme'])).toBe(true);
  });

  it('nimmt „the homework“ nicht mehr: zwei Zeilen neben einer — die unruhige Reihe aus #288', () => {
    expect(twoColumnChoices(['the homework', 'the eraser', 'the ruler', 'the pencil'])).toBe(false);
  });

  it('nimmt Zahlen und Brüche, auch groß gesetzt', () => {
    expect(twoColumnChoices(['2/3', '3/5'])).toBe(true);
    expect(twoColumnChoices(['$\\frac{2}{3}$', '$\\frac{3}{5}$'])).toBe(true);
    expect(twoColumnChoices(['$\\frac{12}{25}$', '$\\frac{3}{5}$'])).toBe(true);
  });

  it('lehnt „das Federmäppchen“ ab', () => {
    expect(twoColumnChoices(['das Federmäppchen', 'das Heft', 'der Füller', 'das Lineal'])).toBe(
      false,
    );
  });

  it('schickt den ganzen Satz in die volle Breite, sobald EINE Antwort nicht passt', () => {
    expect(twoColumnChoices(['die Hausaufgabe', 'das Heft', 'der Stift', 'die Mappe'])).toBe(false);
  });

  it('bleibt bei mehr als vier Antworten in der Liste', () => {
    expect(twoColumnChoices(['ja', 'nein', 'immer', 'nie', 'manchmal'])).toBe(false);
  });

  it('entscheidet nichts bei leerer Liste', () => {
    expect(twoColumnChoices([])).toBe(false);
  });
});

describe('was als Mathe allein steht', () => {
  it('erkennt einen Bruch oder Term ohne Worte drumherum', () => {
    expect(mathOnly('$\\frac{2}{3}$')).toBe(true);
    expect(mathOnly(' $x^{2}$ ')).toBe(true);
    expect(mathOnly('etwa $\\frac{2}{3}$')).toBe(false);
    expect(mathOnly('2/3')).toBe(false);
  });
});

describe('wie das Raster gesetzt ist', () => {
  it('stellt kurze Antworten in eine umbrechende Reihe, je halbe Breite', () => {
    show(['Paris', 'Lyon']);
    const { button } = pill('Paris');
    const card = button.parentElement!;
    const row = card.parentElement!;
    expect(styleOf(row).flexDirection).toBe('row');
    expect(styleOf(row).flexWrap).toBe('wrap');
    expect(styleOf(card).flexBasis).toBe('45%');
  });

  it('stellt lange Antworten untereinander, jede über die ganze Breite', () => {
    show(['Paris an der Seine', 'Lyon']);
    const card = pill('Paris an der Seine').button.parentElement!;
    const column = card.parentElement!;
    // Keine Reihe: die Spalte ist die Vorgabe von View, also sagt sie gar nichts.
    expect(styleOf(column).flexDirection).not.toBe('row');
    expect(styleOf(card).flexBasis).not.toBe('45%');
  });

  it('setzt den Buchstaben als Marke in eine feste Spalte, nicht als Kreis', () => {
    for (const set of [
      ['Paris', 'Lyon'],
      ['Paris an der Seine', 'Lyon'],
    ]) {
      const view = renderInApp(
        <ChoiceList choices={set} tried={NOTHING_TRIED} disabled={false} onChoose={() => {}} />,
      );
      const mark = letter('A');
      expect(styleOf(mark).width).toBe('16px');
      // Kein Kreis: keine Fläche, kein Rund.
      expect(['', 'transparent', 'rgba(0, 0, 0, 0)']).toContain(styleOf(mark).backgroundColor);
      expect(['', '0px']).toContain(styleOf(mark).borderRadius);
      // Dasselbe Padding im Raster und in der Liste: die Texte beginnen auf einer Linie.
      expect(styleOf(pill(set[0]!).inner).paddingLeft).toBe('12px');
      view.unmount();
    }
  });

  it('hält das Touch-Ziel bei mindestens 44 pt', () => {
    show(['2/3', '3/5']);
    const minHeight = Number.parseFloat(styleOf(pill('2/3').inner).minHeight);
    expect(minHeight).toBeGreaterThanOrEqual(TOUCH);
  });

  it('lässt die Kachel von ihrem Knopf gefüllt werden (gleich hohe Kacheln einer Reihe)', () => {
    show(['2/3', '3/5']);
    // `grow` auf dem Btn: der Knopf wächst mit der Kachel, die ihrerseits auf die Höhe der
    // Reihe gestreckt wird. Ohne das endet die tippbare Fläche über dem Kachelrand.
    expect(styleOf(pill('2/3').button).flexGrow).toBe('1');
  });

  it('setzt einen Bruch allein groß und mittig', () => {
    show(['$\\frac{2}{3}$', '$\\frac{3}{5}$']);
    const mark = letter('A');
    const content = mark.nextElementSibling!;
    expect(styleOf(content).alignItems).toBe('center');
  });
});

describe('nie mitten im Wort', () => {
  it('verlangt im Raster ganze Wörter', () => {
    show(['Paris', 'Lyon', 'Marseille', 'Nizza']);
    const style = styleOf(screen.getByText('Marseille'));
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
