// Buddy is writing (components/buddy/Cards.jsx:96–103): his mini orb, thinking, and three still
// dots on a paper pill. Only the orb moves by itself (HANDOFF §4); the words are for a screen
// reader, which hears them as a polite live region.
import { View } from 'react-native';

import { useAnnounce } from '../../lib/announce.js';
import { CHAT } from '../../lib/theme/chat.js';
import { circle, RADIUS } from '../../lib/theme/radius.js';
import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { ThreadOrb } from './WorkingNote.js';

export function TypingBubble({ label }: { label: string }) {
  const { palette } = useTheme();
  // iOS has no live regions: "Buddy schreibt" says itself (lib/announce.ts).
  useAnnounce(label);
  return (
    <View
      accessible
      // A status: the one role under which a name without visible words is allowed (axe
      // aria-prohibited-attr), and a polite live region by itself.
      role="status"
      accessibilityLabel={label}
      accessibilityLiveRegion="polite"
      style={{ flexDirection: 'row', alignItems: 'center', gap: CHAT.typing.gap }}
    >
      <ThreadOrb size={CHAT.typing.orb} state="think" />
      <View
        style={{
          flexDirection: 'row',
          gap: CHAT.typing.dotGap,
          paddingHorizontal: CHAT.typing.padX,
          paddingVertical: CHAT.typing.padY,
          borderRadius: RADIUS.round,
          backgroundColor: palette.paper,
        }}
      >
        {CHAT.typingDots.map((opacity) => (
          <View
            key={opacity}
            style={{
              width: CHAT.typing.dot,
              height: CHAT.typing.dot,
              borderRadius: circle(CHAT.typing.dot),
              backgroundColor: palette.ink3,
              opacity,
            }}
          />
        ))}
      </View>
    </View>
  );
}
