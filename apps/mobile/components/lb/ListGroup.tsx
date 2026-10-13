// Grouped rows on one paper card — settings, library, menus (components/core/List.jsx). A row is
// at least 56 pt and ends in a chevron or in one action of its own; navigation and that action
// have separate targets (#548).
import { Children, type ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import { pressedStyle, ROW_SPLIT, UI } from '../../lib/theme/components.js';
import { useMotionReduced } from '../../lib/theme/motion.js';
import type { SubjectTone } from '../../lib/theme/palettes.js';
import { RADIUS } from '../../lib/theme/radius.js';
import { SHADOW } from '../../lib/theme/shadow.js';
import { SPACE, TOUCH } from '../../lib/theme/space.js';
import { TYPE } from '../../lib/theme/type.js';
import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { BusyIndicator } from './BusyIndicator.js';
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

/** The quiet action a row may end in, in the chevron's place (ui_kits/app/Library.jsx). */
type RowAction = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  busy?: boolean;
  accessibilityLabel?: string;
};

export type RowProps = {
  title: string;
  /** A factual completed row remains readable, with its title struck and muted. */
  completed?: boolean;
  destructive?: boolean;
  chevron?: boolean;
  indicator?: 'chevron' | 'more';
  sub?: string;
  value?: string;
  /** Alone it stands before the title in the accent; with `tile` it is the tile's sign. */
  icon?: IconName;
  iconTone?: 'muted' | 'accent';
  iconSize?: number;
  /** A subject's tone tile, with its letter — or with `icon` instead. */
  tile?: { letter: string; tone: SubjectTone };
  /** Something of the caller's own at the row's end (a switch, a button). */
  trailing?: ReactNode;
  /** One small action at the row's end instead of the chevron: the 32 pt pill ("Üben"). */
  action?: RowAction;
  /** More of this row under its line, inside the same padding (a control the row explains). */
  children?: ReactNode;
  onPress?: () => void;
  disabled?: boolean;
  expanded?: boolean;
  accessibilityLabel?: string;
  accessibilityHint?: string;
};

export function Row({
  title,
  completed = false,
  destructive = false,
  chevron = true,
  indicator = 'chevron',
  sub,
  value,
  icon,
  // A destructive row is not the design's: its sign stays as quiet as it was.
  iconTone = destructive ? 'muted' : 'accent',
  iconSize = UI.list.icon,
  tile,
  trailing,
  action,
  children,
  onPress,
  disabled = false,
  expanded,
  accessibilityLabel,
  accessibilityHint,
}: RowProps) {
  const { palette, tones } = useTheme();
  const end = trailing ?? (action ? <ActionPill {...action} /> : null);
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
          {icon ? (
            <Icon name={icon} size={UI.list.tileIcon} color={palette.ink} />
          ) : (
            <Text style={TYPE.listTile}>{tile.letter}</Text>
          )}
        </View>
      ) : icon ? (
        <Icon
          name={icon}
          size={iconSize}
          color={iconTone === 'accent' ? palette.primaryDk : palette.ink2}
        />
      ) : null}
      <View
        style={[
          { gap: UI.list.lineGap },
          // Beside a value the title is never squeezed (`ROW_SPLIT`, #599). Alone it takes the row.
          value ? ROW_SPLIT.title : { flex: 1, minWidth: 0 },
        ]}
      >
        <Text
          style={[
            TYPE.option,
            destructive ? { color: palette.danger } : undefined,
            completed ? { color: palette.ink2, textDecorationLine: 'line-through' } : undefined,
          ]}
        >
          {title}
        </Text>
        {sub ? <Text style={TYPE.meta}>{sub}</Text> : null}
      </View>
      {value ? (
        // The rest of the row: a short value ends at the row's edge (or before its chevron), a
        // long one wraps there, right-aligned.
        <Text style={[TYPE.listValue, ROW_SPLIT.value]}>{value}</Text>
      ) : null}
      {onPress && chevron && end == null ? (
        <Icon
          name={indicator}
          size={indicator === 'more' ? UI.list.more : UI.list.chevron}
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
    paddingVertical: UI.list.padY,
    flex: 1,
  };
  return (
    <View>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        {onPress ? (
          <Pressable
            onPress={onPress}
            disabled={disabled}
            accessibilityRole="button"
            accessibilityLabel={
              accessibilityLabel ?? [title, sub, value].filter(Boolean).join(', ')
            }
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
        {end != null ? <View style={{ paddingRight: SPACE.lg }}>{end}</View> : null}
      </View>
      {children != null ? (
        // 12 under the row's line as the design's column gap has it, of which the line's own
        // padding already gives 10; then the row's padding again below.
        <View
          style={{
            paddingHorizontal: SPACE.lg,
            paddingTop: SPACE.md - UI.list.padY,
            paddingBottom: UI.list.padY,
          }}
        >
          {children}
        </View>
      ) : null}
    </View>
  );
}

function ActionPill({
  label,
  onPress,
  disabled = false,
  busy = false,
  accessibilityLabel,
}: RowAction) {
  const { palette } = useTheme();
  const reduced = useMotionReduced();
  const off = disabled || busy;
  return (
    <Pressable
      onPress={onPress}
      disabled={off}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: off, busy }}
      aria-busy={busy || undefined}
      // The pill is 32 pt; its target is a full 44 inside the 56 pt row.
      style={{ minWidth: TOUCH, minHeight: TOUCH, justifyContent: 'center' }}
    >
      {({ pressed }) => (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: SPACE.xs,
            height: UI.list.action.height,
            paddingLeft: UI.list.action.padStart,
            paddingRight: UI.list.action.padEnd,
            borderRadius: RADIUS.round,
            backgroundColor: palette.primaryLt,
            ...(disabled
              ? { opacity: UI.disabledOpacity }
              : busy
                ? { opacity: UI.busyOpacity }
                : pressedStyle(pressed, reduced)),
          }}
        >
          <Text style={[TYPE.metaStrong, { color: palette.primaryDk }]}>{label}</Text>
          <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            {busy ? (
              <BusyIndicator size="small" color={palette.primaryDk} />
            ) : (
              <Icon name="arrow" size={UI.list.action.icon} color={palette.primaryDk} />
            )}
          </View>
        </View>
      )}
    </Pressable>
  );
}
