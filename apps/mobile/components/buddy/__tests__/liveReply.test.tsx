// Buddy's reply is revealed word by word, a new state every animation frame (issue #715). Only
// the reply's own line may redraw for that: when the whole conversation redrew each frame, one
// reply cost ~3.6 s of JS on the POCO X3 and half its frames came late.

import { act, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { renderInApp } from '../../../testing/render.js';
import { Conversation } from '../Conversation.js';

const drawn = vi.hoisted(() => new Map<string, number>());

vi.mock('../RichText.js', async (load) => {
  const real = await load<typeof import('../RichText.js')>();
  return {
    ...real,
    RichText: (props: Parameters<typeof real.RichText>[0]) => {
      drawn.set(props.text, (drawn.get(props.text) ?? 0) + 1);
      return real.RichText(props);
    },
  };
});
vi.mock('../../lb/BuddyOrb.js', () => ({ BuddyOrb: () => null }));
// The reveal runs (with reduce motion the reply shows whole at once).
vi.mock('../../../lib/theme/motion.js', async (load) => ({
  ...(await load<Record<string, unknown>>()),
  useMotionReduced: () => false,
}));

beforeEach(() => {
  vi.useFakeTimers();
  // A frame every 16 ms on the fake clock.
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) =>
    setTimeout(() => cb(Date.now()), 16),
  );
  vi.stubGlobal('cancelAnimationFrame', (id: number) => clearTimeout(id));
  drawn.clear();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const message = (id: string, role: 'buddy' | 'learner', text: string) => ({
  id,
  role,
  text,
  status: role === 'learner' ? ('processing' as const) : ('done' as const),
  failure_code: null,
  client_message_id: null,
  options: null,
  reply_to_id: null,
  outreach: null,
  actions: [],
  roleplay_feedback: null,
  created_at: '2026-10-14T18:00:00.000Z',
});

it('redraws only the reply while it is revealed, not the messages above it', () => {
  const history = [
    message('a', 'buddy', 'Ein Bruch hat einen Zähler und einen Nenner.'),
    message('b', 'learner', 'Was ist ein Nenner?'),
  ];
  const reply =
    'Der Nenner ist die untere Zahl in einem Bruch. Er sagt, in wie viele gleiche Teile das Ganze geteilt ist.';
  const view = renderInApp(
    <Conversation messages={history} pending={null} busy live={reply.slice(0, 15)} />,
  );
  act(() => {
    vi.advanceTimersByTime(500);
  });
  const before = drawn.get(history[0]!.text) ?? 0;
  // The rest arrives in one chunk: the screen reveals it word by word.
  view.rerender(<Conversation messages={history} pending={null} busy live={reply} />);
  // A second of the reveal, frame by frame.
  for (let f = 0; f < 60; f++)
    act(() => {
      vi.advanceTimersByTime(16);
    });
  expect(screen.getByText(/Der Nenner/)).toBeDefined();
  // The reveal did run frame by frame (several lengths of the reply were drawn)…
  expect([...drawn.keys()].filter((k) => reply.startsWith(k) && k !== '').length).toBeGreaterThan(
    5,
  );
  // The history above is drawn once more for the new chunk, not again for each frame.
  expect(drawn.get(history[0]!.text) ?? 0).toBeLessThanOrEqual(before + 1);
});
