// The live preview of what she typed, with its math set properly ("3/4" as a
// stacked fraction, "x^2" raised, "sqrt(16)" with a root sign), so she sees how
// her answer is read. It appears only once there is math worth drawing
// (lib/math/typed.ts); after that it keeps its place and keeps mirroring the
// field until the field is empty, so nothing jumps with every key.
// `compact` is the one inside the answer pill (issue #16): a thin line without a
// label of its own, so the pinned bar stays a bar.

import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View, useWindowDimensions } from 'react-native';

import { typedMath } from '../../lib/math/typed.js';
import { LB } from '../../lib/theme/colors.js';
import { TYPE } from '../../lib/theme/type.js';
import { MathText } from './MathText.js';
import { useSpokenMath } from './useSpokenMath.js';

/** Room for a simple stacked fraction at the preview's size, so it never jumps when one appears. */
const MIN_HEIGHT = 50;
const MATH_STYLE = { fontSize: 18, lineHeight: 26, color: LB.ink } as const;
/** Inside the pill: one quiet line under the field – it may not make the pill grow much. */
const COMPACT_MIN_HEIGHT = 26;
const COMPACT_MATH_STYLE = { fontSize: 15, lineHeight: 21, color: LB.ink2 } as const;

export function TypedMathPreview({ value, compact = false }: { value: string; compact?: boolean }) {
  const { t } = useTranslation('math');
  const { fontScale } = useWindowDimensions();
  const typed = useMemo(() => typedMath(value), [value]);
  const empty = value.trim().length === 0;
  // Once shown, the row stays until the field is cleared (derived state, updated while rendering).
  const [held, setHeld] = useState(false);
  if (typed.worth && !held) setHeld(true);
  if (empty && held) setHeld(false);
  const spoken = useSpokenMath(typed.text);

  if (empty || (!typed.worth && !held)) return null;
  return (
    <View
      accessible
      accessibilityLabel={t('preview.a11y', { math: spoken })}
      style={{
        flexDirection: 'row',
        flexWrap: 'wrap',
        alignItems: 'center',
        columnGap: 10,
        minHeight: Math.ceil((compact ? COMPACT_MIN_HEIGHT : MIN_HEIGHT) * fontScale),
        paddingHorizontal: 4,
      }}
    >
      {compact ? null : <Text style={TYPE.label}>{t('preview.label')}</Text>}
      <View style={{ flexShrink: 1 }}>
        <MathText
          text={typed.text}
          accessible={false}
          style={compact ? COMPACT_MATH_STYLE : MATH_STYLE}
        />
      </View>
    </View>
  );
}
