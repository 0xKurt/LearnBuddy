// The free room on the practice screen (issues #286, #386): one flexible spacer between the
// question with its conversation at the top and the answer at the bottom, right above its action.
// What nobody needs collects here, and the answer never floats above an empty band.
//
// Its height is reported to the screen (`FreeSpaceReport`), because the conversation may take it:
// the screen shows as many whole turns as fit into the conversation's box plus this room
// (app/practice/[id].tsx). The answer shell places it, above the answer (`AnswerShell`, issues
// #310, #386).

import { createContext, useContext } from 'react';
import { View } from 'react-native';

/** Where a spacer reports its height; the screen provides it. */
export const FreeSpaceReport = createContext<(height: number) => void>(() => undefined);

export function FreeSpace() {
  const report = useContext(FreeSpaceReport);
  return (
    <View
      testID="free-space"
      style={{ flexGrow: 1, flexShrink: 1, minHeight: 0 }}
      onLayout={(e) => report(Math.round(e.nativeEvent.layout.height))}
    />
  );
}
