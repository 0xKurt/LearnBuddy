// The free room on the practice screen (issue #286): one flexible spacer under the way to answer,
// above the pinned controls. The question, the conversation and the answer form stand together at
// the top; what nobody needs collects here, at the bottom, instead of as a hole in the middle.
//
// Its height is reported to the screen (`FreeSpaceReport`), because the conversation may take it:
// the screen shows as many whole turns as fit into the conversation's box plus this room
// (app/practice/[id].tsx). A form in the answer shell gets it there, between its answer and
// "Prüfen" (`AnswerShell`, issue #310); the forms not moved into the shell yet get it from the
// screen.

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
