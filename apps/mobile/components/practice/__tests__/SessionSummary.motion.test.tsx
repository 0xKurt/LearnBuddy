import { act, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderInApp } from '../../../testing/render.js';
import type * as MotionModule from '../../../lib/theme/motion.js';
import { DURATION } from '../../../lib/theme/motion.js';
import { SessionSummary } from '../SessionSummary.js';

const preference = vi.hoisted(() => ({ reduced: false }));
vi.mock('../../../lib/theme/motion.js', async (original) => ({
  ...(await original<typeof MotionModule>()),
  useMotionReduced: () => preference.reduced,
}));
vi.mock('../../lb/BuddyOrb.js', () => ({
  BuddyOrb: ({ state }: { state: string }) => <div data-testid="summary-orb" data-state={state} />,
}));
afterEach(() => {
  vi.useRealTimers();
  preference.reduced = false;
});
describe('summary celebration live reduced motion', () => {
  it('settles an already mounted pending celebration immediately after reduction without replaying', () => {
    vi.useFakeTimers();
    const summary = { answered: 1, first_try: 1, secure_topics: [], shaky_topics: [] };
    const ui = <SessionSummary summary={summary} mode="practice" celebrate />;
    const { rerender } = renderInApp(ui);
    expect(screen.getByTestId('summary-orb').dataset.state).toBe('idle');
    act(() => vi.advanceTimersByTime(DURATION.gentle / 2));
    preference.reduced = true;
    rerender(<SessionSummary summary={summary} mode="practice" celebrate />);
    act(() => vi.advanceTimersByTime(0));
    expect(screen.getByTestId('summary-orb').dataset.state).toBe('happy');
    preference.reduced = false;
    rerender(<SessionSummary summary={summary} mode="practice" celebrate />);
    act(() => vi.advanceTimersByTime(DURATION.gentle));
    expect(screen.getByTestId('summary-orb').dataset.state).toBe('happy');
  });
});
