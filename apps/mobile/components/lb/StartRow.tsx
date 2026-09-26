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
        marginHorizontal: -12,
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
          style={{ flex: 1, alignItems: 'center', opacity: disabled ? 0.6 : 1 }}
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
                numberOfLines={2}
                style={{
                  marginTop: 4,
                  fontSize: 11,
                  lineHeight: 14,
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
