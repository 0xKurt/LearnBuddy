// How the practice screen shares its room (`useScreenRoom`, lib/practice/screenRoom.ts). The
// card's drawing gives room to Buddy's newest turn in the column the screen measures — never in
// the ordinary body, which has no such box: there the give took up to 48 pt off the pie of
// "Berechne 1/5 + 2/5" while Buddy checked her answer, and the frame stood empty (#642).

import type { Figure, ItemView, PracticeTurnView } from '@learnbuddy/shared-types/contracts';
import { act, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { useScreenRoom } from '../../../lib/practice/screenRoom.js';
import { visualCaps } from '../../../lib/practice/visuals.js';

const seen = vi.hoisted(() => ({ window: 740, overlap: 0, visible: 740 }));
vi.mock('../../../lib/useVisibleHeight.js', () => ({ useVisibleHeight: () => seen }));

const pie: Figure = { type: 'fraction', shape: 'circle', fractions: [{ parts: 5, filled: 1 }] };
const item = { id: 'i1', kind: 'short', figure: pie, image: null } as unknown as ItemView;
const turn = { id: 't1', role: 'learner', text: '3/5' } as unknown as PracticeTurnView;

type Room = ReturnType<ReturnType<typeof useScreenRoom>['layout']>;
type Probe = { room: Room; setThreadNeed: (h: number) => void };

function Screen({ ordinary, into }: { ordinary: boolean; into: { now: Probe | null } }) {
  const measured = useScreenRoom();
  const room = measured.layout({
    item,
    open: true,
    speaking: false,
    threadTurns: [turn],
    turnsAgain: [],
    quiet: false,
    dictationCompact: false,
    ordinary,
    viewHeight: 740,
    windowWidth: 390,
    safeBottom: 0,
  });
  into.now = { room, setThreadNeed: measured.setThreadNeed };
  return null;
}

/** The card measured at its own height, then her answer and "Buddy schaut …" under it. */
function checking(ordinary: boolean): Room {
  const into: { now: Probe | null } = { now: null };
  render(<Screen ordinary={ordinary} into={into} />);
  act(() => into.now?.room.onCard(260));
  act(() => into.now?.setThreadNeed(120));
  const room = into.now?.room;
  if (!room) throw new Error('not laid out');
  return room;
}

describe('the drawing gives room to the conversation', () => {
  it('in the column the screen measures', () => {
    const room = checking(false);
    expect(room.cardGrowTo).toBeLessThan(0);
    expect(room.caps.figure).toBeLessThan(visualCaps(740, 0).figure);
  });

  it('never in the ordinary body, which scrolls itself (#642)', () => {
    const room = checking(true);
    expect(room.cardGrowTo).toBe(0);
    expect(room.caps).toEqual(visualCaps(740, 0));
  });
});
