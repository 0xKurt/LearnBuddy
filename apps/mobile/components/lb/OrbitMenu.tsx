// A few ways to start, arranged on a circle around one question in the middle
// (the "today's focus" ring). Each node is a round icon button with its label
// under it; the first sits at the top, the rest follow clockwise. Sized from
// the available width so it fits a small phone and large text.
import { useState, type ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { LB } from '../../lib/theme/colors.js';
import { SHADOW } from '../../lib/theme/shadow.js';
import { Icon, type IconName } from './Icon.js';

export type OrbitItem = { key: string; label: string; icon: IconName; onPress: () => void };

const NODE = 62;
const LABEL_W = 108;

export function OrbitMenu({
  items,
  center,
  disabled = false,
}: {
  items: OrbitItem[];
  center: ReactNode;
  disabled?: boolean;
}) {
  const [width, setWidth] = useState(0);
  // The ring leaves room for the labels under the nodes.
  const size = Math.min(width, 360);
  const r = size / 2 - LABEL_W / 2;
  const cx = size / 2;
  const cy = size / 2;
  // As tall as the lowest node and its label (no empty band under the ring).
  const lowest = Math.max(
    ...items.map((_, i) => cy + r * Math.sin(-Math.PI / 2 + (i * 2 * Math.PI) / items.length)),
    cy + r,
  );
  const height = Math.min(size, lowest + NODE / 2 + 44);

  return (
    <View
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      style={{ width: '100%', alignItems: 'center' }}
    >
      {size > 0 ? (
        <View style={{ width: size, height }}>
          <View
            pointerEvents="none"
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            style={{ position: 'absolute', left: 0, top: 0 }}
          >
            <Svg width={size} height={size}>
              <Circle
                cx={cx}
                cy={cy}
                r={r}
                fill="none"
                stroke={LB.lavenderDeep}
                strokeWidth={1.2}
              />
            </Svg>
          </View>
          <View
            style={{
              position: 'absolute',
              left: cx - r * 0.72,
              top: cy - r * 0.72,
              width: r * 1.44,
              height: r * 1.44,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {center}
          </View>
          {items.map((item, i) => {
            const angle = -Math.PI / 2 + (i * 2 * Math.PI) / items.length;
            const x = cx + r * Math.cos(angle);
            const y = cy + r * Math.sin(angle);
            return (
              <Pressable
                key={item.key}
                onPress={item.onPress}
                disabled={disabled}
                accessibilityRole="button"
                accessibilityLabel={item.label}
                accessibilityState={{ disabled }}
                style={{
                  position: 'absolute',
                  left: x - LABEL_W / 2,
                  top: y - NODE / 2,
                  width: LABEL_W,
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
                          backgroundColor: '#fff',
                          alignItems: 'center',
                          justifyContent: 'center',
                          transform: [{ scale: pressed ? 0.94 : 1 }],
                        },
                        SHADOW.soft,
                      ]}
                    >
                      <Icon name={item.icon} size={26} color={LB.primary} />
                    </View>
                    <Text
                      numberOfLines={2}
                      style={{
                        marginTop: 6,
                        fontSize: 14,
                        lineHeight: 18,
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
            );
          })}
        </View>
      ) : null}
    </View>
  );
}
