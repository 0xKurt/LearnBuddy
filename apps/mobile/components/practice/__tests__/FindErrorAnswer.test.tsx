// Fehlerdetektiv (issue #260): die falsche Zeile antippen, darunter verbessern. Was hier
// festgehalten wird:
//
//   · die erste Zeile ist die Aufgabe — sie steht da, ist aber kein Button;
//   · jede andere Zeile ist ein Button mit Namen; die gewählte wird selbst zum Feld „Zeile n
//     richtig" mit ihrem Text darin (im Heft verbessert man nur das Falsche) — die Farbe ist nie
//     das einzige Signal; ihr × nimmt die Wahl zurück;
//   · „Prüfen" wartet, bis eine Zeile gewählt und verbessert ist, und schickt `parts` — die Id
//     der Zeile und ihre Verbesserung (geprüft wird auf dem Server).
//
// Ob fünf Zeilen auf 360×740 passen, misst der Walkthrough (tests/web/fit.ts).

import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { renderInApp } from '../../../testing/render.js';
import { FindErrorAnswer, pickFrom, tapLine } from '../FindErrorAnswer.js';

const VIEW = {
  type: 'find_error' as const,
  chain: 'equation' as const,
  lines: [
    { id: 'l1', text: '2(x + 3) = 14' },
    { id: 'l2', text: '2x + 3 = 14' },
    { id: 'l3', text: '2x = 11' },
  ],
};

const TERMS = {
  type: 'find_error' as const,
  chain: 'term' as const,
  lines: [
    { id: 'l1', text: '23 · 4' },
    { id: 'l2', text: '20 · 4 + 3 · 4' },
    { id: 'l3', text: '80 + 21' },
  ],
};

describe('choosing a line', () => {
  it('a tap chooses a step and puts its text in the field; the same tap lets it go', () => {
    const none = { line: null, fix: '' };
    expect(tapLine(VIEW, none, 'l2')).toEqual({ line: 'l2', fix: '2x + 3 = 14' });
    expect(tapLine(VIEW, { line: 'l2', fix: '2x + 6 = 14' }, 'l3')).toEqual({
      line: 'l3',
      fix: '2x = 11',
    });
    expect(tapLine(VIEW, { line: 'l2', fix: 'x' }, 'l2')).toEqual(none);
  });

  it('reads a kept choice back, and nothing that is not one (never the task line)', () => {
    expect(pickFrom('{"line":"l2","fix":"2x + 6 = 14"}', VIEW)).toEqual({
      line: 'l2',
      fix: '2x + 6 = 14',
    });
    expect(pickFrom('{"line":"l1","fix":"x"}', VIEW)).toEqual({ line: null, fix: '' });
    expect(pickFrom('{"line":"l9","fix":"x"}', VIEW)).toEqual({ line: null, fix: '' });
    expect(pickFrom('kaputt', VIEW)).toEqual({ line: null, fix: '' });
    expect(pickFrom('[1]', VIEW)).toEqual({ line: null, fix: '' });
  });
});

describe('a worked solution she checks', () => {
  it('the task line is read, never tapped; the steps are buttons named by number and text', () => {
    renderInApp(
      <FindErrorAnswer view={VIEW} draftKey="fe1" disabled={false} onSubmit={() => undefined} />,
    );
    expect(screen.queryByRole('button', { name: /2\(x \+ 3\) = 14/ })).toBeNull();
    expect(screen.getByLabelText(/^Aufgabe:/)).toBeDefined();
    expect(screen.getByRole('button', { name: /^Zeile 2:/ })).toBeDefined();
    expect(screen.getByText('Tippe die Zeile an, in der der Fehler steckt.')).toBeDefined();
  });

  it('waits with "Prüfen" until a line is chosen and corrected, then sends id and fix', () => {
    const onSubmit = vi.fn();
    renderInApp(
      <FindErrorAnswer view={VIEW} draftKey="fe2" disabled={false} onSubmit={onSubmit} />,
    );
    const check = () => screen.getByRole('button', { name: 'Prüfen' });
    expect(check().getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: /^Zeile 2:/ }));
    // The line itself is the field now; its button is gone, the × takes the choice back.
    expect(screen.queryByRole('button', { name: /^Zeile 2:/ })).toBeNull();
    expect(screen.getByRole('button', { name: 'Zeile 2 nicht mehr markieren' })).toBeDefined();
    const field = screen.getByLabelText('Zeile 2 richtig') as HTMLInputElement;
    expect(field.value).toBe('2x + 3 = 14');
    fireEvent.change(field, { target: { value: '2x + 6 = 14' } });
    fireEvent.click(check());
    expect(onSubmit).toHaveBeenCalledWith(
      { type: 'find_error', line: 'l2', fix: '2x + 6 = 14' },
      'Zeile 2: 2x + 6 = 14',
    );
  });

  it('a term chain writes "=" in front of every step, and in her answer', () => {
    const onSubmit = vi.fn();
    renderInApp(
      <FindErrorAnswer view={TERMS} draftKey="fe3" disabled={false} onSubmit={onSubmit} />,
    );
    fireEvent.click(screen.getByRole('button', { name: /^Zeile 3:/ }));
    fireEvent.change(screen.getByLabelText('Zeile 3 richtig'), { target: { value: '80 + 12' } });
    fireEvent.click(screen.getByRole('button', { name: 'Prüfen' }));
    expect(onSubmit).toHaveBeenCalledWith(
      { type: 'find_error', line: 'l3', fix: '80 + 12' },
      'Zeile 3: = 80 + 12',
    );
  });
});
