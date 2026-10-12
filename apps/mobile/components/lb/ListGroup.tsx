// Grouped settings/material rows; navigation and trailing actions have separate targets (#548).
import { Children, type ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import { UI } from '../../lib/theme/components.js';
import type { SubjectTone } from '../../lib/theme/palettes.js';
import { RADIUS } from '../../lib/theme/radius.js';
import { SHADOW } from '../../lib/theme/shadow.js';
import { SPACE } from '../../lib/theme/space.js';
import { TYPE } from '../../lib/theme/type.js';
import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { Icon, type IconName } from './Icon.js';

export function ListGroup({ label, children }: { label?: string; children: ReactNode }) {
  const { palette } = useTheme();
  return (
    <View style={{ gap: SPACE.sm }}>
      {label ? (
        <Text accessibilityRole="header" style={[TYPE.label, { paddingHorizontal: SPACE.xs }]}>
          {label}
        </Text>
      ) : null}
      <View style={{ backgroundColor: palette.paper, borderRadius: RADIUS.lg, ...SHADOW.soft }}>
        <View style={{ borderRadius: RADIUS.lg, overflow: 'hidden' }}>
          {Children.toArray(children).map((child, i) => (
            <View
              key={typeof child === 'object' && child !== null && 'key' in child ? child.key : i}
              style={
                i ? { borderTopWidth: UI.border, borderTopColor: palette.hairline } : undefined
              }
            >
              {child}
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}
export type RowProps = {
  title: string;
  /** A factual completed row remains readable, with its title struck and muted. */
  completed?: boolean;
  chevron?: boolean;
  indicator?: 'chevron' | 'more';
  sub?: string;
  value?: string;
  icon?: IconName;
  iconTone?: 'muted' | 'accent';
  iconSize?: number;
  tile?: { letter: string; tone: SubjectTone };
  trailing?: ReactNode;
  onPress?: () => void;
  disabled?: boolean;
  expanded?: boolean;
  accessibilityLabel?: string;
  accessibilityHint?: string;
};
export function Row({
  title,
  completed = false,
  chevron = true,
  indicator = 'chevron',
  sub,
  value,
  icon,
  iconTone = 'muted',
  iconSize = UI.list.icon,
  tile,
  trailing,
  onPress,
  disabled = false,
  expanded,
  accessibilityLabel,
  accessibilityHint,
}: RowProps) {
  const { palette, tones } = useTheme();
  const content = (
    <>
      {tile ? (
        <View
          style={{
            width: UI.list.tile,
            height: UI.list.tile,
            borderRadius: RADIUS.sm,
            backgroundColor: tones.bg[tile.tone],
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text style={[TYPE.title, { color: palette.ink }]}>{tile.letter}</Text>
        </View>
      ) : icon ? (
        <Icon
          name={icon}
          size={iconSize}
          color={iconTone === 'accent' ? palette.primaryDk : palette.ink2}
        />
      ) : null}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text
          style={[
            TYPE.cell,
            completed ? { color: palette.ink2, textDecorationLine: 'line-through' } : undefined,
          ]}
        >
          {title}
        </Text>
        {sub ? <Text style={TYPE.meta}>{sub}</Text> : null}
      </View>
      {value ? <Text style={TYPE.meta}>{value}</Text> : null}
      {onPress && chevron && trailing == null ? (
        <Icon
          name={indicator}
          size={indicator === 'more' ? UI.list.icon : UI.list.chevron}
          color={palette.ink3}
        />
      ) : null}
    </>
  );
  const style = {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: SPACE.md,
    minHeight: UI.list.row,
    paddingHorizontal: SPACE.lg,
    paddingVertical: SPACE.md,
    flex: 1,
  };
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      {onPress ? (
        <Pressable
          onPress={onPress}
          disabled={disabled}
          accessibilityRole="button"
          accessibilityLabel={accessibilityLabel ?? [title, sub, value].filter(Boolean).join(', ')}
          accessibilityHint={accessibilityHint}
          accessibilityState={{ disabled, ...(expanded === undefined ? {} : { expanded }) }}
          aria-expanded={expanded}
          style={{ flex: 1 }}
        >
          {({ pressed }) => (
            <View
              style={[
                style,
                {
                  backgroundColor: pressed ? palette.canvas : 'transparent',
                  opacity: disabled ? UI.disabledOpacity : 1,
                },
              ]}
            >
              {content}
            </View>
          )}
        </Pressable>
      ) : (
        <View style={style}>{content}</View>
      )}
      {trailing != null ? <View style={{ paddingRight: SPACE.lg }}>{trailing}</View> : null}
    </View>
  );
}
