// Mehrere richtige Antworten (issue #240): ein Tipp kreuzt an, ein zweiter nimmt das Kreuz
// zurück, „Prüfen“ schickt die Menge. Was hier festgehalten wird:
//
//   · jede Option ist ein echtes Kontrollkästchen mit Namen und Zustand — ein Screenreader hört
//     „aktiviert“, und auf dem Schirm steht der Haken (Farbe ist nie das einzige Signal);
//   · über den Optionen steht die eine Marke „Mehrere Antworten richtig“ — und nirgends, wie viele;
//   · „Prüfen“ wartet auf mindestens ein Kreuz und schickt dann `parts` — die Ids in der
//     Reihenfolge, in der sie dastehen, nie den Text (beurteilt wird auf dem Server).
//
// Ob sechs Optionen samt Buddys Antwort auf 360×740 passen, misst der Walkthrough
// (tests/web/fit.ts), nicht diese Schicht.

import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { renderInApp } from '../../../testing/render.js';
import { chosenFrom, SelectAllAnswer, toggle } from '../SelectAllAnswer.js';

const VIEW = {
  type: 'select_all' as const,
  options: [
    { id: 'a', text: 'Akkusativ Singular' },
    { id: 'b', text: 'Genitiv Singular' },
    { id: 'c', text: 'Nominativ Plural' },
    { id: 'd', text: 'Dativ Singular' },
  ],
};

describe('ticking and unticking', () => {
  it('adds an untouched option and takes a ticked one away again', () => {
    expect(toggle([], 'b')).toEqual(['b']);
    expect(toggle(['b'], 'c')).toEqual(['b', 'c']);
    expect(toggle(['b', 'c'], 'b')).toEqual(['c']);
  });

  it('reads kept ticks back, and nothing that is not one', () => {
    const ids = new Set(['a', 'b', 'c']);
    expect(chosenFrom('["c","a"]', ids)).toEqual(['c', 'a']);
    expect(chosenFrom('', ids)).toEqual([]);
    expect(chosenFrom('kaputt', ids)).toEqual([]);
    expect(chosenFrom('{"a":1}', ids)).toEqual([]);
    expect(chosenFrom('["b","x","b",3]', ids)).toEqual(['b']);
  });
});

describe('options she ticks', () => {
  it('says that several are right, never how many, and shows every option as a checkbox', () => {
    renderInApp(
      <SelectAllAnswer
        view={VIEW}
        draftKey="s1"
        answered={false}
        disabled={false}
        onSubmit={() => undefined}
      />,
    );
    expect(screen.getByText('Mehrere Antworten richtig')).toBeDefined();
    expect(screen.queryByText(/\d von \d/)).toBeNull();
    const boxes = screen.getAllByRole('checkbox');
    expect(boxes).toHaveLength(4);
    for (const box of boxes) expect(box.getAttribute('aria-checked')).toBe('false');
  });

  it('ticks and unticks with one tap each, and says so in its state', () => {
    renderInApp(
      <SelectAllAnswer
        view={VIEW}
        draftKey="s2"
        answered={false}
        disabled={false}
        onSubmit={() => undefined}
      />,
    );
    const box = () => screen.getByRole('checkbox', { name: 'Genitiv Singular' });
    fireEvent.click(box());
    expect(box().getAttribute('aria-checked')).toBe('true');
    fireEvent.click(box());
    expect(box().getAttribute('aria-checked')).toBe('false');
  });

  it('waits with "Prüfen" until one is ticked, then sends the ids in the order shown', () => {
    const onSubmit = vi.fn();
    renderInApp(
      <SelectAllAnswer
        view={VIEW}
        draftKey="s3"
        answered={false}
        disabled={false}
        onSubmit={onSubmit}
      />,
    );
    const check = () => screen.getByRole('button', { name: 'Prüfen' });
    expect(check().getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(screen.getByRole('checkbox', { name: 'Dativ Singular' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Genitiv Singular' }));
    expect(check().getAttribute('aria-disabled')).not.toBe('true');
    fireEvent.click(check());
    expect(onSubmit).toHaveBeenCalledWith(
      { type: 'select_all', chosen: ['b', 'd'] },
      'Genitiv Singular; Dativ Singular',
    );
  });

  it("lets the tag step aside once she has checked (Buddy's reply says it then)", () => {
    renderInApp(
      <SelectAllAnswer
        view={VIEW}
        draftKey="s5"
        answered
        disabled={false}
        onSubmit={() => undefined}
      />,
    );
    expect(screen.queryByText('Mehrere Antworten richtig')).toBeNull();
    expect(screen.getAllByRole('checkbox')).toHaveLength(4);
  });

  it('takes no tick while the answer is being judged', () => {
    renderInApp(
      <SelectAllAnswer
        view={VIEW}
        draftKey="s4"
        answered={false}
        disabled
        onSubmit={() => undefined}
      />,
    );
    const box = screen.getByRole('checkbox', { name: 'Nominativ Plural' });
    fireEvent.click(box);
    expect(box.getAttribute('aria-checked')).toBe('false');
  });
});
