// The question on paper (design components/practice/Option.jsx:27–33): one quiet meta line, the
// question, and what the adapter hangs under it. Content slots only; the practice adapters own
// prompts, figures, audio and disclosure. A drawing brings its own frame (`FigureView`), so the
// card adds none around it.
import type { ReactNode } from 'react';
import { Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { PRACTICE } from '../../lib/theme/practice.js';
import { QUESTION } from '../../lib/theme/question.js';
import { RADIUS } from '../../lib/theme/radius.js';
import { SHADOW } from '../../lib/theme/shadow.js';
import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { TYPE } from '../../lib/theme/type.js';

type Props = {
  /** "Thema · von Buddy": one line, gone once the card is `compact`. */
  meta?: ReactNode;
  children: ReactNode;
  extra?: ReactNode;
  /** After her answer: the question steps back to a quiet line (`14px 18px`). */
  compact?: boolean;
  /** While she types in tight keyboard room: the app's own smaller padding (#419). */
  snug?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

export function QuestionCard({
  meta,
  children,
  extra,
  compact = false,
  snug = false,
  style,
  testID,
}: Props) {
  const { palette } = useTheme();
  return (
    <View
      testID={testID}
      style={[
        {
          backgroundColor: palette.paper,
          borderRadius: RADIUS.lg,
          gap: PRACTICE.contentGap,
        },
        compact
          ? { paddingHorizontal: QUESTION.compactPadX, paddingVertical: QUESTION.compactPadY }
          : { padding: snug ? QUESTION.typingPad : QUESTION.pad },
        SHADOW.soft,
        style,
      ]}
    >
      {compact ? null : typeof meta === 'string' ? (
        <Text numberOfLines={1} style={[TYPE.label, { color: palette.ink2 }]}>
          {meta}
        </Text>
      ) : (
        meta
      )}
      {typeof children === 'string' ? (
        <Text
          accessibilityRole="header"
          style={[
            compact ? TYPE.questionFeedback : TYPE.question,
            { color: compact ? palette.ink2 : palette.ink },
          ]}
        >
          {children}
        </Text>
      ) : (
        children
      )}
      {extra}
    </View>
  );
}
