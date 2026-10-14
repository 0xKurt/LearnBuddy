// While Buddy writes, only the end of the conversation is drawn again (#637, #715). Measured on
// the POCO X3 (dev JS, React Profiler, 14.10.): one render of a ten-message thread took ~150 ms,
// and the thread rendered for every piece of the reply that arrived and for every frame of its
// smooth reveal — every row and every formula, over and over, for words that stood still.

import type { MessageView } from '@learnbuddy/shared-types/contracts';
import { act } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

import { renderInApp } from '../../../testing/render.js';
import { Conversation } from '../Conversation.js';

const drawn = vi.hoisted(() => new Map<string, number>());
vi.mock('../RichText.js', () => ({
  RichText: ({ text }: { text: string }) => {
    drawn.set(text, (drawn.get(text) ?? 0) + 1);
    return <span>{text}</span>;
  },
}));
vi.mock('../../lb/BuddyOrb.js', () => ({ BuddyOrb: () => null }));

afterEach(() => vi.unstubAllGlobals());

function said(i: number): MessageView {
  return {
    id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
    role: i % 2 === 0 ? 'learner' : 'buddy',
    text: `Nachricht ${i}`,
    status: 'done',
    failure_code: null,
    client_message_id: null,
    options: null,
    reply_to_id: null,
    outreach: null,
    actions: [],
    roleplay_feedback: null,
    created_at: `2026-10-14T18:${String(i).padStart(2, '0')}:00.000Z`,
  };
}

it('draws none of the earlier messages again while the reply arrives piece by piece and is revealed', () => {
  const frames: FrameRequestCallback[] = [];
  vi.stubGlobal('requestAnimationFrame', (frame: FrameRequestCallback) => frames.push(frame));
  vi.stubGlobal('cancelAnimationFrame', () => undefined);
  const thread = Array.from({ length: 10 }, (_, i) => said(i));
  const pending = { text: 'Was ist ein Nenner?' };
  const reply =
    'Der Nenner ist die untere Zahl in einem Bruch, sie sagt in wie viele Teile geteilt wird.';
  const view = (live: string | null) => (
    <Conversation messages={thread} pending={pending} live={live} busy />
  );
  const screen = renderInApp(view(null));
  // Once on screen, what arrives from now on may enter (Conversation `committed`): the rows
  // learn that once. From here on nothing of theirs changes.
  act(() => screen.rerender(view(null)));
  drawn.clear();
  for (let end = 12; end <= reply.length; end += 12) {
    act(() => screen.rerender(view(reply.slice(0, end))));
    // A few frames of the smooth reveal between two pieces.
    for (let f = 0; f < 3; f += 1) act(() => frames.shift()?.(Date.now() + 16 * f));
  }
  for (const m of thread) expect(drawn.get(m.text) ?? 0).toBe(0);
  // …while the reply itself was drawn as it grew.
  expect([...drawn.keys()].some((text) => text.startsWith('Der Nenner ist'))).toBe(true);
});
