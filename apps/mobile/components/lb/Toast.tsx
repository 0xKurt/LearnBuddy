// One short message at the bottom (errors, confirmations). Screen readers hear it
// (a live region on Android and the web, an announcement on iOS), and it sits above
// the keyboard on iOS, where it used to hide behind it (audit M-76, M-80). It belongs
// to the screen it appeared on: a route change clears it, unless the caller said
// survivesNavigation — the rules live in lib/toast.ts (issue #91). It stands above
// the screen's real bottom bar; bars report their height through useToastBar. Looks: the
// design's ink pill on the float shadow (components/core/States.jsx `Toast`), at least 44 high,
// its offer a full 44 pt target; an error also carries a round warning mark (never colour alone).

import { usePathname } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { type LayoutChangeEvent, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { announce } from '../../lib/announce.js';
import { keyboardOverlap } from '../../lib/keyboard.js';
import { useKeyboardHeight } from '../../lib/useKeyboardHeight.js';
import { MAX_FONT_SCALE } from './Btn.js';
import { UI } from '../../lib/theme/components.js';
import { RADIUS } from '../../lib/theme/radius.js';
import { SPACE } from '../../lib/theme/space.js';
import { TOAST } from '../../lib/theme/states.js';
import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { SHADOW } from '../../lib/theme/shadow.js';
import { fontFace } from '../../lib/theme/type.js';
import {
  barHeight,
  registerToastBar,
  toast,
  toastBottom,
  toastDuration,
  useToastState,
  type ToastAction,
  type ToastBarHandle,
  type ToastTone,
} from '../../lib/toast.js';

export { toast } from '../../lib/toast.js';

export function ToastHost() {
  const { message, tone, seq, action, bars } = useToastState();
  const insets = useSafeAreaInsets();
  const { overlap, onLayout } = useKeyboardOverlap();
  const pathname = usePathname();
  const lastPath = useRef(pathname);
  useEffect(() => {
    if (lastPath.current === pathname) return;
    lastPath.current = pathname;
    // The screen changed: a message that belonged to the one before goes with it (issue #91).
    toast.routeChanged();
  }, [pathname]);
  useEffect(() => {
    if (!message) return;
    announce(message, { liveRegion: true });
    const timer = setTimeout(() => toast.hide(), toastDuration(tone, action !== null));
    return () => clearTimeout(timer);
  }, [message, seq, tone, action]);
  return (
    <>
      {/* The ruler: it measures the screen and nothing else. Separate from the pill on
          purpose — measuring the pill's own container would feed the padding back into
          the measurement and the two would chase each other (issue #141). It is also
          always mounted, so a message that arrives while the keyboard is already open
          still knows how tall the screen is without one. */}
      <View
        pointerEvents="none"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        onLayout={onLayout}
        style={StyleSheet.absoluteFill}
      />
      {message ? (
        <Pill
          message={message}
          tone={tone}
          action={action}
          bottom={toastBottom(insets.bottom, barHeight(bars), overlap)}
        />
      ) : null}
    </>
  );
}

function Pill({
  message,
  tone,
  action,
  bottom,
}: {
  message: string;
  tone: ToastTone;
  action: ToastAction | null;
  bottom: number;
}) {
  const { palette } = useTheme();
  return (
    <View
      // Only the offer is touchable; the pill itself never swallows a tap meant for
      // the screen under it (#133 position 12).
      pointerEvents="box-none"
      accessibilityLiveRegion="polite"
      accessibilityRole="alert"
      style={{
        position: 'absolute',
        left: SPACE.lg,
        right: SPACE.lg,
        bottom,
        alignItems: 'center',
      }}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: TOAST.gap,
          minHeight: TOAST.minHeight,
          backgroundColor: palette.ink,
          borderRadius: RADIUS.round,
          paddingLeft: TOAST.padStart,
          paddingRight: TOAST.padEnd,
          maxWidth: TOAST.maxWidth,
          ...SHADOW.float,
        }}
      >
        {tone === 'error' ? (
          <View
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            style={{
              // min sizes: large system text grows the mark into a bigger circle
              // instead of clipping the "!" in a fixed box (audit M-84, issue #73).
              minWidth: TOAST.mark,
              minHeight: TOAST.mark,
              borderRadius: RADIUS.round,
              backgroundColor: palette.peachDeep,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text
              maxFontSizeMultiplier={MAX_FONT_SCALE}
              // The "!" fills the mark.
              style={{ ...fontFace('700'), ...TOAST.markSign, color: palette.ink }}
            >
              !
            </Text>
          </View>
        ) : null}
        {/* The toast's words (600 14), light on the dark pill. Their own room above and below
            closes one line at the pill's 44 and lets a longer message grow. */}
        <Text
          style={{
            ...fontFace('600'),
            ...TOAST.words,
            flexShrink: 1,
            paddingVertical: TOAST.padY,
            color: palette.paper,
          }}
        >
          {message}
        </Text>
        {action ? (
          <Pressable
            testID="toast-offer"
            onPress={() => toast.act()}
            accessibilityRole="button"
            accessibilityLabel={action.label}
            // A real box of 44 × 44 or more, as tall as the pill: padding, not `hitSlop`, which
            // the web does not know — and this can be the only way back (#599).
            style={{
              alignSelf: 'stretch',
              minHeight: TOAST.minHeight,
              minWidth: TOAST.minHeight,
              paddingHorizontal: TOAST.offerPad,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {({ pressed }) => (
              <Text
                maxFontSizeMultiplier={MAX_FONT_SCALE}
                style={{
                  ...fontFace('700'),
                  ...TOAST.words,
                  // Told apart by its weight, its place at the pill's end and its role.
                  color: palette.primaryLt,
                  opacity: pressed ? UI.pressed.link : 1,
                }}
              >
                {action.label}
              </Text>
            )}
          </Pressable>
        ) : (
          <View style={{ width: TOAST.endRoom }} />
        )}
      </View>
    </View>
  );
}

/**
 * A screen's pinned bottom bar (Composer, BottomBar) hands its measured
 * height to the toast so the pill stands above the bar, not on the content
 * (issue #91). Put the result on the bar's outermost view: onLayout={onBarLayout}.
 */
export function useToastBar(): (e: LayoutChangeEvent) => void {
  const handle = useRef<ToastBarHandle | null>(null);
  useEffect(
    () => () => {
      handle.current?.remove();
      handle.current = null;
    },
    [],
  );
  return useCallback((e: LayoutChangeEvent) => {
    (handle.current ??= registerToastBar()).set(e.nativeEvent.layout.height);
  }, []);
}

/**
 * How much of the screen the keyboard covers here. Not the raw height: on a device whose
 * window shrinks for the keyboard the pill is above it already, and adding the height
 * again would park it in mid-screen. The same measurement as every screen makes
 * (lib/keyboard.ts, issue #141) — hence the full-screen view this hook belongs to.
 */
function useKeyboardOverlap(): { overlap: number; onLayout: (e: LayoutChangeEvent) => void } {
  const keyboard = useKeyboardHeight();
  const [height, setHeight] = useState(0);
  const base = useRef(0);
  const onLayout = useCallback(
    (e: LayoutChangeEvent) => {
      const h = e.nativeEvent.layout.height;
      if (keyboard === 0) base.current = h;
      setHeight(h);
    },
    [keyboard],
  );
  return { overlap: keyboardOverlap(keyboard, base.current, height), onLayout };
}
