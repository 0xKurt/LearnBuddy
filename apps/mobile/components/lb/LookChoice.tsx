// The two things that decide how the app looks: which colours, and light or dark
// (issue #140). One component, because it is one choice — it stands in the settings and,
// since issue #136, in the onboarding, where it is the first thing that is hers: the next
// screen is already in the colours she picked.
//
// Curated options, no colour picker: the app must stay calm and friendly whatever she
// takes (docs/DESIGN-BRIEF.md), and every combination is checked for readable contrast
// (lib/theme/__tests__/contrast.test.ts).
//
// Each option shows what it would look like (issue #84, owner: "man sollte vorher schon
// sehen wie es aussehen könnte") — drawn from PALETTES, never from the palette in use, so
// the previews stay true whichever theme is on. `compact` is the same choice in less
// room: the onboarding has to fit a 360×740 phone without scrolling (rule 16), so there
// the preview is a tile instead of a little page.

import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';

import {
  FAMILIES,
  MODES,
  paletteOf,
  themeNameOf,
  type Family,
  type Mode,
  type ThemeName,
} from '../../lib/theme/palettes.js';
import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { SPACE, TOUCH } from '../../lib/theme/space.js';
import { Icon } from './Icon.js';

export function Swatch({
  name,
  on,
  label,
  sample,
  compact = false,
  onPress,
}: {
  name: ThemeName;
  on: boolean;
  label: string;
  sample: string;
  compact?: boolean;
  onPress: () => void;
}) {
  const { palette } = useTheme();
  const p = paletteOf(name);
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityLabel={label}
      accessibilityState={{ selected: on, checked: on }}
      // The web needs the attribute itself (axe: aria-required-attr, issue #73).
      aria-checked={on}
      onPress={onPress}
      style={compact ? { flexBasis: 0, flexGrow: 1 } : undefined}
    >
      {({ pressed }) => (
        <View
          style={{
            borderRadius: 18,
            overflow: 'hidden',
            borderWidth: on ? 2.5 : 1,
            // The ring reads in the ACTIVE palette (it frames the control, not the preview).
            borderColor: on ? palette.primary : palette.hairline,
            opacity: pressed ? 0.85 : 1,
          }}
        >
          {compact ? (
            <View
              style={{
                backgroundColor: p.bg,
                // The tile carries the whole touch target: a label under a small square
                // would leave the square itself below 44 pt.
                minHeight: TOUCH + SPACE.lg,
                paddingVertical: SPACE.sm,
                paddingHorizontal: SPACE.xs,
                alignItems: 'center',
                justifyContent: 'center',
                gap: SPACE.xs,
              }}
            >
              <View
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: 11,
                  backgroundColor: p.primary,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {/* Never colour alone: the chosen one also carries the check. */}
                {on ? <Icon name="check" size={14} color={p.paper} /> : null}
              </View>
              <Text
                numberOfLines={1}
                style={{ color: p.ink, fontSize: 12, fontWeight: '600', textAlign: 'center' }}
              >
                {label}
              </Text>
            </View>
          ) : (
            <View style={{ backgroundColor: p.bg, padding: 12, gap: 8 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View
                  style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: p.primary }}
                />
                <Text style={{ color: p.ink, fontSize: 15, fontWeight: '700', flex: 1 }}>
                  {label}
                </Text>
                {/* The word "checked" is announced; the check is the visible twin, in the
                    preview's own readable colour — never colour alone. */}
                {on ? <Icon name="check" size={18} color={p.primaryDk} /> : null}
              </View>
              <View style={{ backgroundColor: p.paper, borderRadius: 12, padding: 10, gap: 2 }}>
                <Text style={{ color: p.ink, fontSize: 13, lineHeight: 18 }}>{sample}</Text>
                <View
                  style={{
                    alignSelf: 'flex-start',
                    backgroundColor: p.primary,
                    borderRadius: 999,
                    paddingHorizontal: 10,
                    paddingVertical: 3,
                  }}
                >
                  <Text style={{ color: p.paper, fontSize: 12, fontWeight: '600' }}>
                    {sample.split(' ')[0]}
                  </Text>
                </View>
              </View>
            </View>
          )}
        </View>
      )}
    </Pressable>
  );
}

/** The colours. */
export function FamilyChoice({ compact = false }: { compact?: boolean }) {
  const { t } = useTranslation('settings');
  const { name, family, choose } = useTheme();
  const dark = name.endsWith('Dark');
  return (
    <View
      accessibilityRole="radiogroup"
      style={compact ? { flexDirection: 'row', gap: SPACE.sm } : { gap: 10 }}
    >
      {FAMILIES.map((f) => (
        <Swatch
          key={f}
          name={themeNameOf(f, dark)}
          on={f === family}
          label={t(`look.family.${f}` as const)}
          sample={t('look.sample')}
          compact={compact}
          onPress={() => choose({ family: f })}
        />
      ))}
    </View>
  );
}

/** Light, dark, or whatever the phone is doing. */
export function ModeChoice({ compact = false }: { compact?: boolean }) {
  const { t } = useTranslation('settings');
  const { name, family, mode, choose } = useTheme();
  const dark = name.endsWith('Dark');
  return (
    <View
      accessibilityRole="radiogroup"
      style={compact ? { flexDirection: 'row', gap: SPACE.sm } : { gap: 10 }}
    >
      {MODES.map((m) => (
        <Swatch
          key={m}
          name={themeNameOf(family, m === 'dark' || (m === 'system' && dark))}
          on={m === mode}
          label={t(`look.mode.${m}` as const)}
          sample={t('look.sample')}
          compact={compact}
          onPress={() => choose({ mode: m })}
        />
      ))}
    </View>
  );
}

export type { Family, Mode };
