// The live preview of what she typed, with its math set properly ("3/4" as a stacked fraction,
// "x^2" raised, "sqrt(16)" with a root sign), so she sees how her answer is read. One quiet line
// inside the input bar, under her text (issue #16), so the pinned bar stays a bar.
//
// It shows only while the line she is on looks different when set (lib/math/typed.ts `worth`): a
// fraction, a root, a power, a redrawn operator. Plain digits, "·" and "+" are never mirrored —
// until #522 a preview, once shown, stayed and repeated "29" under a "29" ("was sollen die random
// zahlen", owner 09.10.).

import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { View, useWindowDimensions } from 'react-native';

import { typedMath } from '../../lib/math/typed.js';
import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { TYPE } from '../../lib/theme/type.js';
import { SPACE } from '../../lib/theme/space.js';
import { MathText } from './MathText.js';
import { useSpokenMath } from './useSpokenMath.js';

/** Room for a simple stacked fraction on the line, so it never jumps when one appears. */
const MIN_HEIGHT = 26;

export function TypedMathPreview({ value }: { value: string }) {
  const { palette } = useTheme();
  const { t } = useTranslation('math');
  const { fontScale } = useWindowDimensions();
  const typed = useMemo(() => typedMath(value), [value]);
  const spoken = useSpokenMath(typed.text);

  if (value.trim().length === 0 || !typed.worth) return null;
  return (
    <View
      accessible
      accessibilityLabel={t('preview.a11y', { math: spoken })}
      style={{
        flexDirection: 'row',
        flexWrap: 'wrap',
        alignItems: 'center',
        minHeight: Math.ceil(MIN_HEIGHT * fontScale),
        paddingHorizontal: SPACE.sm,
      }}
    >
      <View style={{ flexShrink: 1 }}>
        <MathText
          text={typed.text}
          accessible={false}
          style={{
            fontSize: TYPE.small.fontSize,
            lineHeight: TYPE.small.lineHeight,
            color: palette.ink2,
          }}
        />
      </View>
    </View>
  );
}
