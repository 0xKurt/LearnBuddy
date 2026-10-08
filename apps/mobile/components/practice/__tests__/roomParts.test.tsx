// The practice screen's room after a resize (issue #484). On the web a layout event measures its
// view a moment after the resize it reports (react-native-web: a ResizeObserver, then `measure`
// in a timeout); a render in between gave a passing 0 for the conversation's box AND the free
// room, and no event followed once the view was back at the size the observer had seen. The
// room stayed 0, the box took its height undecided, and the "Tipp" row stood cut at 360×440.
// `useScreenRoom` reads both parts again after every render: what is drawn wins over a stale
// event. jsdom has no ResizeObserver, so no layout event arrives here at all — the stale 0 is
// reported by hand, and the drawn height is the node's own (`offsetHeight`, what
// react-native-web's `measure` reads).

import type { ItemView } from '@learnbuddy/shared-types/contracts';
import { act } from '@testing-library/react';
import { View } from 'react-native';
import { describe, expect, it } from 'vitest';

import { useScreenRoom } from '../../../lib/practice/screenRoom.js';
import { renderInApp } from '../../../testing/render.js';
import { FreeSpace, FreeSpaceReport } from '../FreeSpace.js';
import { ThreadBox } from '../ThreadBox.js';

const ITEM = {
  id: '00000000-0000-4000-8000-0000000000aa',
  kind: 'short_answer',
  task_view: null,
  figure: null,
  image: null,
} as unknown as ItemView;

type Seen = { room: ReturnType<typeof useScreenRoom>; cap: number | undefined };

function Screen({ seen }: { seen: Seen[] }) {
  const room = useScreenRoom();
  const { threadCap, threadFloor, threadHolds, tops } = room.layout({
    item: ITEM,
    open: true,
    speaking: false,
    threadTurns: [],
    quiet: false,
    dictationCompact: false,
    viewHeight: 440,
    windowWidth: 360,
    safeBottom: 0,
  });
  seen.push({ room, cap: threadCap });
  return (
    <View ref={room.columnRef}>
      <ThreadBox
        cap={threadCap}
        floor={threadFloor}
        holds={threadHolds}
        tops={tops}
        followEnd
        box={room.thread}
        onNeed={room.setThreadNeed}
        onParts={room.setPartTops}
      >
        {[]}
      </ThreadBox>
      <FreeSpaceReport.Provider value={room.free}>
        <FreeSpace />
      </FreeSpaceReport.Provider>
      <View ref={room.endRef} />
    </View>
  );
}

/** The node's drawn height, as react-native-web's `measure` reads it. */
function draws(node: unknown, height: number) {
  Object.defineProperty(node as HTMLElement, 'offsetHeight', {
    configurable: true,
    get: () => height,
  });
}

/** One render, and the measurements it starts (`measure` answers in a timeout on the web). */
async function settle() {
  await act(() => new Promise((done) => setTimeout(done, 10)));
}

describe('the practice room after a resize (issue #484)', () => {
  it('takes the drawn box over a stale layout event: the "Tipp" row is whole or not drawn', async () => {
    const seen: Seen[] = [];
    const view = renderInApp(<Screen seen={seen} />);
    await settle();
    const latest = () => seen[seen.length - 1]!;
    // The conversation of 297e at 360×440: 309 pt, its "Tipp" row 64 pt from its end.
    act(() => {
      latest().room.setThreadNeed(309);
      latest().room.setPartTops([0, 241]);
    });
    // The box flex-grew to 49 pt while it was undecided; the free room gave all of it. The layout
    // events that came read both at a passing 0, and none followed.
    draws(latest().room.thread.ref.current, 49);
    draws(latest().room.free.ref.current, 0);
    act(() => {
      latest().room.thread.onHeight(0);
      latest().room.free.onHeight(0);
    });
    // Taken at its word, no room: the box is left undecided, and it shows the row cut.
    expect(latest().cap).toBeUndefined();
    view.rerender(<Screen seen={seen} />);
    await settle();
    // 49 pt are room: too little for the row (64), so the box draws none of it — never a cut row.
    expect(latest().cap).toBe(0);
  });
});
