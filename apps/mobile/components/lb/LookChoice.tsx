// Supplied-design family tiles and explicit system/light/dark modes (#548).
// ThemeProvider retains the existing persisted values and system-follow behavior.
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';
import { UI } from '../../lib/theme/components.js';
import { LOOK } from '../../lib/theme/look.js';
import { RADIUS } from '../../lib/theme/radius.js';
import { FAMILIES, paletteOf, themeNameOf, type Mode } from '../../lib/theme/palettes.js';
import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { TYPE } from '../../lib/theme/type.js';
import { Icon } from './Icon.js';
import { Segmented } from './Segmented.js';

export function FamilyChoice({ variant = 'settings' }: { variant?: 'settings' | 'onboarding' }) {
  const { t } = useTranslation('settings');
  const { palette, family, choose } = useTheme();
  const geometry = LOOK[variant];
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
            onPress={() => choose({ family: f })}
            style={{ flexBasis: 0, flexGrow: 1, minHeight: geometry.minHeight }}
          >
            {({ pressed }) => (
              <View
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
                  opacity: pressed ? UI.pressedOpacity : 1,
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

export function ModeChoice() {
  const { t } = useTranslation('settings');
  const { mode, choose } = useTheme();
  const options: Array<{ value: Mode; label: string }> = (['system', 'light', 'dark'] as const).map(
    (value) => ({ value, label: t(`look.mode.${value}`) }),
  );
  return (
    <View style={{ gap: LOOK.groupGap }}>
      <Text style={[TYPE.label, { paddingHorizontal: LOOK.labelInset }]}>
        {t('look.mode_label')}
      </Text>
      <Segmented options={options} value={mode} onChange={(next) => choose({ mode: next })} />
    </View>
  );
}
