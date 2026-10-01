// The app's head: Buddy, his name, and one way into everything else (issue #174).
//
// The owner drew it: the orb on the left, "LearnBuddy" beside it, three dots on the right.
// What that replaces is the row of four circles that used to stand above the conversation
// — it moves into the dots — and the orb beside every single reply, which said the same
// thing over and over. One Buddy, in one place, and the conversation gets the screen.
//
// The orb carries his state here (thinking, listening, speaking): it is the one place she
// always sees, so it is the honest place to say what he is doing. Nothing else in the head
// moves, and nothing in it is decoration — #125 removed a head that held three unlike
// things, and this is not that: it is Buddy, his name, and the way out.
//
// Colours come from the palette like everything else, so it follows her colour choice into
// light or dark without a second rule (issue #140).

import { useTranslation } from 'react-i18next';
import { Pressable, Text, useWindowDimensions, View } from 'react-native';

import { orbSlot } from '../../lib/buddy/orbRoom.js';
import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { SPACE, TOUCH } from '../../lib/theme/space.js';
import { MAX_FONT_SCALE } from '../lb/Btn.js';
import { BuddyOrb, type MoonState } from '../lb/BuddyOrb.js';
import { Icon } from '../lb/Icon.js';

/** Below this width the name takes the smaller step (phones are not one size). */
const NARROW = 360;

/** The orb's size, and with the padding around it the height of the whole band. */
const ORB = 36;
/** How tall the head is, measured from its own parts — anything placed under it can ask. */
export const HEADER_HEIGHT = ORB + 2 * SPACE.sm;

export function Header({
  state = 'idle',
  readAloud,
  onReadAloud,
  onMenu,
}: {
  /** What Buddy is doing right now; the orb shows it. */
  state?: MoonState;
  /** Whether Buddy reads his answers out. */
  readAloud: boolean;
  onReadAloud: () => void;
  onMenu: () => void;
}) {
  const { palette } = useTheme();
  const { t } = useTranslation('buddy');
  const { width } = useWindowDimensions();
  const size = width < NARROW ? 22 : 24;
  return (
    <View
      testID="home-header"
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: SPACE.xs,
        paddingLeft: SPACE.md,
        paddingRight: SPACE.lg,
        paddingVertical: SPACE.sm,
      }}
    >
      {/* A slot wide enough for the moon (issue #182). It flies well outside the orb's
          own box — in "listen" it parks upper right, which landed on the "L" of the name.
          The slot is as wide as the drawing really gets; the height stays the orb's, so
          the band does not grow and the moon simply rises into the padding above it. */}
      <View
        style={{ width: orbSlot(ORB), height: ORB, alignItems: 'center', justifyContent: 'center' }}
      >
        <BuddyOrb size={ORB} state={state} />
      </View>
      <Text
        accessibilityRole="header"
        maxFontSizeMultiplier={MAX_FONT_SCALE}
        numberOfLines={1}
        // One ink, no gradient, no second colour: a name split into a dark half and a
        // coloured half is the cheapest move in the book (issue #135).
        style={{
          flex: 1,
          color: palette.ink,
          fontSize: size,
          lineHeight: size * 1.2,
          fontWeight: '700',
          letterSpacing: -0.4,
        }}
      >
        LearnBuddy
      </Text>
      {/* Reading aloud, back in the head (issue #181). A speaker stood here before and
          was taken out (#52) — rightly: it was a symbol with no state, so the owner's
          "wozu ist der eigentlich da" had no answer. This one answers it. The SHAPE says
          which way it is (struck through when off), never the colour alone, and it is a
          switch so a screen reader says it too. It is the one setting a child changes in
          the middle of working, so it costs one tap, not three. */}
      <Pressable
        onPress={onReadAloud}
        accessibilityRole="switch"
        accessibilityState={{ checked: readAloud }}
        aria-checked={readAloud}
        accessibilityLabel={t(readAloud ? 'menu.read_aloud_on' : 'menu.read_aloud_off')}
        hitSlop={SPACE.sm}
        style={{
          width: TOUCH,
          height: TOUCH,
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: TOUCH / 2,
        }}
      >
        {({ pressed }) => (
          <Icon
            name={readAloud ? 'speak' : 'speak-off'}
            size={22}
            color={readAloud ? palette.primaryDk : pressed ? palette.ink : palette.ink3}
          />
        )}
      </Pressable>
      <Pressable
        onPress={onMenu}
        accessibilityRole="button"
        accessibilityLabel={t('menu.title')}
        hitSlop={SPACE.sm}
        style={{
          width: TOUCH,
          height: TOUCH,
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: TOUCH / 2,
        }}
      >
        {({ pressed }) => (
          <Icon name="more" size={24} color={pressed ? palette.ink : palette.ink2} />
        )}
      </Pressable>
    </View>
  );
}
