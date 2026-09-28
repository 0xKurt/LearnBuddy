// The ways to start in one row (the ring's items, small): once a conversation
// is on Buddy's home, the ring makes room for it, and starting stays one tap
// away without scrolling (CLAUDE.md rule 16). Round icon, label under it.
import { Pressable, Text, View } from 'react-native';

import { LB } from '../../lib/theme/colors.js';
import { SHADOW } from '../../lib/theme/shadow.js';
import { Icon } from './Icon.js';
import type { OrbitItem } from './OrbitMenu.js';

const NODE = 44;

export function StartRow({ items, disabled = false }: { items: OrbitItem[]; disabled?: boolean }) {
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
          disabled={disabled}
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
            opacity: disabled ? 0.6 : 1,
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
                    backgroundColor: LB.paper,
                    alignItems: 'center',
                    justifyContent: 'center',
                    transform: [{ scale: pressed ? 0.94 : 1 }],
                  },
                  SHADOW.soft,
                ]}
              >
                <Icon name={item.icon} size={21} color={LB.primary} />
              </View>
              <Text
                numberOfLines={3}
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
                  color: LB.ink,
                  textAlign: 'center',
                }}
              >
                {item.label}
              </Text>
            </>
          )}
        </Pressable>
      ))}
    </View>
  );
}
