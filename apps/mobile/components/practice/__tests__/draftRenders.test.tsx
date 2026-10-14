// Typing an answer draws the field, not the practice screen around it (#713). Measured on the
// POCO X3 (14.10.): ~120 ms of JS per keystroke in release, because the screen held her draft as
// state — every key re-rendered the head, the question card, the menus and the answer area.
// The draft is a store now: who shows it reads it, the screen learns only what it decides on.

import { act, renderHook } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

vi.mock('../../../lib/api/outboxStorage.js', () => ({
  readItem: () => Promise.resolve(null),
  writeItem: () => Promise.resolve(),
}));

const { useDraftSelect, useDraftText } = await import('../../../lib/drafts.js');
const { usePracticeDrafts } = await import('../../../lib/practice/usePracticeDrafts.js');

it('does not render the holder of the drafts for the keys she types', async () => {
  let screenRenders = 0;
  const screen = renderHook(() => {
    screenRenders += 1;
    return usePracticeDrafts('renders.test');
  });
  await act(async () => {});
  const field = renderHook(() => useDraftText(screen.result.current.answer));
  const before = screenRenders;
  for (const typed of ['3', '31', '313', '3131']) act(() => screen.result.current.setText(typed));
  expect(screenRenders).toBe(before);
  // …while what shows the answer has it.
  expect(field.result.current).toBe('3131');
});

it('renders a reader of a decision about the draft only when that decision changes', async () => {
  const screen = renderHook(() => usePracticeDrafts('select.test'));
  await act(async () => {});
  let renders = 0;
  const judged = renderHook(() => {
    renders += 1;
    return useDraftSelect(screen.result.current.answer, (text) => text === '7');
  });
  const before = renders;
  act(() => screen.result.current.setText('7'));
  expect(judged.result.current).toBe(true);
  for (const typed of ['71', '712', '7123']) act(() => screen.result.current.setText(typed));
  expect(judged.result.current).toBe(false);
  // Two changes of the answer to "is it what was judged?": two renders, not four.
  expect(renders - before).toBe(2);
});
