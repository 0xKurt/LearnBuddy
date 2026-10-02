// Markieren (issue #234): antippen markiert, nochmal antippen nimmt zurück; mit Kategorien erst
// die Kategorie, dann die Wörter. Was hier festgehalten wird:
//
//   · jedes Ziel (Wort, Lücke, Buchstabe) ist ein Button mit Namen, und der Name sagt die
//     Markierung in Worten — die Farbe ist nie das einzige Signal; unter dem Text steht, was
//     markiert ist, als Text („Markiert: Hund");
//   · „Prüfen" wartet auf die erste Markierung und schickt `parts` — Ids, nie Texte;
//   · ein Komma ist ein Komma, eine Silbengrenze ein Bindestrich.
//
// Was diese Schicht nicht sehen kann: ob 24 Wörter auf 360×740 passen und jedes Ziel 44 pt hat.
// Das misst der Walkthrough (tests/web/modes.spec.ts, tests/web/fit.ts).

import type { MarkTaskView } from '@learnbuddy/shared-types/contracts';
import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { renderInApp } from '../../../testing/render.js';
import { MarkAnswer, marksFrom, marksText, targetsOf, toggleMark } from '../MarkAnswer.js';

const word = (id: string, text: string, tail = '') => ({ id, text, lead: '', tail });

const WORDS: MarkTaskView = {
  type: 'mark',
  mode: 'words',
  words: [word('w1', 'Der'), word('w2', 'Hund'), word('w3', 'bellt', '.')],
  categories: [],
};

const SORTED: MarkTaskView = {
  ...WORDS,
  categories: [
    { id: 'k1', name: 'Subjekt' },
    { id: 'k2', name: 'Prädikat' },
  ],
};

const GAPS: MarkTaskView = {
  type: 'mark',
  mode: 'gaps',
  words: [word('w1', 'Ich'), word('w2', 'glaube'), word('w3', 'er'), word('w4', 'kommt', '.')],
  categories: [],
};

const SYLLABLES: MarkTaskView = {
  type: 'mark',
  mode: 'syllables',
  words: [word('w1', 'Hose')],
  categories: [],
};

describe('marks as data', () => {
  it('toggles a mark, and moves it to the chosen category', () => {
    expect(toggleMark([], 'w2', null)).toEqual([{ at: 'w2', category: null }]);
    expect(toggleMark([{ at: 'w2', category: null }], 'w2', null)).toEqual([]);
    expect(toggleMark([{ at: 'w2', category: 'k1' }], 'w2', 'k2')).toEqual([
      { at: 'w2', category: 'k2' },
    ]);
  });

  it('knows every target of a mode, and reads back only marks of this task', () => {
    expect(targetsOf(WORDS)).toEqual(['w1', 'w2', 'w3']);
    expect(targetsOf(GAPS)).toEqual(['g1', 'g2', 'g3']);
    expect(targetsOf(SYLLABLES)).toEqual(['w1_1', 'w1_2', 'w1_3']);
    expect(marksFrom('[{"at":"w2","category":null},{"at":"w9","category":null}]', WORDS)).toEqual([
      { at: 'w2', category: null },
    ]);
    expect(marksFrom('[{"at":"w2","category":null}]', SORTED)).toEqual([]);
    expect(marksFrom('kaputt', WORDS)).toEqual([]);
  });

  it('says the marks in words: runs of words, commas set, syllables cut', () => {
    expect(
      marksText(SORTED, [
        { at: 'w1', category: 'k1' },
        { at: 'w2', category: 'k1' },
        { at: 'w3', category: 'k2' },
      ]),
    ).toBe('Subjekt: Der Hund; Prädikat: bellt');
    expect(marksText(GAPS, [{ at: 'g2', category: null }])).toBe('Ich glaube, er kommt.');
    expect(marksText(SYLLABLES, [{ at: 'w1_2', category: null }])).toBe('Ho-se');
  });
});

describe('marking words she taps', () => {
  it('names each word and its mark, and shows what is marked as text', () => {
    renderInApp(
      <MarkAnswer view={WORDS} draftKey="m1" disabled={false} onSubmit={() => undefined} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Hund, nicht markiert' }));
    expect(screen.getByRole('button', { name: 'Hund, markiert' })).toBeDefined();
    expect(screen.getByText('Markiert: Hund')).toBeDefined();
    // A second tap takes it back.
    fireEvent.click(screen.getByRole('button', { name: 'Hund, markiert' }));
    expect(screen.getByRole('button', { name: 'Hund, nicht markiert' })).toBeDefined();
  });

  it('marks with the chosen category, and sends the ids on "Prüfen"', () => {
    const onSubmit = vi.fn();
    renderInApp(<MarkAnswer view={SORTED} draftKey="m2" disabled={false} onSubmit={onSubmit} />);
    const check = () => screen.getByRole('button', { name: 'Prüfen' });
    expect(check().getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'Hund, nicht markiert' }));
    expect(screen.getByRole('button', { name: 'Hund, markiert als Subjekt' })).toBeDefined();
    fireEvent.click(screen.getByRole('radio', { name: 'Markieren als Prädikat' }));
    fireEvent.click(screen.getByRole('button', { name: 'bellt, nicht markiert' }));
    expect(screen.getByText('Markiert: Subjekt: Hund; Prädikat: bellt')).toBeDefined();
    fireEvent.click(check());
    expect(onSubmit).toHaveBeenCalledWith(
      {
        type: 'mark',
        marks: [
          { at: 'w2', category: 'k1' },
          { at: 'w3', category: 'k2' },
        ],
      },
      'Subjekt: Hund; Prädikat: bellt',
    );
  });
});

describe('commas and syllables', () => {
  it('sets a comma in a gap, as a character', () => {
    const onSubmit = vi.fn();
    renderInApp(<MarkAnswer view={GAPS} draftKey="m3" disabled={false} onSubmit={onSubmit} />);
    fireEvent.click(screen.getByRole('button', { name: 'Lücke nach „glaube“' }));
    expect(
      screen.getByRole('button', { name: 'Lücke nach „glaube“, Komma gesetzt' }),
    ).toBeDefined();
    expect(screen.getByText(',')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Prüfen' }));
    expect(onSubmit).toHaveBeenCalledWith(
      { type: 'mark', marks: [{ at: 'g2', category: null }] },
      'Ich glaube, er kommt.',
    );
  });

  it('cuts a word after a letter, shown as a hyphen; the last letter is no target', () => {
    renderInApp(
      <MarkAnswer view={SYLLABLES} draftKey="m4" disabled={false} onSubmit={() => undefined} />,
    );
    expect(screen.getAllByRole('button', { name: /trennen/ })).toHaveLength(3);
    fireEvent.click(screen.getByRole('button', { name: 'Nach „Ho“ trennen (Hose)' }));
    expect(screen.getByRole('button', { name: 'Nach „Ho“ getrennt (Hose)' })).toBeDefined();
    expect(screen.getByText('-')).toBeDefined();
  });
});
