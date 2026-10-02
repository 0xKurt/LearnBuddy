// Das Brett, auf dem sie anordnet (issues #228–#230). Was hier festgehalten wird, ist genau
// das, was zwischen „es sieht richtig aus" und „sie kann damit arbeiten" liegt:
//
//   · jedes Stück ist ein echter Knopf, dessen NAME seinen Zustand in Worten sagt — ein
//     `role="button"` darf kein `aria-selected`/`aria-checked` tragen (axe lässt dafür den
//     ganzen Bildschirm durchfallen, `FractionBarAnswer.test.tsx` hält den Grund fest), also
//     ist der Name der einzige Weg, auf dem „als 3 gesetzt" bei ihr ankommt;
//   · ein zweiter Tipp nimmt zurück, und die Nummern zählen dabei neu durch: 1, 2, 3 ohne
//     Loch („Rückgängig statt Bestätigen", `docs/UX-PRINCIPLES.md`);
//   · ein Tipp, der nichts tun kann (rechts, bevor links etwas gewählt ist), bleibt nicht
//     stumm, sondern sagt am Stück selbst, was zuerst dran ist;
//   · die Teile, die herausgehen, sind genau die, die der Server annimmt — jedes Fach einmal,
//     keines leer (`packages/shared-types/src/contracts/parts.ts`).
//
// Die Sätze stehen hier als deutsche Sätze und nicht als Schlüssel: die Texte kommen aus den
// echten Locale-Dateien, und was hier steht, ist, was sie hört.
//
// Was diese Schicht nicht sehen kann: Geometrie. Dass ein Brett auf ein 360×740-Handy passt,
// misst der Browser (tests/web/fit.ts); die Rechnung dazu steht in `app/practice/[id].tsx`
// über dem Brett-Bereich.

