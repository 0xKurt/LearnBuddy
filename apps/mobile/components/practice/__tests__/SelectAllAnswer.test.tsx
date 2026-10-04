// Mehrere richtige Antworten (issue #240): ein Tipp kreuzt an, ein zweiter nimmt das Kreuz
// zurück, „Prüfen“ schickt die Menge. Was hier festgehalten wird:
//
//   · jede Option ist ein echtes Kontrollkästchen mit Namen und Zustand — ein Screenreader hört
//     „aktiviert“, und auf dem Schirm steht der Haken (Farbe ist nie das einzige Signal);
//   · über den Optionen steht die eine Zeile „Mehrere sind richtig“ — und nirgends, wie viele;
//     nach dem ersten „Prüfen“ tritt sie zur Seite (dann sagt es Buddys Antwort);
//   · „Prüfen“ wartet auf mindestens ein Kreuz und schickt dann `parts` — die Ids in der
//     Reihenfolge, in der sie dastehen, nie den Text (beurteilt wird auf dem Server);
//   · was die App für eine kurze Option hält, ist dasselbe wie im Vertrag (SELECT_SHORT_CHARS).
//
// Ob sechs Optionen samt Buddys Antwort auf 360×740 passen, misst der Walkthrough
// (tests/web/fit.ts), nicht diese Schicht.

import { SELECT_SHORT_CHARS } from '@learnbuddy/shared-types/contracts';
import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { renderInApp } from '../../../testing/render.js';
import { GRID_CHARS_MAX, twoColumnChoices } from '../ChoiceList.js';
import { SelectAllAnswer, toggle } from '../SelectAllAnswer.js';

const VIEW = {
  type: 'select_all' as const,
  options: [
    { id: 'a', text: 'Akkusativ' },
    { id: 'b', text: 'Genitiv' },
    { id: 'c', text: 'Nominativ' },
    { id: 'd', text: 'Dativ' },
  ],
};

function show(over: Partial<{ disabled: boolean; onSubmit: () => void; draftKey: string }> = {}) {
  renderInApp(
    <SelectAllAnswer
      view={VIEW}
      draftKey={over.draftKey ?? `select.${Math.random()}`}
      disabled={over.disabled ?? false}
      onSubmit={over.onSubmit ?? (() => undefined)}
    />,
  );
}

describe('ticking and unticking', () => {
  it('adds an untouched option and takes a ticked one away again', () => {
    expect(toggle([], 'b')).toEqual(['b']);
    expect(toggle(['b'], 'c')).toEqual(['b', 'c']);
    expect(toggle(['b', 'c'], 'b')).toEqual(['c']);
  });
});

describe('what counts as short', () => {
  it('is the same in the app and in the contract the server checks against', () => {
    expect(GRID_CHARS_MAX).toBe(SELECT_SHORT_CHARS);
  });

  it('puts up to six short options two by two, but never four to choose one beyond four', () => {
    const six = ['Genitiv', 'Dativ', 'Nominativ', 'Vokativ', 'Akkusativ', 'Ablativ'];
    expect(twoColumnChoices(six, 6)).toBe(true);
    expect(twoColumnChoices(six)).toBe(false);
    expect(twoColumnChoices([...six.slice(0, 3), 'Zwei unabhängige Bremsen'], 6)).toBe(false);
  });
});

describe('options she ticks', () => {
  it('says that several are right, never how many, and shows every option as a checkbox', () => {
    show();
    expect(screen.getByText('Mehrere sind richtig – tippe alle an.')).toBeDefined();
    expect(screen.queryByText(/\d von \d/)).toBeNull();
    const boxes = screen.getAllByRole('checkbox');
    expect(boxes).toHaveLength(4);
    for (const box of boxes) expect(box.getAttribute('aria-checked')).toBe('false');
    // No letters: they would read like "pick one".
    expect(screen.queryAllByTestId('choice-letter')).toHaveLength(0);
    expect(screen.getAllByTestId('choice-box')).toHaveLength(4);
  });

  it('ticks and unticks with one tap each, and says so in its state', () => {
    show();
    const box = () => screen.getByRole('checkbox', { name: 'Genitiv' });
    fireEvent.click(box());
    expect(box().getAttribute('aria-checked')).toBe('true');
    fireEvent.click(box());
    expect(box().getAttribute('aria-checked')).toBe('false');
  });

  it('waits with "Prüfen" until one is ticked, then sends the ids in the order shown', () => {
    const onSubmit = vi.fn();
    show({ onSubmit });
    const check = () => screen.getByRole('button', { name: 'Prüfen' });
    expect(check().getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(screen.getByRole('checkbox', { name: 'Dativ' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Genitiv' }));
    expect(check().getAttribute('aria-disabled')).not.toBe('true');
    fireEvent.click(check());
    expect(onSubmit).toHaveBeenCalledWith(
      { type: 'select_all', chosen: ['b', 'd'] },
      'Genitiv; Dativ',
    );
    // Checked once, Buddy's reply says how it went; the line steps aside, the ticks stay.
    expect(screen.queryByText('Mehrere sind richtig – tippe alle an.')).toBeNull();
    expect(screen.getByRole('checkbox', { name: 'Dativ' }).getAttribute('aria-checked')).toBe(
      'true',
    );
  });

  it('takes no tick while the answer is being judged', () => {
    show({ disabled: true });
    const box = screen.getByRole('checkbox', { name: 'Nominativ' });
    fireEvent.click(box);
    expect(box.getAttribute('aria-checked')).toBe('false');
  });
});
