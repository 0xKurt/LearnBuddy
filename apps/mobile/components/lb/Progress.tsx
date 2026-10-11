import { View } from 'react-native';
import { UI } from '../../lib/theme/components.js';
import { SPACE } from '../../lib/theme/space.js';
import { RADIUS } from '../../lib/theme/radius.js';
import { useTheme } from '../../lib/theme/ThemeProvider.js';
type Props = (
  | { value: number; total?: never; current?: never; part?: never }
  | { value?: never; total: number; current: number; part?: number }
) & { accessibilityLabel?: string };
function unit(value: number) {
  return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
}
/** Legacy fractional progress remains supported until callers supply an actual task count. */
export function Progress(props: Props) {
  const { palette } = useTheme();
  if (props.value !== undefined) {
    const value = unit(props.value);
    return (
      <View
        accessibilityRole="progressbar"
        accessibilityLabel={props.accessibilityLabel}
        accessibilityValue={{ min: 0, max: 1, now: value }}
        aria-valuemin={0}
        aria-valuemax={1}
        aria-valuenow={value}
        style={{
          flex: 1,
          height: UI.progress.legacyHeight,
          borderRadius: RADIUS.round,
          backgroundColor: palette.primaryLt,
          overflow: 'hidden',
        }}
      >
        <View
          style={{
            width: `${value * 100}%`,
            height: '100%',
            backgroundColor: palette.primary,
            borderRadius: RADIUS.round,
          }}
        />
      </View>
    );
  }
  const total = Number.isFinite(props.total) ? Math.max(0, Math.floor(props.total)) : 0;
  const current = Number.isFinite(props.current)
    ? Math.max(0, Math.min(total, Math.floor(props.current)))
    : 0;
  const part = unit(props.part ?? UI.progress.currentPart);
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={props.accessibilityLabel}
      aria-valuemin={0}
      aria-valuemax={total}
      aria-valuenow={Math.min(total, current + (current < total ? part : 0))}
      accessibilityValue={{
        min: 0,
        max: total,
        now: Math.min(total, current + (current < total ? part : 0)),
      }}
      style={{ flex: 1, flexDirection: 'row', gap: SPACE.xs }}
    >
      {Array.from({ length: total }, (_, i) => (
        <View
          key={i}
          style={{
            flex: 1,
            height: UI.progress.height,
            borderRadius: RADIUS.round,
            backgroundColor: palette.ink4,
            overflow: 'hidden',
          }}
        >
          <View
            style={{
              width: `${(i < current ? 1 : i === current ? part : 0) * 100}%`,
              height: '100%',
              backgroundColor: palette.primary,
            }}
          />
        </View>
      ))}
    </View>
  );
}
