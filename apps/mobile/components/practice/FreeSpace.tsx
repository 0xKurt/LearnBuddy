// The free room on the practice screen (issues #286, #386): one flexible spacer between the
// question with its conversation at the top and the answer at the bottom, right above its action.
// What nobody needs collects here, and the answer never floats above an empty band.
//
// Its height is reported to the screen (`FreeSpaceReport`, a `RoomPart`: its layout event and its
// node, read again after every render — issue #484), because the conversation may take it:
// the screen shows as many whole turns as fit into the conversation's box plus this room
// (app/practice/[id].tsx). The answer shell places it, above the answer (`AnswerShell`, issues
// #310, #386).

import { createContext, useContext } from 'react';
import { View } from 'react-native';

import type { RoomPart } from '../../lib/practice/screenRoom.js';

/** Where a spacer reports its height; the screen provides it. */
export const FreeSpaceReport = createContext<RoomPart>({
  ref: { current: null },
  onHeight: () => undefined,
});

export function FreeSpace() {
  const report = useContext(FreeSpaceReport);
  return (
    <View
      testID="free-space"
      ref={report.ref}
      style={{ flexGrow: 1, flexShrink: 1, minHeight: 0 }}
      onLayout={(e) => report.onHeight(Math.round(e.nativeEvent.layout.height))}
    />
  );
}
