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
// The switch is the platform's own and is named for what it does: "Dunkelmodus", on = dark
// (issue #517). It used to be drawn here (a track with a ✕/✓ knob) and labelled with the
// CURRENT state, so an off switch beside "Hell" read as "Hell: aus", exactly the wrong way
// round ("Der hell switch ist hässlich. Sollte auch invertiert benannt werden", owner 09.10.).
//
// Curated colours, no colour picker: the app must stay calm and friendly whatever she takes
// (docs/DESIGN-BRIEF.md), and every combination is checked for readable contrast
// (lib/theme/__tests__/contrast.test.ts).

import { useTranslation } from 'react-i18next';
import { Pressable, Switch, Text, View } from 'react-native';

import { modeSwitch } from '../../lib/theme/modeSwitch.js';
import { FAMILIES, paletteOf, themeNameOf, type Family } from '../../lib/theme/palettes.js';
import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { SPACE, TOUCH } from '../../lib/theme/space.js';
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
              borderRadius: 18, // token-exempt: the colour swatch, softer than a tile
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

/** Dark mode: one switch, the platform's own, named for what it does (issue #517). */
export function ModeChoice() {
  const { t } = useTranslation('settings');
  const { name, palette, mode, choose } = useTheme();
  const dark = name.endsWith('Dark');
  // Until she touches the switch the app follows the phone; touching it pins a side. Pinned,
  // there was no way back short of setting the device up again (issue #222) — the switch sets
  // only light or dark, and the decision against a THIRD card stands (#172, top of this file).
  // What the switch then offers is decided in `lib/theme/modeSwitch.ts`, where it can be
  // tested; this is one line per branch.
  const { pinned, hint, backAction } = modeSwitch(mode);
  const followPhone = () => choose({ mode: 'system' });
  const setDark = (on: boolean) => choose({ mode: on ? 'dark' : 'light' });
  const label = t('look.dark_mode');
  return (
    <View style={{ gap: SPACE.xs }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.md }}>
        {/* The words are part of the reach, as in a phone's own settings: a tap switches, a
            long press goes back to the phone. A screen reader and a keyboard meet the switch
            alone, which carries the same name, the hint and the way back as an action. */}
        <Pressable
          accessible={false}
          focusable={false}
          onPress={() => setDark(!dark)}
          onLongPress={pinned ? followPhone : undefined}
          style={{ flexGrow: 1, flexShrink: 1, minHeight: TOUCH, justifyContent: 'center' }}
        >
          <Text style={[TYPE.body, { color: palette.ink }]}>{label}</Text>
        </Pressable>
        <Switch
          value={dark}
          onValueChange={setDark}
          accessibilityLabel={label}
          accessibilityHint={t(hint)}
          accessibilityActions={
            backAction ? [{ name: backAction, label: t('look.mode.system') }] : []
          }
          onAccessibilityAction={(e) => {
            if (e.nativeEvent.actionName === backAction) followPhone();
          }}
          // Off: a grey that still stands out on the card and the page (≥ 3:1, contrast test);
          // on: the accent. The knob is light either way, as the phones draw it.
          trackColor={{ false: palette.ink3, true: palette.primary }}
          ios_backgroundColor={palette.ink3}
          thumbColor={palette.knob}
          // react-native-web paints an ON knob from this prop alone (teal without it).
          activeThumbColor={palette.knob}
        />
      </View>
      {/* What the switch does besides, in words: it follows the phone until touched, and a long
          press goes back (#222). */}
      <Text style={[TYPE.caption, { color: palette.ink2 }]}>{t(hint)}</Text>
    </View>
  );
}
