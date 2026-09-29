// Bottom sheet. Always closable with a visible in-sheet button (CLAUDE.md
// rule 14); the backdrop and a swipe down on its top (the grab handle and the
// title) also close it, but are never the only way.
// A sheet with a form passes its CTA as `footer`: it stays pinned under the
// scrolling content and, with the keyboard open, right above the keyboard
// (CLAUDE.md rule 15).
// Looks: a rounded white top sheet on a soft shadow, with a small grab handle
// over a light violet-grey veil. Motion: the veil fades, the sheet rises on the
// shared calm spring and slides away when it closes (the whole close stays under
// the 450 ms that callers wait for, adultGate.tsx). Reduce motion: it just fades.

import { useEffect, useState, type ReactNode } from 'react';
import { Modal, Pressable, ScrollView, Text, useWindowDimensions, View } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { LB } from '../../lib/theme/colors.js';
import { DURATION, EASE, SPRING } from '../../lib/theme/motion.js';
import { SHADOW } from '../../lib/theme/shadow.js';
import { TYPE } from '../../lib/theme/type.js';
import { Btn } from './Btn.js';
import { dismissedBySwipe } from '../../lib/gestures.js';
import { KeyboardSafe } from './KeyboardSafe.js';

type Props = {
  visible: boolean;
  title: string;
  closeLabel: string;
  onClose: () => void;
  children: ReactNode;
  /** Pinned below the content, above the close button (a form's main action). */
  footer?: ReactNode;
};

export function Sheet({ visible, title, closeLabel, onClose, children, footer }: Props) {
  const insets = useSafeAreaInsets();
  const { height: screen } = useWindowDimensions();
  const reduced = useReducedMotion();
  // Stays mounted while it slides out.
  const [mounted, setMounted] = useState(visible);
  /** 0 = closed (off screen, veil clear), 1 = open. */
  const shown = useSharedValue(0);
  /** How far a finger pulled it down (px). */
  const drag = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      setMounted(true);
      drag.value = 0;
      shown.value = reduced ? withTiming(1, { duration: DURATION.quick }) : withSpring(1, SPRING);
      return;
    }
    shown.value = withTiming(
      0,
      { duration: reduced ? DURATION.quick : DURATION.base, easing: EASE.standard },
      (finished) => {
        if (finished) runOnJS(setMounted)(false);
      },
    );
  }, [visible, reduced, shown, drag]);

  const pan = Gesture.Pan()
    .activeOffsetY(8)
    .failOffsetX([-24, 24])
    .onUpdate((e) => {
      // Down follows the finger; up gives only a little (it is already fully open).
      drag.value = e.translationY > 0 ? e.translationY : e.translationY * 0.15;
    })
    .onEnd((e) => {
      if (dismissedBySwipe(e.translationY, e.velocityY)) {
        runOnJS(onClose)();
      } else {
        drag.value = withSpring(0, SPRING);
      }
    });

  const veil = useAnimatedStyle(() => ({ opacity: Math.min(1, shown.value) }));
  const sheet = useAnimatedStyle(() => {
    if (reduced) return { opacity: shown.value };
    // Off screen while closed; the spring's small overshoot is clamped to open.
    const offset = (1 - Math.min(1, shown.value)) * screen * 0.9;
    return { transform: [{ translateY: offset + Math.max(0, drag.value) }] };
  });

  if (!mounted) return null;
  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose}>
      {/* A modal is its own root: gestures inside it need their own handler root. */}
      <GestureHandlerRootView style={{ flex: 1 }}>
        <KeyboardSafe style={{ flex: 1 }}>
          <View style={{ flex: 1, justifyContent: 'flex-end' }}>
            <Animated.View
              style={[{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }, veil]}
            >
              <Pressable
                // Hidden from screen readers: TalkBack would sweep a screen-sized
                // "close" button (accessibilityViewIsModal covers only iOS). The
                // in-sheet close button below the footer is the guaranteed exit.
                // `aria-hidden` + tabIndex: accessibilityElementsHidden does not reach
                // the web, where the veil showed up as a second giant "Schließen"
                // (found by the walkthrough's strict locator, issue #84 run).
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
                aria-hidden
                tabIndex={-1}
                accessibilityRole="button"
                accessibilityLabel={closeLabel}
                onPress={onClose}
                style={{ flex: 1 }}
              >
                <View style={{ flex: 1, backgroundColor: 'rgba(31,27,46,0.28)' }} />
              </Pressable>
            </Animated.View>
            <Animated.View
              accessibilityViewIsModal
              style={[
                {
                  backgroundColor: LB.paper,
                  borderTopLeftRadius: 32,
                  borderTopRightRadius: 32,
                  paddingBottom: insets.bottom + 8,
                  maxHeight: '92%',
                  ...SHADOW.float,
                },
                sheet,
              ]}
            >
              {/* The top of the sheet (handle and title) can be pulled down to close it. */}
              <GestureDetector gesture={pan}>
                <View style={{ paddingTop: 10, paddingHorizontal: 22, paddingBottom: 12 }}>
                  <View
                    accessibilityElementsHidden
                    importantForAccessibility="no-hide-descendants"
                    style={{
                      alignSelf: 'center',
                      width: 40,
                      height: 5,
                      borderRadius: 3,
                      backgroundColor: LB.ink4,
                      marginBottom: 14,
                    }}
                  />
                  <Text accessibilityRole="header" style={TYPE.title}>
                    {title}
                  </Text>
                </View>
              </GestureDetector>
              <ScrollView
                style={{ flexGrow: 0, flexShrink: 1 }}
                contentContainerStyle={{ paddingHorizontal: 22, paddingBottom: 14, gap: 14 }}
                keyboardShouldPersistTaps="handled"
              >
                {children}
              </ScrollView>
              <View style={{ paddingHorizontal: 22, gap: 8 }}>
                {footer}
                <Btn variant="ghost" pill full onPress={onClose}>
                  {closeLabel}
                </Btn>
              </View>
            </Animated.View>
          </View>
        </KeyboardSafe>
      </GestureHandlerRootView>
    </Modal>
  );
}
