// One short message at the bottom (errors, confirmations). Screen readers hear it
// (a live region on Android and the web, an announcement on iOS), and it sits above
// the keyboard on iOS, where it used to hide behind it (audit M-76, M-80). It belongs
// to the screen it appeared on: a route change clears it, unless the caller said
// survivesNavigation — the rules live in lib/toast.ts (issue #91). It stands above
// the screen's real bottom bar; bars report their height through useToastBar. Looks:
// a dark pill floating on a soft shadow; an error also carries a round warning mark
// (never colour alone).

import { usePathname } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Keyboard, type LayoutChangeEvent, Platform, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { announce } from '../../lib/announce.js';
import { MAX_FONT_SCALE } from './Btn.js';
import { LB } from '../../lib/theme/colors.js';
import { SHADOW } from '../../lib/theme/shadow.js';
import {
  barHeight,
  registerToastBar,
  toast,
  toastBottom,
  useToastState,
  type ToastBarHandle,
} from '../../lib/toast.js';

export { toast, type ToastOptions, type ToastTone } from '../../lib/toast.js';

export function ToastHost() {
  const { message, tone, seq, bars } = useToastState();
  const insets = useSafeAreaInsets();
  const keyboard = useIosKeyboardHeight();
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
    const timer = setTimeout(() => toast.hide(), 4500);
    return () => clearTimeout(timer);
  }, [message, seq]);
  if (!message) return null;
  return (
    <View
      pointerEvents="none"
      accessibilityLiveRegion="polite"
      accessibilityRole="alert"
      style={{
        position: 'absolute',
        left: 16,
        right: 16,
        bottom: toastBottom(insets.bottom, barHeight(bars), keyboard),
        alignItems: 'center',
      }}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
          backgroundColor: LB.ink,
          borderRadius: 26,
          paddingHorizontal: 20,
          paddingVertical: 13,
          maxWidth: 520,
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
              minWidth: 22,
              minHeight: 22,
              borderRadius: 999,
              backgroundColor: LB.peachDeep,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text
              maxFontSizeMultiplier={MAX_FONT_SCALE}
              style={{ color: LB.ink, fontSize: 14, lineHeight: 18, fontWeight: '700' }}
            >
              !
            </Text>
          </View>
        ) : null}
        <Text style={{ flexShrink: 1, color: LB.paper, fontSize: 15, lineHeight: 21 }}>
          {message}
        </Text>
      </View>
    </View>
  );
}

/**
 * A screen's pinned bottom bar (Composer, BottomBar, SendBar) hands its measured
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
 * iOS: how much of the screen the keyboard covers (0 when hidden). Android resizes the
 * window for the keyboard, so the toast is above it already.
 */
function useIosKeyboardHeight(): number {
  const [height, setHeight] = useState(0);
  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    const show = Keyboard.addListener('keyboardWillShow', (e) =>
      setHeight(e.endCoordinates.height),
    );
    const hide = Keyboard.addListener('keyboardWillHide', () => setHeight(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return height;
}
