// Die Fortschrittszeile lügt nicht, während die Übung noch wächst (Issue #220, Falle 2).
//
// Eine Übung startet jetzt mit ihren ersten Fragen und bekommt den Rest nachgeliefert, solange
// die Lernende schon arbeitet. Damit ist `total` für ein paar Sekunden NICHT die Zahl, die es
// werden wird — und „Frage 1 von 3“, das zehn Sekunden später „Frage 1 von 9“ heißt, ist genau
// die Anzeige, die Vertrauen kostet. Diese Schicht hält fest, was die Zeile in beiden Zuständen
// sagt und dass der Balken, der einen Anteil von dieser Zahl zeigen würde, so lange wegbleibt.

import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { renderInApp } from '../../../testing/render.js';
import { ProgressRow } from '../Question.js';

describe('die Fortschrittszeile einer wachsenden Übung (#220)', () => {
  it('nennt die Gesamtzahl, sobald sie stimmt', () => {
    renderInApp(<ProgressRow position={2} total={9} closed={1} />);
    expect(screen.getByText('Frage 2 von 9')).toBeTruthy();
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
    // Der Balken ist ein Kasten mit genau 8 px Höhe; während des Wachsens gibt es ihn nicht.
    const bars = (root: HTMLElement) =>
      Array.from(root.querySelectorAll<HTMLElement>('div')).filter(
        (el) => el.style.height === '8px',
      );
    expect(bars(growing)).toHaveLength(0);
    expect(bars(done)).toHaveLength(1);
  });
});
