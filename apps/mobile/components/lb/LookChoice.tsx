// How the app looks: a row of colour cards, and one switch for light/dark (issue #172).
//
// It used to be seven stacked cards, each with a sample sentence and a sample pill. On the
// phone the owner's verdict was short: "das mit den farb cards ist komisch und nicht best
// practice. niemand stellt das so dar", and then: "pastell, wald, meer, abend — alle
// dunkel. wie das handy, hell dunkel, alle gleich farbend."
//
// Both complaints were right and they were the same fault. The card showed the palette's
// BACKGROUND, and in dark mode all four backgrounds are near-black — so the four colours
// looked identical. And the three mode cards previewed the same family, so of course they
// were indistinguishable. What tells the families apart is the accent (#9d82f5 violet,
// #5fae86 green, #5a9fe0 blue, #e0925a orange — distinct in dark too), so that is what the
// card shows.
//
// Light/dark is a switch, not a third thing to read. "Wie das Handy" stays as the default
// BEHAVIOUR rather than a third option: until she touches the switch it follows the phone,
// and the switch shows what is actually on screen either way — so it never displays a state
// the app is not in. Touching it is her decision and pins it.
//
// Curated colours, no colour picker: the app must stay calm and friendly whatever she takes
// (docs/DESIGN-BRIEF.md), and every combination is checked for readable contrast
// (lib/theme/__tests__/contrast.test.ts).

import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';

import { FAMILIES, paletteOf, themeNameOf, type Family } from '../../lib/theme/palettes.js';
import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { SPACE } from '../../lib/theme/space.js';
import { TYPE } from '../../lib/theme/type.js';
import { Icon } from './Icon.js';

/** One colour, as a card filled with that colour. */
function ColourCard({
  family,
  dark,
  on,
  label,
  onPress,
}: {
  family: Family;
  dark: boolean;
  on: boolean;
  label: string;
  onPress: () => void;
}) {
  const { palette } = useTheme();
  // The family in the mode that is showing: green while the app is dark shows the DARK
  // green, so the choice is honest.
  const p = paletteOf(themeNameOf(family, dark));
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityLabel={label}
      accessibilityState={{ selected: on, checked: on }}
      // The web needs the attribute itself (axe: aria-required-attr, issue #73).
      aria-checked={on}
      onPress={onPress}
      style={{ flexBasis: 0, flexGrow: 1, gap: SPACE.xs }}
    >
      {({ pressed }) => (
        <>
          <View
            style={{
              height: 72,
              borderRadius: 18,
              // The accent, because that is what tells the four apart — in both modes.
              backgroundColor: p.primary,
              alignItems: 'center',
              justifyContent: 'center',
              // The ring is drawn in the palette IN USE: it says "selected", it is not
              // part of the colour being shown.
              borderWidth: on ? 3 : 0,
              borderColor: palette.ink,
              opacity: pressed ? 0.8 : 1,
            }}
          >
            {/* Never colour alone: the chosen one also carries the check. */}
            {on ? <Icon name="check" size={26} color={p.paper} /> : null}
          </View>
          <Text
            numberOfLines={1}
            style={[
              TYPE.label,
              {
                textAlign: 'center',
                color: on ? palette.ink : palette.ink2,
                fontWeight: on ? '700' : '600',
              },
            ]}
          >
            {label}
          </Text>
        </>
      )}
    </Pressable>
  );
}

/** The colours: one row of cards. */
export function FamilyChoice() {
  const { t } = useTranslation('settings');
  const { name, family, choose } = useTheme();
  const dark = name.endsWith('Dark');
  return (
    <View accessibilityRole="radiogroup" style={{ flexDirection: 'row', gap: SPACE.sm }}>
      {FAMILIES.map((f) => (
        <ColourCard
          key={f}
          family={f}
          dark={dark}
          on={f === family}
          label={t(`look.family.${f}` as const)}
          onPress={() => choose({ family: f })}
        />
      ))}
    </View>
  );
}

/** Light or dark: one switch, showing what is actually on screen. */
export function ModeChoice() {
  const { t } = useTranslation('settings');
  const { name, palette, choose } = useTheme();
  const dark = name.endsWith('Dark');
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={t('look.mode_question')}
      accessibilityHint={t('look.mode_hint')}
      // aria-checked (not accessibilityState) so the web build says it too.
      aria-checked={dark}
      onPress={() => choose({ mode: dark ? 'light' : 'dark' })}
      style={{ borderRadius: 999 }}
    >
      {({ pressed }) => (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: SPACE.md,
            paddingVertical: SPACE.sm,
            opacity: pressed ? 0.8 : 1,
          }}
        >
          <Text style={[TYPE.body, { color: palette.ink, flexShrink: 1 }]}>
            {t(`look.mode.${dark ? 'dark' : 'light'}` as const)}
          </Text>
          {/* The track and its knob: 52 × 32, the knob on the side that is on. */}
          <View
            style={{
              width: 52,
              height: 32,
              borderRadius: 16,
              padding: 3,
              backgroundColor: dark ? palette.primary : palette.canvas,
              borderWidth: 1,
              borderColor: dark ? palette.primary : palette.hairline,
              alignItems: dark ? 'flex-end' : 'flex-start',
              justifyContent: 'center',
            }}
          >
            <View
              style={{
                width: 24,
                height: 24,
                borderRadius: 12,
                backgroundColor: palette.paper,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {/* The knob carries the state in a shape as well, never colour alone. */}
              <Icon
                name={dark ? 'check' : 'close'}
                size={14}
                color={dark ? palette.primaryDk : palette.ink3}
              />
            </View>
          </View>
        </View>
      )}
    </Pressable>
  );
}
