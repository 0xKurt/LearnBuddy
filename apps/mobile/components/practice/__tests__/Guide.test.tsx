// Das geführte Beispiel und die Erklärung mit Figur in der Übung (issue #298), so wie das Kind
// sie sieht: das Angebot als ein Chip unter dem Gespräch, solange es läuft der eine Weg hinaus,
// und eine Figur unter Buddys Antwort statt eines eigenen Screens.
//
// Was hier nicht zu sehen ist: ob der Server den Schritt richtig prüft und wann er das Angebot
// macht — das hält `apps/api/src/__tests__/guide.int.test.ts` auf einem echten Postgres.

import type { PracticeTurnView } from '@learnbuddy/shared-types/contracts';
import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { renderInApp } from '../../../testing/render.js';
import { HelpChips } from '../HelpChips.js';
import { ItemThread } from '../ItemThread.js';

const turn = (over: Partial<PracticeTurnView>): PracticeTurnView => ({
  id: crypto.randomUUID(),
  item_id: crypto.randomUUID(),
  role: 'tutor',
  text: 'So sieht das aus.',
  verdict: null,
  pronunciation: null,
  reexplain: null,
  figure: null,
  created_at: '2026-10-02T14:00:00.000Z',
  ...over,
});

describe('Schritt für Schritt', () => {
  it('bietet das Vormachen als Buddys Vorschlag an, mit dem ganzen Satz', () => {
    const onGuide = vi.fn();
    renderInApp(<HelpChips onHint={() => {}} onGuide={onGuide} onReveal={() => {}} />);
    const chip = screen.getByRole('button', { name: "Zeig's mir Schritt für Schritt" });
    expect(chip.textContent).toBe("Zeig's mir Schritt für Schritt");
    fireEvent.click(chip);
    expect(onGuide).toHaveBeenCalledTimes(1);
  });

  it('zeigt, solange es läuft, den Weg hinaus statt des Angebots', () => {
    const onLeave = vi.fn();
    renderInApp(<HelpChips onLeaveGuide={onLeave} onReveal={() => {}} />);
    expect(screen.queryByRole('button', { name: "Zeig's mir Schritt für Schritt" })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Selbst weiter' }));
    expect(onLeave).toHaveBeenCalledTimes(1);
  });
});

describe('eine Erklärung mit Figur', () => {
  it('zeichnet die Figur unter Buddys Antwort, beschrieben für den Screenreader', () => {
    renderInApp(
      <ItemThread
        pending={null}
        turns={[
          turn({
            text: 'Je größer a, desto schmaler die Parabel.',
            figure: {
              type: 'function_plot',
              functions: [
                { expr: 'x^2', label: 'a = 1' },
                { expr: '2*x^2', label: 'a = 2' },
              ],
              x_min: -3,
              x_max: 3,
              y_min: -1,
              y_max: 9,
              points: [],
            },
          }),
        ]}
      />,
    );
    expect(screen.getByTestId('reply-figure')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Abbildung|Figur|Bild/ })).toBeTruthy();
  });

  it('zeichnet nichts, wo keine Figur ist', () => {
    renderInApp(<ItemThread pending={null} turns={[turn({})]} />);
    expect(screen.queryByTestId('reply-figure')).toBeNull();
  });
});
