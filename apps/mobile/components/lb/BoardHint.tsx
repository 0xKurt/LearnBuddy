// The one line under an answer board that says what a tap does (design ui_kits/app/Tasks.jsx
// `Hint`: 400 14/20 in the secondary ink, 4 pt in from the board's edge). Always BELOW the board,
// never above it: the board stands directly under the question (CLAUDE.md rule 19).

import { Text } from 'react-native';

import { BOARD } from '../../lib/theme/board.js';
import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { TYPE } from '../../lib/theme/type.js';

export function BoardHint({ children, testID }: { children: string; testID?: string }) {
  const { palette } = useTheme();
  return (
    <Text
      testID={testID}
      style={[TYPE.meta, { color: palette.ink2, paddingHorizontal: BOARD.hintInset }]}
    >
      {children}
    </Text>
  );
}
