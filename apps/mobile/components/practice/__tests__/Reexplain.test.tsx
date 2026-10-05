// „Warum stimmt das?" (issue #388, report „Hilfe und Fragen beim Üben" §5.3): where the question came
// with three reasons, the "why" chip asks HER — one tap shows the reasons, a second one picks. The
// same chip in the same place; without reasons it stays Buddy's explanation ("Warum ist das so?").

import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { renderInApp } from '../../../testing/render.js';
import { Reexplain } from '../Reexplain.js';

const REASONS = [
  'Mal heißt: so oft die gleiche Zahl zusammenzählen.',
  'Beim Malnehmen zählt man die beiden Zahlen zusammen.',
  'Die größere Zahl gewinnt immer.',
];

describe('Reexplain — „Warum stimmt das?"', () => {
  it('shows the three reasons on a tap and sends the one she picks', () => {
    const onAsk = vi.fn();
    renderInApp(
      <Reexplain
        turns={[]}
        pending={null}
        disabled={false}
        delay={0}
        onAsk={onAsk}
        why={REASONS}
      />,
    );
    expect(screen.queryByRole('button', { name: 'Warum ist das so?' })).toBeNull();
    expect(screen.queryByRole('button', { name: REASONS[1] })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Warum stimmt das?' }));
    for (const reason of REASONS) expect(screen.getByRole('button', { name: reason })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: REASONS[1]! }));
    expect(onAsk).toHaveBeenCalledTimes(1);
    expect(onAsk).toHaveBeenCalledWith('why', 1);
  });

  it("keeps Buddy's explanation where the question has no reasons", () => {
    const onAsk = vi.fn();
    renderInApp(<Reexplain turns={[]} pending={null} disabled={false} delay={0} onAsk={onAsk} />);
    fireEvent.click(screen.getByRole('button', { name: 'Warum ist das so?' }));
    expect(onAsk).toHaveBeenCalledWith('why');
  });
});
