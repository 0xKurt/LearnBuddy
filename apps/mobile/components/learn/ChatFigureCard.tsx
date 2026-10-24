// The same picture and zoom as practice, with the library's checked labels (#934).
import type { ActionSummary } from '@learnbuddy/shared-types/contracts';
import { Text, View } from 'react-native';
import { boardCap } from '../../lib/practice/visuals.js';
import { SPACE } from '../../lib/theme/space.js';
import { TYPE } from '../../lib/theme/type.js';
import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { useVisibleHeight } from '../../lib/useVisibleHeight.js';
import { QuestionFigure } from '../practice/QuestionFigure.js';

export default function ChatFigureCard({
  picture,
}: {
  picture: Extract<ActionSummary, { tool: 'show_figure' }>;
}) {
  useTheme();
  const { visible } = useVisibleHeight();
  return (
    <View testID="chat-figure" style={{ gap: SPACE.sm }}>
      <QuestionFigure figure={picture.figure} maxHeight={boardCap(visible)} />
      {picture.labels.length > 0 ? (
        <Text style={TYPE.meta}>{picture.labels.join(' · ')}</Text>
      ) : null}
    </View>
  );
}