import type { PartsBoard } from '@learnbuddy/shared-types/contracts';
import { fireEvent, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';

import { renderInApp, styleOf } from '../../../testing/render.js';
import {
  boardComplete,
  EMPTY_BOARD_ANSWER,
  partsOf,
  PartsBoardAnswer,
  renderBoardAnswer,
  viaFor,
  type BoardAnswer,
} from '../PartsBoardAnswer.js';

/** Das Brett mit ihrer Anordnung, wie der Übungsbildschirm es hält (State pro Frage). */
function show(board: PartsBoard, disabled = false) {
  const seen: { answer: BoardAnswer } = { answer: EMPTY_BOARD_ANSWER };
  function Harness() {
    const [answer, setAnswer] = useState<BoardAnswer>(EMPTY_BOARD_ANSWER);
    seen.answer = answer;
    return (
      <PartsBoardAnswer board={board} answer={answer} disabled={disabled} onChange={setAnswer} />
    );
  }
  renderInApp(<Harness />);
  return seen;
}

const tap = (name: string) => fireEvent.click(screen.getByRole('button', { name }));

/** Kein Knopf trägt einen Zustand als ARIA-Attribut; er trägt ihn im Namen. */
function noStateAttributes() {
  for (const button of screen.getAllByRole('button')) {
    expect(button.hasAttribute('aria-selected'), button.getAttribute('aria-label') ?? '').toBe(
      false,
    );
    expect(button.hasAttribute('aria-checked'), button.getAttribute('aria-label') ?? '').toBe(
      false,
    );
  }
}

// ─────────────── ordnen ───────────────

const ORDER: PartsBoard = {
  form: 'order',
  elements: [
    { ref: 'e1', text: 'Blüte' },
    { ref: 'e2', text: 'Keimung' },
    { ref: 'e3', text: 'Frucht' },
    { ref: 'e4', text: 'Samen' },
    { ref: 'e5', text: 'Wachstum' },
  ],
};

describe('eine Reihenfolge', () => {
  it('nennt jedes Stück, seinen Platz im Brett und dass es noch nicht gesetzt ist', () => {
    show(ORDER);
    expect(screen.getAllByRole('button').map((b) => b.getAttribute('aria-label'))).toEqual([
      'Blüte, Element 1 von 5, noch nicht gesetzt',
      'Keimung, Element 2 von 5, noch nicht gesetzt',
      'Frucht, Element 3 von 5, noch nicht gesetzt',
      'Samen, Element 4 von 5, noch nicht gesetzt',
      'Wachstum, Element 5 von 5, noch nicht gesetzt',
    ]);
    expect(screen.getByText('0 von 5 gesetzt')).toBeDefined();
    noStateAttributes();
  });

  it('gibt dem angetippten Stück die nächste freie Nummer', () => {
    const seen = show(ORDER);
    tap('Keimung, Element 2 von 5, noch nicht gesetzt');
    tap('Wachstum, Element 5 von 5, noch nicht gesetzt');
    tap('Blüte, Element 1 von 5, noch nicht gesetzt');
    expect(partsOf(seen.answer)).toEqual([
      { slot: 'p1', value: 'e2' },
      { slot: 'p2', value: 'e5' },
      { slot: 'p3', value: 'e1' },
    ]);
    // Die Nummer steht als Text auf dem Stück, nicht nur in seiner Farbe.
    expect(screen.getByText('2')).toBeDefined();
    expect(screen.getByText('3 von 5 gesetzt')).toBeDefined();
    expect(
      screen.getByRole('button', {
        name: 'Keimung, als 1 gesetzt, nochmal tippen nimmt es zurück',
      }),
    ).toBeDefined();
    noStateAttributes();
  });

  it('zählt nach dem Zurücknehmen neu durch — 1, 2, 3 ohne Loch', () => {
    const seen = show(ORDER);
    tap('Keimung, Element 2 von 5, noch nicht gesetzt');
    tap('Wachstum, Element 5 von 5, noch nicht gesetzt');
    tap('Blüte, Element 1 von 5, noch nicht gesetzt');
    // Die 2 heraus: was dahinter stand, rutscht vor.
    tap('Wachstum, als 2 gesetzt, nochmal tippen nimmt es zurück');
    expect(partsOf(seen.answer)).toEqual([
      { slot: 'p1', value: 'e2' },
      { slot: 'p2', value: 'e1' },
    ]);
    expect(screen.getByText('2 von 5 gesetzt')).toBeDefined();
    expect(
      screen.getByRole('button', {
        name: 'Wachstum, Element 5 von 5, noch nicht gesetzt',
      }),
    ).toBeDefined();
  });

  it('ist erst vollständig, wenn jedes Element seinen Platz hat', () => {
    const seen = show(ORDER);
    for (const [text, n] of [
      ['Blüte', 1],
      ['Keimung', 2],
      ['Frucht', 3],
      ['Samen', 4],
    ] as const) {
      tap(`${text}, Element ${n} von 5, noch nicht gesetzt`);
      expect(boardComplete(ORDER, seen.answer)).toBe(false);
    }
    tap('Wachstum, Element 5 von 5, noch nicht gesetzt');
    expect(boardComplete(ORDER, seen.answer)).toBe(true);
    expect(renderBoardAnswer(ORDER, seen.answer)).toBe(
      'Blüte → Keimung → Frucht → Samen → Wachstum',
    );
    expect(viaFor(ORDER)).toBe('tapped');
  });

  // CLAUDE.md Regel 13, und die Regel, die das Gedächtnis des Owners als CRITICAL führt: ein
  // Hintergrund auf dem `Pressable` malt auf React Native 0.73+ stumm nicht. Im Browser sieht
  // es perfekt aus — genau so kommt es aufs Handy.
  it('malt ein Stück auf der inneren View, nie auf dem Pressable', () => {
    show(ORDER);
    const piece = screen.getByRole('button', {
      name: 'Keimung, Element 2 von 5, noch nicht gesetzt',
    });
    expect(styleOf(piece).backgroundColor).toBe('rgba(0, 0, 0, 0)');
    const inner = piece.firstElementChild;
    expect(inner, 'ein Stück braucht eine innere View, auf der es malt').not.toBeNull();
    expect(styleOf(inner as Element).backgroundColor).not.toBe('rgba(0, 0, 0, 0)');
  });

  it('tut nichts, während eine Antwort unterwegs ist', () => {
    const seen = show(ORDER, true);
    const piece = screen.getByRole('button', {
      name: 'Keimung, Element 2 von 5, noch nicht gesetzt',
    });
    expect((piece as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(piece);
    expect(seen.answer.size).toBe(0);
  });
});

// ─────────────── zuordnen ───────────────

const PAIRS: PartsBoard = {
  form: 'match_pairs',
  left: [
    { ref: 'l1', text: 'Herz' },
    { ref: 'l2', text: 'Lunge' },
    { ref: 'l3', text: 'Niere' },
  ],
  right: [
    { ref: 'r1', text: 'filtert das Blut' },
    { ref: 'r2', text: 'nimmt Sauerstoff auf' },
    { ref: 'r3', text: 'pumpt das Blut' },
  ],
};

describe('eine Zuordnung', () => {
  it('macht aus links und dann rechts das erste Paar', () => {
    const seen = show(PAIRS);
    tap('Lunge, noch ohne Paar, tippen wählt es aus');
    expect(
      screen.getByRole('button', {
        name: 'Lunge, ausgewählt, tippe jetzt rechts, was dazu gehört',
      }),
    ).toBeDefined();
    tap('nimmt Sauerstoff auf, noch ohne Paar');
    expect(partsOf(seen.answer)).toEqual([{ slot: 'l2', value: 'r2' }]);
    // Die Paar-Nummer steht auf BEIDEN Seiten, als Text.
    expect(
      screen.getByRole('button', { name: 'Lunge, Paar 1, nochmal tippen löst das Paar' }),
    ).toBeDefined();
    expect(
      screen.getByRole('button', {
        name: 'nimmt Sauerstoff auf, Paar 1, nochmal tippen löst das Paar',
      }),
    ).toBeDefined();
    expect(screen.getByText('1 von 3 Paaren gebildet')).toBeDefined();
    noStateAttributes();
  });

  it('löst das Paar, egal welche Seite sie antippt', () => {
    const seen = show(PAIRS);
    tap('Lunge, noch ohne Paar, tippen wählt es aus');
    tap('nimmt Sauerstoff auf, noch ohne Paar');
    tap('Lunge, Paar 1, nochmal tippen löst das Paar');
    expect(partsOf(seen.answer)).toEqual([]);
    tap('Herz, noch ohne Paar, tippen wählt es aus');
    tap('pumpt das Blut, noch ohne Paar');
    expect(partsOf(seen.answer)).toEqual([{ slot: 'l1', value: 'r3' }]);
    tap('pumpt das Blut, Paar 1, nochmal tippen löst das Paar');
    expect(partsOf(seen.answer)).toEqual([]);
  });

  it('zählt die übrigen Paare neu durch', () => {
    const seen = show(PAIRS);
    tap('Herz, noch ohne Paar, tippen wählt es aus');
    tap('pumpt das Blut, noch ohne Paar');
    tap('Lunge, noch ohne Paar, tippen wählt es aus');
    tap('nimmt Sauerstoff auf, noch ohne Paar');
    expect(screen.getByText('2 von 3 Paaren gebildet')).toBeDefined();
    // Das erste Paar löst sich: das zweite ist jetzt das erste.
    tap('Herz, Paar 1, nochmal tippen löst das Paar');
    expect(
      screen.getByRole('button', { name: 'Lunge, Paar 1, nochmal tippen löst das Paar' }),
    ).toBeDefined();
    expect(partsOf(seen.answer)).toEqual([{ slot: 'l2', value: 'r2' }]);
  });

  // Der Tipp führt zu nichts — aber das Stück bleibt bedienbar und erklärt sich: auf dem
  // Handy über `accessibilityHint` („Wähle zuerst links etwas aus."), und auf dem Bildschirm
  // über die Zeile darüber, die genau das sagt. react-native-web gibt `accessibilityHint`
  // nicht ins DOM weiter (es ist eine iOS/Android-Eigenschaft), deshalb ist die sichtbare
  // Zeile das, was diese Schicht prüfen KANN — die Zusage am Stück selbst gilt auf dem Gerät
  // und ist hier nicht nachweisbar.
  it('bleibt bei einem Tipp rechts ohne offene linke Seite unverändert — und sagt, was fehlt', () => {
    const seen = show(PAIRS);
    expect(screen.getByText('Tippe links etwas an, dann rechts, was dazu gehört.')).toBeDefined();
    const right = screen.getByRole('button', { name: 'filtert das Blut, noch ohne Paar' });
    expect((right as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(right);
    expect(seen.answer.size).toBe(0);
    expect(screen.getByText('0 von 3 Paaren gebildet')).toBeDefined();
  });

  it('nimmt die Auswahl zurück, wenn sie dieselbe linke Seite nochmal antippt', () => {
    const seen = show(PAIRS);
    tap('Niere, noch ohne Paar, tippen wählt es aus');
    tap('Niere, ausgewählt, tippe jetzt rechts, was dazu gehört');
    expect(
      screen.getByRole('button', { name: 'Niere, noch ohne Paar, tippen wählt es aus' }),
    ).toBeDefined();
    expect(seen.answer.size).toBe(0);
  });

  it('ist erst vollständig, wenn jede linke Seite ihr Paar hat', () => {
    const seen = show(PAIRS);
    tap('Herz, noch ohne Paar, tippen wählt es aus');
    tap('pumpt das Blut, noch ohne Paar');
    tap('Lunge, noch ohne Paar, tippen wählt es aus');
    tap('nimmt Sauerstoff auf, noch ohne Paar');
    expect(boardComplete(PAIRS, seen.answer)).toBe(false);
    tap('Niere, noch ohne Paar, tippen wählt es aus');
    tap('filtert das Blut, noch ohne Paar');
    expect(boardComplete(PAIRS, seen.answer)).toBe(true);
    expect(renderBoardAnswer(PAIRS, seen.answer)).toBe(
      'Herz – pumpt das Blut; Lunge – nimmt Sauerstoff auf; Niere – filtert das Blut',
    );
  });
});

// ─────────────── einsortieren ───────────────

const GROUPS: PartsBoard = {
  form: 'match_groups',
  groups: [
    { ref: 'g1', text: 'Nomen' },
    { ref: 'g2', text: 'Verben' },
  ],
  elements: [
    { ref: 'e1', text: 'Hund' },
    { ref: 'e2', text: 'laufen' },
    { ref: 'e3', text: 'Haus' },
    { ref: 'e4', text: 'singen' },
  ],
};

describe('Gruppen', () => {
  it('sortiert ein gewähltes Element in die angetippte Gruppe', () => {
    const seen = show(GROUPS);
    tap('Hund, noch nicht einsortiert, tippen wählt es aus');
    expect(
      screen.getByRole('button', { name: 'Hund, ausgewählt, tippe jetzt die Gruppe an' }),
    ).toBeDefined();
    tap('In Nomen einsortieren');
    expect(partsOf(seen.answer)).toEqual([{ slot: 'e1', value: 'g1' }]);
    expect(screen.getByText('1 von 4 einsortiert')).toBeDefined();
    noStateAttributes();
  });

  it('holt ein einsortiertes Element wieder heraus', () => {
    const seen = show(GROUPS);
    tap('Hund, noch nicht einsortiert, tippen wählt es aus');
    tap('In Nomen einsortieren');
    tap('Hund, in Nomen, nochmal tippen holt es zurück');
    expect(partsOf(seen.answer)).toEqual([]);
    expect(
      screen.getByRole('button', { name: 'Hund, noch nicht einsortiert, tippen wählt es aus' }),
    ).toBeDefined();
  });

  it('bleibt bei einem Tipp auf eine Gruppe ohne gewähltes Element unverändert', () => {
    const seen = show(GROUPS);
    // Wie bei der Zuordnung: der Hinweis am Fach gilt auf dem Gerät, die sichtbare Zeile
    // darüber sagt dasselbe und ist das, was hier nachweisbar ist.
    expect(
      screen.getByText('Tippe ein Element an, dann die Gruppe, in die es gehört.'),
    ).toBeDefined();
    const group = screen.getByRole('button', { name: 'In Verben einsortieren' });
    expect((group as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(group);
    expect(seen.answer.size).toBe(0);
  });

  it('ist erst vollständig, wenn jedes Element in einer Gruppe liegt', () => {
    const seen = show(GROUPS);
    for (const [text, group] of [
      ['Hund', 'Nomen'],
      ['laufen', 'Verben'],
      ['Haus', 'Nomen'],
    ] as const) {
      tap(`${text}, noch nicht einsortiert, tippen wählt es aus`);
      tap(`In ${group} einsortieren`);
      expect(boardComplete(GROUPS, seen.answer)).toBe(false);
    }
    tap('singen, noch nicht einsortiert, tippen wählt es aus');
    tap('In Verben einsortieren');
    expect(boardComplete(GROUPS, seen.answer)).toBe(true);
    expect(renderBoardAnswer(GROUPS, seen.answer)).toBe(
      'Nomen: Hund, Haus · Verben: laufen, singen',
    );
  });
});

// ─────────────── eine Tabelle füllen ───────────────

const TABLE: PartsBoard = {
  form: 'table_fill',
  header: ['Person', 'Präsens'],
  rows: [
    [
      { cell: 'given', text: 'ich' },
      { cell: 'gap', ref: 'c1', expect: 'word' },
    ],
    [
      { cell: 'given', text: 'du' },
      { cell: 'gap', ref: 'c2', expect: 'word' },
    ],
  ],
};

const write = (name: string, value: string) =>
  fireEvent.change(screen.getByLabelText(name), { target: { value } });

describe('eine Tabelle', () => {
  it('nennt jede Lücke nach ihrer Spalte und ihrer Zeile', () => {
    show(TABLE);
    expect(screen.getByLabelText('Präsens bei ich, noch leer')).toBeDefined();
    expect(screen.getByLabelText('Präsens bei du, noch leer')).toBeDefined();
    expect(screen.getByText('0 von 2 Feldern gefüllt')).toBeDefined();
  });

  it('macht aus dem, was sie schreibt, die Teile der Antwort', () => {
    const seen = show(TABLE);
    write('Präsens bei ich, noch leer', 'gehe');
    expect(boardComplete(TABLE, seen.answer)).toBe(false);
    write('Präsens bei du, noch leer', 'gehst');
    expect(partsOf(seen.answer)).toEqual([
      { slot: 'c1', value: 'gehe' },
      { slot: 'c2', value: 'gehst' },
    ]);
    expect(boardComplete(TABLE, seen.answer)).toBe(true);
    expect(screen.getByText('2 von 2 Feldern gefüllt')).toBeDefined();
    expect(screen.getByLabelText('Präsens bei ich, gehe')).toBeDefined();
    expect(renderBoardAnswer(TABLE, seen.answer)).toBe('gehe; gehst');
    // Sie SCHREIBT hier, auch wenn „Prüfen" die Antwort schickt (issue #163).
    expect(viaFor(TABLE)).toBe('typed');
  });

  it('ist nicht vollständig, solange eine Lücke nur Leerzeichen hält', () => {
    const seen = show(TABLE);
    write('Präsens bei ich, noch leer', 'gehe');
    write('Präsens bei du, noch leer', '   ');
    expect(boardComplete(TABLE, seen.answer)).toBe(false);
    expect(partsOf(seen.answer)).toEqual([{ slot: 'c1', value: 'gehe' }]);
  });

  it('zählt Spalte und Zeile, wo die Tabelle selbst keine Namen hergibt', () => {
    const bare: PartsBoard = {
      form: 'table_fill',
      header: ['', 'Zehner'],
      rows: [
        [
          { cell: 'gap', ref: 'c1', expect: 'number' },
          { cell: 'gap', ref: 'c2', expect: 'number' },
        ],
      ],
    };
    show(bare);
    // Kein Spaltenkopf und kein gedruckter Zeilenanfang: dann wird gezählt.
    expect(screen.getByLabelText('Spalte 1, Zeile 1, noch leer')).toBeDefined();
    // Ein Spaltenkopf, aber kein Zeilenanfang: der Kopf und die Zeilennummer.
    expect(screen.getByLabelText('Zehner, Zeile 1, noch leer')).toBeDefined();
  });

  // Tastaturzubehör, kein Möbel (issue #16): die Rechentasten gehören zu einer Zahlenlücke,
  // und nur, solange sie darin schreibt — bei einem Wort wäre sie eine Reihe, die nichts tut.
  it('stellt die Rechentasten nur neben eine Zahlenlücke, die gerade geschrieben wird', () => {
    const mixed: PartsBoard = {
      form: 'table_fill',
      header: ['Zahl', 'Wort'],
      rows: [
        [
          { cell: 'gap', ref: 'c1', expect: 'number' },
          { cell: 'gap', ref: 'c2', expect: 'word' },
        ],
      ],
    };
    const seen = show(mixed);
    const keys = () => screen.queryByRole('toolbar', { name: 'Mathe-Zeichen' });
    expect(keys()).toBeNull();
    fireEvent.focus(screen.getByLabelText('Zahl, Zeile 1, noch leer'));
    expect(keys()).not.toBeNull();
    // Und eine Taste schreibt in genau diese Lücke, an ihren Cursor (`insertAtCursor`).
    tap('Bruchstrich');
    expect(partsOf(seen.answer)).toEqual([{ slot: 'c1', value: '/' }]);
    fireEvent.blur(screen.getByLabelText('Zahl, Zeile 1, /'));
    fireEvent.focus(screen.getByLabelText('Wort, Zeile 1, noch leer'));
    expect(keys()).toBeNull();
  });
});

// ─────────────── die Teile selbst ───────────────

describe('die Teile, die herausgehen', () => {
  it('nennt jedes Fach einmal, sortiert, ohne leere', () => {
    const answer = new Map([
      ['c10', 'zehn'],
      ['c2', 'zwei'],
      ['c1', ' eins '],
      ['c3', '  '],
    ]);
    expect(partsOf(answer)).toEqual([
      { slot: 'c1', value: 'eins' },
      { slot: 'c2', value: 'zwei' },
      { slot: 'c10', value: 'zehn' },
    ]);
  });

  it('ist leer, solange sie nichts angeordnet hat', () => {
    expect(partsOf(EMPTY_BOARD_ANSWER)).toEqual([]);
    expect(boardComplete(ORDER, EMPTY_BOARD_ANSWER)).toBe(false);
    expect(boardComplete(PAIRS, EMPTY_BOARD_ANSWER)).toBe(false);
    expect(boardComplete(GROUPS, EMPTY_BOARD_ANSWER)).toBe(false);
    expect(boardComplete(TABLE, EMPTY_BOARD_ANSWER)).toBe(false);
  });
});
