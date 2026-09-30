// The layer on top of Buddy's home: one slim bar (components/buddy/SlimBar.tsx) — or, rarely,
// the system notes — floating over the greeting and the row of ways to start (user feedback:
// "Die Meldung sollte einfach über dem Menü liegen. Kann man dann ja wegklicken."). It never
// pushes the menu, the greeting or the conversation down: it lies over them with a soft
// shadow, and she closes it with the button in its corner or by swiping it up. Since issue
// #17 the content carries a hard size contract (a bar, ≤ ~64 pt collapsed), so this layer
// needs no scrolling and no fade of its own and nothing below compensates for its height.
// Closing only hides it on this phone (lib/homeCard.ts); the bar's own buttons ("Jetzt üben",
// "Heute nicht" …) keep working. docs/architecture.md §Home.

import { useEffect, useMemo, useRef } from 'react';
import { Animated, PanResponder, View } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';

import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { SHADOW } from '../../lib/theme/shadow.js';
import { Btn } from '../lb/Btn.js';
import { Icon } from '../lb/Icon.js';

/** Room a bar's title leaves on its right for the close button (the bar's own padding aside). */
export const CLOSE_INSET = 40;

/** How far up she swipes (or how fast) before the layer goes. */
const SWIPE_DISTANCE = 48;
const SWIPE_SPEED = 0.5;

/** The layer's rounded corners (the bars inside use 20). */
const RADIUS = 22;
/** Where the close button sits from the top: vertically centred on a slim bar. */
const CLOSE_TOP = 8;

type Props = {
  /** Which content this is (lib/homeLayout.ts topKey): new content comes in where the last was. */
  id: string;
  children: React.ReactNode;
  /** What the close button says to a screen reader ("Karte ausblenden"). */
  closeLabel: string;
  onClose: () => void;
  /** Room to leave on the right for something that must stay reachable (the menu). */
  rightInset?: number;
};

export function TopOverlay({ id, children, closeLabel, onClose, rightInset = 0 }: Props) {
  const { palette } = useTheme();
  const lift = useRef(new Animated.Value(0)).current;
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  // In a ref: the pan responder is memoised on [lift] and must see the live value.
  const reduceRef = useRef(false);
  reduceRef.current = useReducedMotion();

  useEffect(() => {
    lift.setValue(0);
  }, [id, lift]);

  const pan = useMemo(
    () =>
      PanResponder.create({
        // Asked before the bar's buttons: a clear swipe up is for closing.
        onMoveShouldSetPanResponderCapture: (_e, g) => g.dy < -8 && Math.abs(g.dy) > Math.abs(g.dx),
        onPanResponderMove: (_e, g) => lift.setValue(Math.min(0, g.dy)),
        // Once it is a swipe, a text selection does not take it over.
        onPanResponderTerminationRequest: () => false,
        onPanResponderRelease: (_e, g) => {
          if (g.dy < -SWIPE_DISTANCE || g.vy < -SWIPE_SPEED) {
            // Reduce motion: the layer leaves without the slide (audit: the only
            // animated component that ignored the setting).
            Animated.timing(lift, {
              toValue: -400,
              duration: reduceRef.current ? 0 : 160,
              useNativeDriver: false,
            }).start(() => closeRef.current());
          } else if (reduceRef.current) {
            lift.setValue(0);
          } else {
            Animated.spring(lift, { toValue: 0, useNativeDriver: false }).start();
          }
        },
        onPanResponderTerminate: () => {
          if (reduceRef.current) lift.setValue(0);
          else Animated.spring(lift, { toValue: 0, useNativeDriver: false }).start();
        },
      }),
    [lift],
  );

  return (
    <Animated.View
      testID="home-card"
      {...pan.panHandlers}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        // The CONTAINER stops before the menu, not just its padding (issue #135). Padding
        // would have moved the card's ink but left the layer spanning the full width, and a
        // layer at zIndex 10 swallows every tap under it — the walkthrough caught the menu
        // being unclickable while a card was up, which is exactly what this had to fix.
        right: rightInset,
        paddingHorizontal: 16,
        paddingTop: 8,
        zIndex: 10,
        elevation: 12,
        transform: [{ translateY: lift }],
        opacity: lift.interpolate({
          inputRange: [-160, 0],
          outputRange: [0, 1],
          extrapolate: 'clamp',
        }),
      }}
    >
      <View
        accessibilityLiveRegion="polite"
        // The Pastell-Soft float: one soft shadow, the bar's own tint.
        style={{ ...SHADOW.float, borderRadius: RADIUS, backgroundColor: palette.bg, gap: 8 }}
      >
        {children}
        <View style={{ position: 'absolute', top: CLOSE_TOP, right: 2 }}>
          <Btn
            variant="ghost"
            size="sm"
            pill
            label={<Icon name="close" size={20} color={palette.ink2} />}
            accessibilityLabel={closeLabel}
            onPress={onClose}
          >
            {closeLabel}
          </Btn>
        </View>
      </View>
    </Animated.View>
  );
}
