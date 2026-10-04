// Markieren (issue #234): ein Tipp markiert, ein zweiter nimmt es zurück, „Prüfen“ schickt die
// Stellen. Was hier festgehalten wird:
//
//   · jede Stelle ist ein echtes Kontrollkästchen mit Namen und Zustand; markiert steht darunter
//     in Worten, was markiert ist (Farbe ist nie das einzige Signal), ein Komma als Komma, eine
//     Silbengrenze als Bindestrich;
//   · mit Kategorien wählt sie zuerst die Kategorie (die erste ist gewählt), und ein Wort trägt
//     dann deren Namen — ein zweiter Tipp in einer anderen Kategorie verschiebt es;
//   · „Prüfen“ wartet auf eine Markierung und schickt `parts` mit den Ids, nie den Text;
//   · ein alter Entwurf mit fremden Stellen wird nicht übernommen.
//
// Ob 24 Wörter samt Buddys Antwort auf 360×740 passen, misst tests/web/mark.spec.ts.

import type { MarkTaskView } from '@learnbuddy/shared-types/contracts';
import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { renderInApp } from '../../../testing/render.js';
import { MarkAnswer, marksFrom, toggleMark } from '../MarkAnswer.js';

const word = (id: string, text: string, tail = '') => ({ id, text, lead: '', tail });

const NOUNS: MarkTaskView = {
  type: 'mark',
  mode: 'words',
  words: [word('w1', 'der'), word('w2', 'hund'), word('w3', 'bellt', '.')],
  categories: [],
};

const PARTS: MarkTaskView = {
  ...NOUNS,
  words: [word('w1', 'Der'), word('w2', 'Hund'), word('w3', 'bellt', '.')],
  categories: [
    { id: 'k1', name: 'Subjekt' },
    { id: 'k2', name: 'Prädikat' },
  ],
};

const COMMAS: MarkTaskView = {
  type: 'mark',
  mode: 'gaps',
  words: [word('w1', 'Ich'), word('w2', 'glaube'), word('w3', 'dass'), word('w4', 'es', '.')],
  categories: [],
};

const SYLLABLES: MarkTaskView = {
  type: 'mark',
  mode: 'syllables',
  words: [word('w1', 'Hase')],
  categories: [],
};

function show(view: MarkTaskView, onSubmit: () => void = () => undefined, disabled = false) {
  renderInApp(
    <MarkAnswer
      view={view}
      draftKey={`mark.${Math.random()}`}
      disabled={disabled}
      onSubmit={onSubmit}
    />,
  );
}

describe('one tap, as a pure step', () => {
  it('marks, takes back, and moves a mark to the chosen category', () => {
    expect(toggleMark([], 'w2', null)).toEqual([{ at: 'w2', category: null }]);
    expect(toggleMark([{ at: 'w2', category: null }], 'w2', null)).toEqual([]);
    expect(toggleMark([{ at: 'w2', category: 'k1' }], 'w2', 'k2')).toEqual([
      { at: 'w2', category: 'k2' },
    ]);
  });

  it('keeps only marks of this task from a draft', () => {
    const kept = JSON.stringify([
      { at: 'w2', category: null },
      { at: 'w9', category: null },
      { at: 'w2', category: null },
      { at: 'w3', category: 'k1' },
    ]);
    expect(marksFrom(kept, NOUNS)).toEqual([{ at: 'w2', category: null }]);
    expect(marksFrom('not json', NOUNS)).toEqual([]);
  });
});

describe('marking words', () => {
  it('says how, marks and unmarks with a tap, and says in words what is marked', () => {
    show(NOUNS);
    expect(screen.getByText('Tippe die Wörter an – noch ein Tipp nimmt es zurück.')).toBeDefined();
    const hund = () => screen.getByRole('checkbox', { name: 'hund' });
    expect(screen.getAllByRole('checkbox')).toHaveLength(3);
    fireEvent.click(hund());
    expect(hund().getAttribute('aria-checked')).toBe('true');
    expect(screen.getByTestId('mark-summary').textContent).toBe('Markiert – hund');
    fireEvent.click(hund());
    expect(hund().getAttribute('aria-checked')).toBe('false');
    expect(screen.queryByTestId('mark-summary')).toBeNull();
  });

  it('waits with "Prüfen" until one is marked, then sends the places and the words', () => {
    const onSubmit = vi.fn();
    show(NOUNS, onSubmit);
    const check = () => screen.getByRole('button', { name: 'Prüfen' });
    expect(check().getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(screen.getByRole('checkbox', { name: 'hund' }));
    fireEvent.click(check());
    expect(onSubmit).toHaveBeenCalledWith(
      { type: 'mark', marks: [{ at: 'w2', category: null }] },
      'hund',
    );
  });

  it('takes no mark while the answer is being judged', () => {
    show(NOUNS, undefined, true);
    const hund = screen.getByRole('checkbox', { name: 'hund' });
    fireEvent.click(hund);
    expect(hund.getAttribute('aria-checked')).toBe('false');
  });
});

describe('with categories', () => {
  it('chooses the category first, and a word says which one it carries', () => {
    const onSubmit = vi.fn();
    show(PARTS, onSubmit);
    const subjekt = screen.getByRole('radio', { name: '① Subjekt' });
    expect(subjekt.getAttribute('aria-checked')).toBe('true');
    fireEvent.click(screen.getByRole('checkbox', { name: 'Hund' }));
    fireEvent.click(screen.getByRole('radio', { name: '② Prädikat' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'bellt' }));
    expect(screen.getByRole('checkbox', { name: 'bellt, markiert als Prädikat' })).toBeDefined();
    expect(screen.getByTestId('mark-summary').textContent).toBe('Subjekt: Hund; Prädikat: bellt');
    // A tap in another category moves the word there.
    fireEvent.click(screen.getByRole('checkbox', { name: 'Hund, markiert als Subjekt' }));
    expect(screen.getByRole('checkbox', { name: 'Hund, markiert als Prädikat' })).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Prüfen' }));
    expect(onSubmit).toHaveBeenCalledWith(
      {
        type: 'mark',
        marks: [
          { at: 'w2', category: 'k2' },
          { at: 'w3', category: 'k2' },
        ],
      },
      'Prädikat: Hund bellt',
    );
  });
});

describe('commas and syllables', () => {
  it('sets a comma after the tapped word — the last word is no target', () => {
    const onSubmit = vi.fn();
    show(COMMAS, onSubmit);
    expect(screen.getAllByRole('checkbox')).toHaveLength(3);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Komma nach „glaube“' }));
    expect(screen.getByText(',')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Prüfen' }));
    expect(onSubmit).toHaveBeenCalledWith(
      { type: 'mark', marks: [{ at: 'g2', category: null }] },
      'Ich glaube, dass es.',
    );
  });

  it('cuts a word after the tapped letter, and spells it with its hyphen', () => {
    show(SYLLABLES);
    // Three cuts in "Hase", none after its last letter.
    expect(screen.getAllByRole('checkbox')).toHaveLength(3);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Silbe endet nach „Ha“ in Hase' }));
    expect(screen.getByTestId('mark-summary').textContent).toBe('Getrennt: Ha-se');
  });
});
