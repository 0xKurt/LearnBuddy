// The real pending state stays visible and announced. Only the header Orb self-animates.
import { Text, View } from 'react-native';
import { useAnnounce } from '../../lib/announce.js';
import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { PRACTICE_SCREEN } from '../../lib/theme/practiceScreen.js';
import { RADIUS, circle } from '../../lib/theme/radius.js';
import { DURATION } from '../../lib/theme/motion.js';
import { SPACE } from '../../lib/theme/space.js';
import { TYPE } from '../../lib/theme/type.js';
import { Rise } from '../lb/Motion.js';

export function Thinking({ label }: { label: string }) {
  const { palette } = useTheme();
  useAnnounce(label);
  return (
    <Rise
      delay={DURATION.practicePendingArrival}
      style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.sm }}
    >
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: PRACTICE_SCREEN.pendingGap,
          backgroundColor: palette.paper,
          borderRadius: RADIUS.round,
          paddingHorizontal: SPACE.md,
          height: PRACTICE_SCREEN.pendingPill,
        }}
      >
        {[0, 1, 2].map((i) => (
          <View
            key={i}
            style={{
              width: PRACTICE_SCREEN.pendingDot,
              height: PRACTICE_SCREEN.pendingDot,
              borderRadius: circle(PRACTICE_SCREEN.pendingDot),
              backgroundColor: palette.ink3,
            }}
          />
        ))}
      </View>
      <Text
        accessibilityLiveRegion="polite"
        style={[TYPE.meta, { color: palette.ink2, flexShrink: 1 }]}
      >
        {label}
      </Text>
    </Rise>
  );
}
