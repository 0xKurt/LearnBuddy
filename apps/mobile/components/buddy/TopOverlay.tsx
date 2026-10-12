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
import { DURATION, useMotionReduced } from '../../lib/theme/motion.js';
import { CHAT } from '../../lib/theme/chat.js';
import { RADIUS } from '../../lib/theme/radius.js';

import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { SHADOW } from '../../lib/theme/shadow.js';
import { SPACE } from '../../lib/theme/space.js';
import { Btn } from '../lb/Btn.js';
import { Icon } from '../lb/Icon.js';

/** Room a bar's title leaves on its right for the close button (the bar's own padding aside). */
export const CLOSE_INSET = CHAT.overlay.closeInset;

/** How far up she swipes (or how fast) before the layer goes. */
const SWIPE_DISTANCE = CHAT.overlay.swipeDistance;
const SWIPE_SPEED = CHAT.overlay.swipeSpeed;

/** Where the close button sits from the top: vertically centred on a slim bar. */
const CLOSE_TOP = CHAT.overlay.closeTop;

type Props = {
  /** Which content this is (lib/homeLayout.ts topKey): new content comes in where the last was. */
  id: string;
  children: React.ReactNode;
  /** What the close button says to a screen reader ("Karte ausblenden"). */
  closeLabel: string;
  onClose: () => void;
  /** Room to leave on the right for something that must stay reachable (the menu). */
  rightInset?: number;
  /**
   * How tall the card is. What lies under it has to know: the session greeting is placed
   * from the bottom of the view upwards, and without this the card was drawn straight
   * over it (owner 01.10., issue #190).
   */
  onHeight?: (height: number) => void;
};

export function TopOverlay({ id, children, closeLabel, onClose, rightInset = 0, onHeight }: Props) {
  const { palette } = useTheme();
  const lift = useRef(new Animated.Value(0)).current;
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  // In a ref: the pan responder is memoised on [lift] and must see the live value.
  const reduced = useMotionReduced();
  const reduceRef = useRef(reduced);
  reduceRef.current = reduced;
  const currentId = useRef(id);
  currentId.current = id;
  const dismissal = useRef<{ id: string } | null>(null);
  useEffect(() => {
    // Clear ownership before cancellation can invoke a completion callback.
    dismissal.current = null;
    lift.stopAnimation();
    lift.setValue(0);
    return () => {
      dismissal.current = null;
      lift.stopAnimation();
    };
  }, [id, lift]);

  useEffect(() => {
    if (!reduced) return;
    const request = dismissal.current;
    dismissal.current = null;
    lift.stopAnimation();
    if (request?.id === currentId.current) {
      lift.setValue(-CHAT.overlay.travel);
      closeRef.current();
    } else lift.setValue(0);
  }, [reduced, lift]);
  // Gone means gone: without this the last measured height would keep pushing the
  // greeting down after the card was closed (issue #190).
  useEffect(() => () => onHeight?.(0), [onHeight]);

  const pan = useMemo(
    () =>
      PanResponder.create({
        // Asked before the bar's buttons: a clear swipe up is for closing.
        onMoveShouldSetPanResponderCapture: (_e, g) =>
          g.dy < -CHAT.overlay.captureDistance && Math.abs(g.dy) > Math.abs(g.dx),
        onPanResponderMove: (_e, g) => {
          if (!reduceRef.current) lift.setValue(Math.min(0, g.dy));
        },
        // Once it is a swipe, a text selection does not take it over.
        onPanResponderTerminationRequest: () => false,
        onPanResponderRelease: (_e, g) => {
          if (g.dy < -SWIPE_DISTANCE || g.vy < -SWIPE_SPEED) {
            // Reduce motion: the layer leaves without the slide (audit: the only
            // animated component that ignored the setting).
            const request = { id: currentId.current };
            dismissal.current = request;
            Animated.timing(lift, {
              toValue: -CHAT.overlay.travel,
              duration: reduceRef.current ? 0 : DURATION.quick,
              useNativeDriver: false,
            }).start(({ finished }) => {
              if (finished && dismissal.current === request && request.id === currentId.current) {
                dismissal.current = null;
                closeRef.current();
              }
            });
          } else if (reduceRef.current) {
            lift.setValue(0);
          } else {
            Animated.timing(lift, {
              toValue: 0,
              duration: DURATION.quick,
              useNativeDriver: false,
            }).start();
          }
        },
        onPanResponderTerminate: () => {
          if (reduceRef.current) lift.setValue(0);
          else
            Animated.timing(lift, {
              toValue: 0,
              duration: DURATION.quick,
              useNativeDriver: false,
            }).start();
        },
      }),
    [lift],
  );

  return (
    <Animated.View
      testID="home-card"
      onLayout={(e) => onHeight?.(e.nativeEvent.layout.height)}
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
        paddingHorizontal: SPACE.lg,
        paddingTop: SPACE.sm,
        zIndex: CHAT.overlay.zIndex,
        elevation: CHAT.overlay.elevation,
        transform: [{ translateY: lift }],
        opacity: lift.interpolate({
          inputRange: [-CHAT.overlay.fadeDistance, 0],
          outputRange: [0, 1],
          extrapolate: 'clamp',
        }),
      }}
    >
      <View
        accessibilityLiveRegion="polite"
        // The Pastell-Soft float: one soft shadow, the bar's own tint.
        style={{
          ...SHADOW.float,
          borderRadius: RADIUS.lg,
          backgroundColor: palette.bg,
          gap: SPACE.sm,
        }}
      >
        {children}
        <View style={{ position: 'absolute', top: CLOSE_TOP, right: CHAT.overlay.closeRight }}>
          <Btn
            variant="ghost"
            size="sm"
            pill
            label={<Icon name="close" size={CHAT.overlay.glyph} color={palette.ink2} />}
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
