// The loading state breathes only what it shows (#637): under a head whose orb already thinks
// (`orb={false}`) no loop runs — a repeating animation with nothing to move still costs the
// phone a step every frame.

import { render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const loops = vi.hoisted(() => ({ started: 0 }));

vi.mock('react-native-reanimated', async (load) => ({
  ...(await load<Record<string, unknown>>()),
  withRepeat: <T,>(to: T): T => {
    loops.started++;
    return to;
  },
}));
vi.mock('../BuddyOrb.js', () => ({ BuddyOrb: () => <div data-testid="orb" /> }));

const { LoadingState } = await import('../LoadingState.js');

afterEach(() => {
  loops.started = 0;
});

describe('the loading state', () => {
  it('breathes the orb it shows', () => {
    render(<LoadingState label="Lädt" />);
    expect(loops.started).toBe(1);
  });

  it('starts no loop when it shows no orb', () => {
    render(<LoadingState orb={false} label="Lädt" />);
    expect(loops.started).toBe(0);
  });
});
