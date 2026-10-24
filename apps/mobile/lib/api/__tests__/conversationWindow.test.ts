// requires live verification in Claude Code session — only the page transport is replaced.
import type { BuddyHome, MessageView } from '@learnbuddy/shared-types/contracts';
import { expect, it, vi } from 'vitest';
import { fillConversationGap } from '../conversationWindow.js';
import { retainConversation } from '../homeCache.js';

const message = (n: number) =>
  ({
    id: String(n),
    text: String(n),
    actions: [],
    created_at: new Date(n * 1000).toISOString(),
  }) as unknown as MessageView;
const home = (from: number, to: number, more = true) =>
  ({
    context_version: to,
    thread: Array.from({ length: to - from + 1 }, (_, i) => message(from + i)),
    thread_has_more: more,
  }) as unknown as BuddyHome;

it('fills several missing pages after a long talk before joining the old chat, once per message', async () => {
  const held = home(1, 40, false);
  const load = vi.fn(async (before: string) => ({
    messages: home(Number(before) - 40, Number(before) - 1).thread,
    has_more: true,
  }));
  const filled = await fillConversationGap(home(121, 160), held, load);
  const joined = retainConversation(filled, held);
  expect(load.mock.calls.map((c) => c[0])).toEqual(['121', '81', '41']);
  expect(joined.thread.map((m) => m.id)).toEqual(home(1, 160).thread.map((m) => m.id));
  expect(joined.thread_has_more).toBe(false);
});

it('keeps a failed gap fetch retryable and does not publish an incomplete window', async () => {
  const held = home(1, 40, false);
  await expect(
    fillConversationGap(home(81, 120), held, async () => {
      throw new Error('offline');
    }),
  ).rejects.toThrow('offline');
  expect(held.thread).toHaveLength(40);
});

it('does not fetch overlapping windows and rejects a non-advancing cursor', async () => {
  const load = vi.fn(async () => ({ messages: [], has_more: true }));
  const incoming = home(30, 69);
  expect(await fillConversationGap(incoming, home(1, 40), load)).toBe(incoming);
  expect(load).not.toHaveBeenCalled();
  await expect(fillConversationGap(home(81, 120), home(1, 40), load)).rejects.toThrow(
    'did not advance',
  );
});
