// The card on top of Buddy's home, floating over the greeting and the row of ways to start
// (user feedback: "Die Meldung sollte einfach über dem Menü liegen. Kann man dann ja
// wegklicken."). It never pushes the menu, the greeting or the conversation down: it lies
// over them, with a soft shadow, and she closes it with the button in its corner or by
// swiping it up. Closing only hides it on this phone (lib/homeCard.ts); the card's own
// buttons ("Jetzt üben", "Heute nicht" …) keep working. docs/architecture.md §Home.

import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, PanResponder, ScrollView, View } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import { LB } from '../../lib/theme/colors.js';
import { SHADOW } from '../../lib/theme/shadow.js';
import { useSvgId } from '../../lib/theme/svgId.js';
import { Btn } from '../lb/Btn.js';
import { Icon } from '../lb/Icon.js';

/** Room a card's title leaves on its right for the close button (the card's own padding aside). */
export const CLOSE_INSET = 40;

/** How far up she swipes (or how fast) before the card goes. */
const SWIPE_DISTANCE = 48;
const SWIPE_SPEED = 0.5;

type Props = {
  /** Which card this is (lib/homeLayout.ts topKey): a new one comes in where the last one was. */
  id: string;
  children: React.ReactNode;
  /** What the close button says to a screen reader ("Karte ausblenden"). */
  closeLabel: string;
  onClose: () => void;
  /** The card's height from the top of the area it lies over (to keep the chat's top reachable). */
  onHeight: (height: number) => void;
  /** Where the close button sits from the top (centred on a slim bar, SLIM_CLOSE_TOP). */
  closeTop?: number;
};

export function TopOverlay({ id, children, closeLabel, onClose, onHeight, closeTop = 2 }: Props) {
  const lift = useRef(new Animated.Value(0)).current;
  const [viewH, setViewH] = useState(0);
  const [contentH, setContentH] = useState(0);
  // Swiping only while the card fits; when it scrolls (very large text), up is for reading.
  const fits = contentH <= viewH + 1;
  const fitsRef = useRef(fits);
  fitsRef.current = fits;
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    lift.setValue(0);
  }, [id, lift]);

  const pan = useMemo(
    () =>
      PanResponder.create({
        // Asked before the card's own scroll view and buttons: a clear swipe up is for closing.
        onMoveShouldSetPanResponderCapture: (_e, g) =>
          fitsRef.current && g.dy < -8 && Math.abs(g.dy) > Math.abs(g.dx),
        onPanResponderMove: (_e, g) => lift.setValue(Math.min(0, g.dy)),
        // Once it is a swipe, a text selection or a scroll does not take it over.
        onPanResponderTerminationRequest: () => false,
        onPanResponderRelease: (_e, g) => {
          if (g.dy < -SWIPE_DISTANCE || g.vy < -SWIPE_SPEED) {
            Animated.timing(lift, { toValue: -400, duration: 160, useNativeDriver: false }).start(
              () => closeRef.current(),
            );
          } else {
            Animated.spring(lift, { toValue: 0, useNativeDriver: false }).start();
          }
        },
        onPanResponderTerminate: () =>
          Animated.spring(lift, { toValue: 0, useNativeDriver: false }).start(),
      }),
    [lift],
  );

  return (
    <Animated.View
      testID="home-card"
      {...pan.panHandlers}
      onLayout={(e) => onHeight(e.nativeEvent.layout.height)}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        maxHeight: '100%',
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
      <UnderFade />
      <View
        accessibilityLiveRegion="polite"
        // The Pastell-Soft float: one soft shadow, the card's own tint.
        style={{ ...SHADOW.float, borderRadius: RADIUS, backgroundColor: LB.bg, flexShrink: 1 }}
      >
        <ScrollView
          style={{ flexGrow: 0, borderRadius: RADIUS }}
          contentContainerStyle={{ gap: 8 }}
          scrollEnabled={!fits}
          bounces={false}
          onLayout={(e) => setViewH(e.nativeEvent.layout.height)}
          onContentSizeChange={(_w, h) => setContentH(h)}
        >
          {children}
        </ScrollView>
        <View style={{ position: 'absolute', top: closeTop, right: 2 }}>
          <Btn
            variant="ghost"
            size="sm"
            pill
            label={<Icon name="close" size={20} color={LB.ink2} />}
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

/** The card's rounded corners; the fade behind them. */
const RADIUS = 22;
/** How far below the card the conversation fades out. */
const FADE_BELOW = 18;

/**
 * Behind the card's lower edge: what scrolls under the card fades out softly there instead of
 * peeking out at its rounded corners and being cut off hard at its edge.
 */
function UnderFade() {
  const id = useSvgId('under');
  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: -FADE_BELOW,
        height: RADIUS + FADE_BELOW,
      }}
    >
      <Svg width="100%" height="100%" preserveAspectRatio="none" viewBox="0 0 1 1">
        <Defs>
          <LinearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={LB.bg} stopOpacity={1} />
            <Stop
              offset={String(RADIUS / (RADIUS + FADE_BELOW))}
              stopColor={LB.bg}
              stopOpacity={0.9}
            />
            <Stop offset="1" stopColor={LB.bg} stopOpacity={0} />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="1" height="1" fill={`url(#${id})`} />
      </Svg>
    </View>
  );
}
