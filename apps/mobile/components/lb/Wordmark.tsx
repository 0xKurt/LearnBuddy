// The app's face (issue #135). It stands at the top of the home and does nothing — no menu,
// no toggle, no tap. That is the whole point: the head used to hold three unlike things and
// was removed for it (#125). One thing is not three.
//
// Just the name, centred, and no orb (owner 30.09.: "lass uns einfach den orb weglassen und
// die schrift zentrieren. der orb ist ueberall sonst auf dem screen"). He is right — Buddy
// stands beside every reply he writes, so putting him in the mark as well said the same thing
// twice and made the type look like a caption next to him.
//
// One ink, never two. Splitting a name into a dark half and a coloured half is the cheapest
// move in the book — half the products on a phone do it, which is exactly why it reads as a
// template instead of as a mark.
//
// Premium here is restraint: no gradient, no shadow, no second colour, nothing that moves.
//
// Sizes follow the phone, not a fixed number (owner: "verschiedene handys haben verschiedene
// aufloesungen und es sollte in allen gut aussehen").
import { useWindowDimensions, Text, View } from 'react-native';

import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { TYPE } from '../../lib/theme/type.js';
import { MAX_FONT_SCALE } from './Btn.js';

/** Below this width the mark takes the smaller step. */
const NARROW = 360;

export function Wordmark() {
  const { palette } = useTheme();
  const { width } = useWindowDimensions();
  const size = width < NARROW ? 23 : 25;

  return (
    <View accessibilityRole="header" style={{ alignItems: 'center' }}>
      <Text
        maxFontSizeMultiplier={MAX_FONT_SCALE}
        style={[
          TYPE.display,
          {
            fontSize: size,
            lineHeight: Math.round(size * 1.15),
            // A wordmark is set tighter than a headline; the scale's -0.6 is tuned for 30 pt.
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
