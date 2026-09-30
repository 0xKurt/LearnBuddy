// The ways to start in one row (the ring's items, small): once a conversation
// is on Buddy's home, the ring makes room for it, and starting stays one tap
// away without scrolling (CLAUDE.md rule 16). Round icon, label under it.
//
// `trailing` is the menu, and it is NOT a way to start (owner decision 30.09.,
// issue #125: the header goes, the menu joins this row on the right). It sits in
// the same row but reads differently on purpose — no white disc and no shadow —
// so five taps do not look like five ways to learn.
import { Pressable, Text, View } from 'react-native';

import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { SHADOW } from '../../lib/theme/shadow.js';
import { SPACE } from '../../lib/theme/space.js';
import { MAX_FONT_SCALE } from './Btn.js';
import { Icon } from './Icon.js';
import type { OrbitItem } from './OrbitMenu.js';

const NODE = 44;
/**
 * How much room the menu takes on the right, so a card laid over this row can leave it free
 * (issue #135): the disc, the gap before it and the 6 that undo the row's negative margin.
 */
export const TRAILING_WIDTH = NODE + 8 + 6;

export function StartRow({
  items,
  trailing,
  disabled = false,
  covered = false,
}: {
  items: OrbitItem[];
  /** The menu: same row, quieter, never disabled by a turn in flight. */
  trailing?: OrbitItem;
  disabled?: boolean;
  /**
   * A card lies over this row. The ways to start go out of sight under it — the menu does
   * NOT (owner 30.09.: "wir muessen auch verhindern dass info texte das menue komplett
   * verdecken. das nervt"). The way out of a screen may never be behind something.
   */
  covered?: boolean;
}) {
  const { palette } = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        justifyContent: 'space-between',
        gap: 0,
        // Five labels share the width: a little past the gutter, never to the screen edge.
        marginHorizontal: -6,
      }}
    >
      {items.map((item) => (
        <Pressable
          key={item.key}
          onPress={item.onPress}
          disabled={disabled || covered}
          accessibilityRole="button"
          accessibilityLabel={item.label}
          accessibilityState={{ disabled }}
          // Each item is as wide as its label and shares what is left: on a 360 px phone
          // "Hausaufgabe" keeps one line (equal fifths broke it mid-word) and a
          // multi-word label ("Erklär mir was") wraps between words instead.
          style={{
            flexGrow: 1,
            flexShrink: 1,
            flexBasis: 'auto',
            minWidth: NODE,
            alignItems: 'center',
            opacity: covered ? 0 : disabled ? 0.6 : 1,
          }}
        >
          {({ pressed }) => (
            <>
              <View
                style={[
                  {
                    width: NODE,
                    height: NODE,
                    borderRadius: NODE / 2,
                    backgroundColor: palette.paper,
                    alignItems: 'center',
                    justifyContent: 'center',
                    transform: [{ scale: pressed ? 0.94 : 1 }],
                  },
                  SHADOW.soft,
                ]}
              >
                <Icon name={item.icon} size={21} color={palette.primary} />
              </View>
              <Text
                numberOfLines={3}
                // Five labels share one row: they follow the system size to the same
                // 200 % as every control label (Btn), not past it (audit M-84, issue #73).
                maxFontSizeMultiplier={MAX_FONT_SCALE}
                style={{
                  marginTop: 4,
                  // flexShrink on the parent shares the width; no hard maxWidth, so a
                  // scaled-up label wraps (up to three lines) instead of ellipsising
                  // one of the five primary ways to start.
                  alignSelf: 'stretch',
                  // Readable at a glance (user feedback #17: 11 px was too small;
                  // audit raised 12 → 13 for large-text users).
                  fontSize: 13,
                  lineHeight: 16,
                  letterSpacing: -0.2,
                  fontWeight: '600',
                  color: palette.ink,
                  textAlign: 'center',
                }}
              >
                {item.label}
              </Text>
            </>
          )}
        </Pressable>
      ))}
      {trailing ? (
        <Pressable
          key={trailing.key}
          onPress={trailing.onPress}
          accessibilityRole="button"
          accessibilityLabel={trailing.label}
          // Reachable while Buddy writes: the way out of a screen must not wait for him.
          style={{
            flexGrow: 0,
            flexShrink: 0,
            minWidth: NODE,
            alignItems: 'center',
            // A gap before it, because it is not one of the ways to start — and 6 back on
            // the right to undo the row's negative margin, which exists so four wide labels
            // may use a little more width. Without it the disc sits flush to the edge.
            marginLeft: SPACE.sm,
            paddingRight: 6,
          }}
        >
          {({ pressed }) => (
            <>
              <View
                style={{
                  width: NODE,
                  height: NODE,
                  borderRadius: NODE / 2,
                  backgroundColor: palette.primaryLt,
                  alignItems: 'center',
                  justifyContent: 'center',
                  transform: [{ scale: pressed ? 0.94 : 1 }],
                }}
              >
                <Icon name={trailing.icon} size={21} color={palette.primary} />
              </View>
              <Text
                numberOfLines={3}
                maxFontSizeMultiplier={MAX_FONT_SCALE}
                style={{
                  marginTop: 4,
                  alignSelf: 'stretch',
                  fontSize: 13,
                  lineHeight: 16,
                  letterSpacing: -0.2,
                  fontWeight: '600',
                  color: palette.ink2,
                  textAlign: 'center',
                }}
              >
                {trailing.label}
              </Text>
            </>
          )}
        </Pressable>
      ) : null}
    </View>
  );
}
