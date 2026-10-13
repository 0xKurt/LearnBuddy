// A held press is the boundary: real Conversation must settle when the live preference changes.
import { act, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, expect, it, vi } from 'vitest';
import { renderInApp, styleOf } from '../../../testing/render.js';
import { CHAT } from '../../../lib/theme/chat.js';
import { Conversation } from '../Conversation.js';

const motion = vi.hoisted(() => ({
  reduced: false,
  listeners: new Set<() => void>(),
  timing: vi.fn(),
  cancel: vi.fn(),
}));
vi.mock('../../../lib/theme/motion.js', async (original) => {
  const actual = await original<Record<string, unknown>>();
  const { useSyncExternalStore } = await import('react');
  return {
    ...actual,
    useMotionReduced: () =>
      useSyncExternalStore(
        (listener) => {
          motion.listeners.add(listener);
          return () => motion.listeners.delete(listener);
        },
        () => motion.reduced,
      ),
  };
});
vi.mock('react-native-reanimated', async (original) => {
  const actual = await original<Record<string, unknown>>();
  return {
    ...actual,
    withTiming: (target: number) => {
      if (target === 1) motion.timing(target);
      return target === 1 ? 0 : target;
    },
    cancelAnimation: motion.cancel,
  };
});
beforeEach(() => {
  motion.reduced = false;
  motion.timing.mockClear();
  motion.cancel.mockClear();
});

// Buddy's mini orb beside his newest line moves by itself (owner rule 1) — that is his own
// motion, not an entrance of the thread, which is what these tests count.
vi.mock('../../lb/BuddyOrb.js', () => ({ BuddyOrb: () => null }));

vi.mock('../../lb/PressArea.js', () => ({
  PressArea: ({ children }: { children: ReactNode | ((pressed: boolean) => ReactNode) }) => (
    <div data-testid="held-message">
      {typeof children === 'function' ? children(true) : children}
    </div>
  ),
}));

it('settles an already-held message press immediately on live reduction and restores normal press styling', () => {
  renderInApp(
    <Conversation
      messages={[
        {
          id: 'held-message',
          role: 'learner',
          text: 'Bitte hilf mir.',
          status: 'done',
          failure_code: null,
          client_message_id: null,
          options: null,
          reply_to_id: null,
          outreach: null,
          actions: [],
          roleplay_feedback: null,
          created_at: '2026-10-01T18:00:00.000Z',
        },
      ]}
      pending={null}
      busy={false}
    />,
  );
  const painted = () => screen.getByTestId('held-message').firstElementChild!;
  expect(styleOf(painted()).transform).toBe(`scale(${CHAT.pressedScale})`);
  act(() => {
    motion.reduced = true;
    motion.listeners.forEach((listener) => listener());
  });
  expect(styleOf(painted()).transform).toBe('scale(1)');
  expect(screen.getByText('Bitte hilf mir.')).toBeDefined();
  act(() => {
    motion.reduced = false;
    motion.listeners.forEach((listener) => listener());
  });
  expect(styleOf(painted()).transform).toBe(`scale(${CHAT.pressedScale})`);
});

it('keeps initial history still but enters a later card and settles it on live reduction without replay', () => {
  const message = {
    id: 'history',
    role: 'buddy' as const,
    text: 'Gute Idee',
    status: 'done' as const,
    failure_code: null,
    client_message_id: null,
    options: null,
    reply_to_id: null,
    outreach: null,
    actions: [],
    roleplay_feedback: null,
    created_at: '2026-10-01T18:00:00.000Z',
  };
  const view = renderInApp(
    <Conversation messages={[message]} pending={null} busy={false} onOption={vi.fn()} />,
  );
  expect(motion.timing).not.toHaveBeenCalled();
  view.rerender(<Conversation messages={[message]} pending={null} busy onOption={vi.fn()} />);
  expect(motion.timing).not.toHaveBeenCalled();
  view.rerender(
    <Conversation
      messages={[{ ...message, options: ['Brüche vergleichen'] }]}
      pending={null}
      busy={false}
      onOption={vi.fn()}
    />,
  );
  expect(screen.getByText('Brüche vergleichen')).toBeDefined();
  expect(motion.timing).toHaveBeenCalled();
  motion.timing.mockClear();
  motion.cancel.mockClear();
  act(() => {
    motion.reduced = true;
    motion.listeners.forEach((listener) => listener());
  });
  expect(motion.cancel).toHaveBeenCalled();
  expect(motion.cancel.mock.calls.some(([value]) => value.value === 1)).toBe(true);
  expect(motion.timing).not.toHaveBeenCalled();
  act(() => {
    motion.reduced = false;
    motion.listeners.forEach((listener) => listener());
  });
  expect(motion.timing).not.toHaveBeenCalled();
});

it('does not replay the optimistic message entrance when its stored replacement arrives', () => {
  const view = renderInApp(<Conversation messages={[]} pending={null} busy={false} />);
  view.rerender(<Conversation messages={[]} pending={{ text: 'Bitte hilf mir.' }} busy />);
  expect(motion.timing).toHaveBeenCalled();
  motion.timing.mockClear();
  view.rerender(
    <Conversation
      messages={[
        {
          id: 'stored',
          role: 'learner',
          text: 'Bitte hilf mir.',
          status: 'done',
          failure_code: null,
          client_message_id: null,
          options: null,
          reply_to_id: null,
          outreach: null,
          actions: [],
          roleplay_feedback: null,
          created_at: '2026-10-01T18:00:00.000Z',
        },
      ]}
      pending={null}
      busy={false}
    />,
  );
  expect(motion.timing).not.toHaveBeenCalled();
});
