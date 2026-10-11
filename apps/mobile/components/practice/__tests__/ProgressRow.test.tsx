// Die Fortschrittszeile lügt nicht, während die Übung noch wächst (Issue #220, Falle 2).
//
// Eine Übung startet jetzt mit ihren ersten Fragen und bekommt den Rest nachgeliefert, solange
// die Lernende schon arbeitet. Damit ist `total` für ein paar Sekunden NICHT die Zahl, die es
// werden wird — und „Frage 1 von 3“, das zehn Sekunden später „Frage 1 von 9“ heißt, ist genau
// die Anzeige, die Vertrauen kostet. Diese Schicht hält fest, was die Zeile in beiden Zuständen
// sagt und dass der Balken, der einen Anteil von dieser Zahl zeigen würde, so lange wegbleibt.

import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { renderInApp } from '../../../testing/render.js';
import { ProgressRow } from '../Question.js';

// The base component owns segment drawing; this adapter must pass honest domain counts.
vi.mock('../../lb/Progress.js', () => ({
  Progress: ({ total, current, part }: { total: number; current: number; part?: number }) => (
    <div
      role="progressbar"
      data-testid="segments"
      data-total={total}
      data-current={current}
      data-part={part ?? 'default'}
    />
  ),
}));

describe('die Fortschrittszeile einer wachsenden Übung (#220)', () => {
  it('nennt die Gesamtzahl, sobald sie stimmt', () => {
    renderInApp(<ProgressRow position={2} total={9} closed={1} />);
    expect(screen.getByText('Frage 2 von 9')).toBeTruthy();
  });

  it('does not duplicate the count already present in the header subtitle', () => {
    const { container } = renderInApp(<ProgressRow position={2} total={9} closed={1} hideLabel />);
    expect(screen.queryByText('Frage 2 von 9')).toBeNull();
    expect(container.querySelector('[data-testid="segments"]')?.getAttribute('data-total')).toBe(
      '9',
    );
  });

  it('nennt keine Gesamtzahl, solange noch Fragen geschrieben werden', () => {
    renderInApp(<ProgressRow position={2} total={3} closed={1} preparing />);
    // Weder die Zahl, die sich noch ändert, noch ein „von“ überhaupt.
    expect(screen.queryByText(/von/)).toBeNull();
    expect(screen.getByText('Frage 2 · ich schreibe noch mehr')).toBeTruthy();
  });

  it('zeigt keinen Balken, der einen Anteil dieser Zahl wäre', () => {
    const { container: growing } = renderInApp(
      <ProgressRow position={2} total={3} closed={1} preparing />,
    );
    const { container: done } = renderInApp(<ProgressRow position={2} total={9} closed={1} />);
    expect(growing.querySelector('[data-testid="progress-bar"]')).toBeNull();
    const segments = done.querySelector('[data-testid="segments"]');
    expect(segments?.getAttribute('data-total')).toBe('9');
    expect(segments?.getAttribute('data-current')).toBe('1');
  });
});

it('hides decorative progress from web accessibility even when the count is in the header', () => {
  renderInApp(<ProgressRow position={2} total={9} closed={1} hideLabel />);
  expect(screen.queryByRole('progressbar')).toBeNull();
  expect(screen.getByTestId('progress-bar').getAttribute('aria-hidden')).toBe('true');
});

it('fills only completed segments after Check and activates the next segment only after Next', () => {
  const view = renderInApp(<ProgressRow position={1} total={4} closed={0} active />);
  expect(screen.getByTestId('segments').getAttribute('data-part')).toBe('default');
  view.rerender(<ProgressRow position={1} total={4} closed={1} active={false} />);
  expect(screen.getByTestId('segments').getAttribute('data-current')).toBe('1');
  expect(screen.getByTestId('segments').getAttribute('data-part')).toBe('0');
  expect(screen.getByText('Frage 1 von 4')).toBeTruthy();
  view.rerender(<ProgressRow position={2} total={4} closed={1} active />);
  expect(screen.getByTestId('segments').getAttribute('data-part')).toBe('default');
  expect(screen.getByText('Frage 2 von 4')).toBeTruthy();
});
