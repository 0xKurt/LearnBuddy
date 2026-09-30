// The app's face (issue #135, owner 30.09.: "die app braucht ne identitaet" and it should
// "look fucking premium"). It stands at the top of the home and does nothing — no menu, no
// toggle, no tap. That is the whole point: the head used to hold three unlike things and was
// removed for it (#125). One thing is not three.
//
// What makes it Buddy and not a logo: the orb is the real component, alive and breathing, the
// same one that stands beside every reply. The name sits next to it in the display face,
// tightened a step further than the scale — a wordmark is set tighter than a headline — with
// "Learn" in the reading ink and "Buddy" in the accent, so the eye reads one word with a
// person in it.
//
// Premium here means restraint, not decoration: exact optical alignment, one accent, no
// gradient on the text, no shadow, nothing that moves except the orb that was already moving.
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

export function Wordmark({ state = 'idle' }: { state?: 'idle' | 'think' | 'speak' | 'listen' }) {
  const { palette } = useTheme();
  const { width } = useWindowDimensions();
  const narrow = width < NARROW;
  const orb = narrow ? 26 : 30;
  const size = narrow ? 20 : 22;

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
        // and 8 already reads as two things standing next to one another.
        gap: 7,
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
            lineHeight: size + 4,
            // A wordmark is set tighter than a headline; the scale's -0.6 is for 30 pt.
            letterSpacing: -0.45,
            color: palette.ink,
            // The cap-height sits a hair above the orb's centre; this puts them level.
            marginTop: 1,
          },
        ]}
      >
        Learn<Text style={{ color: palette.primary }}>Buddy</Text>
      </Text>
    </View>
  );
}
