// Content slots only; the practice adapters own prompts, figures, audio and disclosure.
import type { ReactNode } from 'react';
import { Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { PRACTICE } from '../../lib/theme/practice.js';
import { RADIUS } from '../../lib/theme/radius.js';
import { SHADOW } from '../../lib/theme/shadow.js';
import { CARD_PAD } from '../../lib/theme/space.js';
import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { TYPE } from '../../lib/theme/type.js';

type Props = {
  meta?: ReactNode;
  children: ReactNode;
  figure?: ReactNode;
  extra?: ReactNode;
  compact?: boolean;
  big?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

export function QuestionCard({
  meta,
  children,
  figure,
  extra,
  compact = false,
  big = false,
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
          padding: compact ? CARD_PAD.snug : CARD_PAD.base,
          gap: PRACTICE.contentGap,
        },
        SHADOW.soft,
        style,
      ]}
    >
      {typeof meta === 'string' ? (
        <Text style={[TYPE.meta, { color: palette.ink2 }]}>{meta}</Text>
      ) : (
        meta
      )}
      {typeof children === 'string' ? (
        <Text
          accessibilityRole="header"
          style={[
            big ? TYPE.questionBig : TYPE.question,
            { color: palette.ink },
            big ? { textAlign: 'center' } : null,
          ]}
        >
          {children}
        </Text>
      ) : (
        children
      )}
      {figure}
      {extra}
    </View>
  );
}
