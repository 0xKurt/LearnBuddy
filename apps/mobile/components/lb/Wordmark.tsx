// The app's face (issue #135, owner 30.09.: "die app braucht ne identitaet" and it should
// "look fucking premium"). It stands at the top of the home and does nothing — no menu, no
// toggle, no tap. That is the whole point: the head used to hold three unlike things and was
// removed for it (#125). One thing is not three.
//
// What makes it Buddy and not a logo: the orb is the real component, alive and breathing, the
// same one that stands beside every reply.
//
// The name is set in ONE ink, not two. Splitting a name into a dark half and a coloured half
// is the cheapest move in the book — every second product does it, which is exactly why it
// reads as a template instead of as a mark. The orb carries the colour; the name carries the
// name. One accent on the screen, not two.
//
// Proportion is the other half. The orb used to be taller than the whole word, which made the
// type look like a caption beside it. It is tied to the cap height now (ORB_TO_CAP): the mark
// reads as one lockup rather than two things placed next to one another.
//
// Premium here is restraint: no gradient on the text, no shadow, no second colour, nothing
// that moves except the orb that was already moving.
//
// Sizes follow the phone, not a fixed number (owner: "verschiedene handys haben verschiedene
// aufloesungen und es sollte in allen gut aussehen"): below 360 pt of width the orb and the
// type step down one notch so a 320 pt phone keeps the same proportions instead of crowding.
import { useWindowDimensions, View } from 'react-native';
import { Text } from 'react-native';

import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { TYPE } from '../../lib/theme/type.js';
import { MAX_FONT_SCALE } from './Btn.js';
import { BuddyOrb } from './BuddyOrb.js';

/** Where the two steps sit; below this width everything takes the smaller one. */
const NARROW = 360;
/** The orb against the name's cap height — a hair over, so it leads without shouting. */
const ORB_TO_CAP = 1.45;

export function Wordmark({ state = 'idle' }: { state?: 'idle' | 'think' | 'speak' | 'listen' }) {
  const { palette } = useTheme();
  const { width } = useWindowDimensions();
  const narrow = width < NARROW;
  // Bigger and a shade lighter than a heading of the same weight would be: a wordmark can
  // carry size because it is two words, and size is what makes it look deliberate.
  const size = narrow ? 23 : 25;
  // Cap height is about 0.72 em in this face; the orb sits a touch above it so it reads as
  // the mark and not as a bullet.
  const orb = Math.round(size * 0.72 * ORB_TO_CAP);

  return (
    <View
      // One label for the pair: a screen reader says the product name once, not "image, text".
      accessible
      accessibilityRole="header"
      accessibilityLabel="LearnBuddy"
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        // Tighter than the spacing scale on purpose: a mark's parts belong to each other,
        // and a full step already reads as two things standing next to one another.
        gap: Math.round(size * 0.34),
      }}
    >
      {/* Decorative for the reader — the label above already said the name. */}
      <BuddyOrb size={orb} state={state} reactToTap={false} halo={false} />
      <Text
        maxFontSizeMultiplier={MAX_FONT_SCALE}
        style={[
          TYPE.display,
          {
            fontSize: size,
            lineHeight: Math.round(size * 1.15),
            // A wordmark is set tighter than a headline: the scale's -0.6 is tuned for 30 pt,
            // and a two-word mark wants a touch more than the linear share of that.
            letterSpacing: -0.6,
            color: palette.ink,
          },
        ]}
      >
        LearnBuddy
      </Text>
    </View>
  );
}
