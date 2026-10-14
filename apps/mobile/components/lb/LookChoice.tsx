// Supplied-design family tiles and explicit system/light/dark modes (#548).
// ThemeProvider retains the existing persisted values and system-follow behavior.
import { startTransition, useOptimistic } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';
import { pressedStyle } from '../../lib/theme/components.js';
import { useMotionReduced } from '../../lib/theme/motion.js';
import { LOOK } from '../../lib/theme/look.js';
import { RADIUS } from '../../lib/theme/radius.js';
import {
  FAMILIES,
  paletteOf,
  themeNameOf,
  type Family,
  type Mode,
} from '../../lib/theme/palettes.js';
import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { TYPE } from '../../lib/theme/type.js';
import { Icon } from './Icon.js';
import { Segmented } from './Segmented.js';

/**
 * The chosen value as she sees it, and how a tap chooses one. Repainting the whole app in a new
 * palette takes 2–4.5 s on the phone (#640); the control must not wait for it (#642). The tapped
 * choice shows in the tap's own commit, and the theme follows in a transition behind it.
 */
function useChoice<T>(chosen: T, choose: (next: T) => void): [T, (next: T) => void] {
  const [shown, show] = useOptimistic(chosen);
  const pick = (next: T) =>
    startTransition(() => {
      show(next);
      choose(next);
    });
  return [shown, pick];
}

export function FamilyChoice({ variant = 'settings' }: { variant?: 'settings' | 'onboarding' }) {
  const { t } = useTranslation('settings');
  const { palette, family: chosen, choose } = useTheme();
  const [family, pick] = useChoice(chosen, (f: Family) => choose({ family: f }));
  const geometry = LOOK[variant];
  const reduced = useMotionReduced();
  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={t('look.question')}
      style={{ flexDirection: 'row', gap: LOOK.groupGap }}
    >
      {FAMILIES.map((f) => {
        const selected = f === family;
        const accent = paletteOf(themeNameOf(f, false));
        return (
          <Pressable
            key={f}
            accessibilityRole="radio"
            accessibilityLabel={t(`look.family.${f}`)}
            accessibilityState={{ selected, checked: selected }}
            aria-checked={selected}
            onPress={() => pick(f)}
            style={{ flexBasis: 0, flexGrow: 1, minHeight: geometry.minHeight }}
          >
            {({ pressed }) => (
              <View
                collapsable={false}
                style={{
                  minHeight: geometry.minHeight,
                  flexGrow: 1,
                  paddingTop: geometry.paddingTop,
                  paddingBottom: geometry.paddingBottom,
                  gap: geometry.gap,
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: RADIUS.md,
                  borderWidth: selected ? LOOK.selectedBorder : LOOK.border,
                  borderColor: selected ? palette.primary : palette.hairlineStrong,
                  backgroundColor: selected ? palette.primaryLt : palette.paper,
                  ...pressedStyle(pressed, reduced),
                }}
              >
                <View
                  style={{
                    width: geometry.accent,
                    height: geometry.accent,
                    borderRadius: RADIUS.round,
                    backgroundColor: accent.primary,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {selected ? (
                    <Icon name="check" size={geometry.check} color={accent.onPrimary} />
                  ) : null}
                </View>
                <Text style={[TYPE.headerMeta, { textAlign: 'center', color: palette.ink }]}>
                  {t(`look.family.${f}`)}
                </Text>
              </View>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

/**
 * System / light / dark, with "System" as the design's short word in both places
 * (ui_kits/app/Settings.jsx:32–34, Gaps.jsx:34) — "Wie das Handy" broke into two lines on a
 * 360 pt phone. In the settings it stands in a row that already asks the question, so it is the
 * switch alone; the setup puts its own label above it.
 */
export function ModeChoice({ variant = 'onboarding' }: { variant?: 'settings' | 'onboarding' }) {
  const { t } = useTranslation('settings');
  const { mode: chosen, choose } = useTheme();
  const [mode, pick] = useChoice(chosen, (m: Mode) => choose({ mode: m }));
  const bare = variant === 'settings';
  const options: Array<{ value: Mode; label: string }> = [
    { value: 'system', label: t('look.mode_system_short') },
    { value: 'light', label: t('look.mode.light') },
    { value: 'dark', label: t('look.mode.dark') },
  ];
  const control = <Segmented options={options} value={mode} onChange={pick} />;
  if (bare) return control;
  return (
    <View style={{ gap: LOOK.groupGap }}>
      <Text style={[TYPE.label, { paddingHorizontal: LOOK.labelInset }]}>
        {t('look.mode_label')}
      </Text>
      {control}
    </View>
  );
}
