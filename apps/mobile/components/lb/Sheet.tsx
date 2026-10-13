// Bottom sheet. Always closable with a visible in-sheet button (CLAUDE.md
// rule 14); the backdrop and a swipe down on its top (the grab handle and the
// title) also close it, but are never the only way.
// A sheet with a form passes its CTA as `footer`: it stays pinned under the
// scrolling content and, with the keyboard open, right above the keyboard
// (CLAUDE.md rule 15).
// Looks: a rounded white top sheet on a soft shadow, with a small grab handle
// over a light violet-grey veil. Motion: the veil fades, the sheet rises on the
// shared calm spring and slides away when it closes (the whole close stays under
// the 450 ms that callers wait for, adultGate.tsx). Reduce motion: it appears and closes immediately.

import { FormFrameContext, useFormViewport } from './FormFrameClearance.js';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Modal, Pressable, ScrollView, Text, useWindowDimensions, View } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  cancelAnimation,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { UI } from '../../lib/theme/components.js';
import { ACTIVE_MOTION, DURATION, EASE, SPRING, useMotionReduced } from '../../lib/theme/motion.js';
import { SHADOW } from '../../lib/theme/shadow.js';
import { bottomRoom, SPACE } from '../../lib/theme/space.js';
import { TYPE } from '../../lib/theme/type.js';
import { Btn } from './Btn.js';
import { dismissedBySwipe } from '../../lib/gestures.js';
import { KeyboardSafe } from './KeyboardSafe.js';
import { useA11ySettings } from '../../lib/a11ySettings.js';

type Props = {
  visible: boolean;
  /** Optional, as in components/core/Sheet.jsx: a sheet whose content names itself needs none. */
  title?: string;
  closeLabel: string;
  onClose: () => void;
  children: ReactNode;
  /** Pinned below the content, above the close button (a form's main action). */
  footer?: ReactNode;
  /**
   * Names the sheet's scrolling area for the walkthrough's fit check (tests/web/fit.ts).
   * A sheet holding a list she browses on purpose — the sixteen Bundesländer, issue #199 —
   * passes "scroll-list"; a short sheet needs nothing, because it does not scroll.
   */
  scrollTestID?: string;
};

/** The most of the screen a sheet takes: the veil above it stays a tap target. */
export const SHEET_MAX = UI.sheet.maxFraction;
/** The sheet's top corners: rounder than a card, it rises from the screen's edge. */
const CORNER = UI.sheet.radius;
/** Its side margin and the room between its parts (Sheet.jsx: `padding: 10px 16px 30px`, gap 16). */
const SIDE = SPACE.lg;
const PARTS = SPACE.lg;
/**
 * How far a sheet's words stand in from its side: the title, and any loose line of text a caller
 * puts under it (Sheet.jsx:11 and `Lead` in ui_kits/app/More.jsx:13, both `padding: 0 4px`). A
 * list or a card keeps the full width.
 */
export const SHEET_TEXT = { paddingHorizontal: SPACE.xs } as const;

export function Sheet({
  visible,
  title,
  closeLabel,
  onClose,
  children,
  footer,
  scrollTestID,
}: Props) {
  const form = useFormViewport();
  const attachScroll = useCallback(
    (node: ScrollView | null) => {
      // A newly mounted native scroll host starts at zero; a reused host keeps its offset.
      if (node !== form.scroll.current) form.offset.current = 0;
      form.scroll.current = node;
    },
    [form.scroll, form.offset],
  );
  const { palette } = useTheme();
  const { reduceTransparency } = useA11ySettings();
  const insets = useSafeAreaInsets();
  // The one height here that SHOULD ignore the keyboard: how far down it slides to be off the
  // screen (the lint rule of issue #289 is about laying out, not about this).
  // eslint-disable-next-line lb/no-window-height
  const { height: screen } = useWindowDimensions();
  const reduced = useMotionReduced();
  // Stays mounted while it slides out.
  const [mounted, setMounted] = useState(visible);
  /** 0 = closed (off screen, veil clear), 1 = open. */
  const shown = useSharedValue(0);
  /** How far a finger pulled it down (px). */
  const drag = useSharedValue(0);

  useEffect(() => {
    if (reduced) {
      cancelAnimation(shown);
      cancelAnimation(drag);
      shown.value = visible ? 1 : 0;
      drag.value = 0;
      setMounted(visible);
      return;
    }
    if (visible) {
      setMounted(true);
      drag.value = 0;
      shown.value = withTiming(1, {
        duration: DURATION.base,
        easing: EASE.standard,
        ...ACTIVE_MOTION,
      });
      return;
    }
    shown.value = withTiming(
      0,
      { duration: DURATION.base, easing: EASE.standard, ...ACTIVE_MOTION },
      (finished) => {
        if (finished) runOnJS(setMounted)(false);
      },
    );
  }, [visible, reduced, shown, drag]);

  const pan = Gesture.Pan()
    .activeOffsetY(UI.sheet.gestureStart)
    .failOffsetX([-UI.sheet.gestureFail, UI.sheet.gestureFail])
    .onUpdate((e) => {
      // Down follows the finger; up gives only a little (it is already fully open).
      drag.value = e.translationY > 0 ? e.translationY : e.translationY * UI.sheet.dragResistance;
    })
    .onEnd((e) => {
      if (dismissedBySwipe(e.translationY, e.velocityY)) {
        runOnJS(onClose)();
      } else {
        drag.value = reduced ? 0 : withSpring(0, { ...SPRING, ...ACTIVE_MOTION });
      }
    });

  const veil = useAnimatedStyle(() => ({ opacity: Math.min(1, shown.value) }));
  const sheet = useAnimatedStyle(() => {
    if (reduced) return { opacity: shown.value };
    // Off screen while closed; the spring's small overshoot is clamped to open.
    const offset = (1 - Math.min(1, shown.value)) * screen * UI.sheet.travel;
    return { transform: [{ translateY: offset + Math.max(0, drag.value) }] };
  });

  if (!mounted) return null;
  return (
    <Modal
      visible
      transparent
      animationType="none"
      onRequestClose={onClose}
      // Android gives a modal its own window, and that window does not inherit the app's
      // system chrome: under a dark sheet the navigation bar comes back white (measured on
      // the Xiaomi, 01.10., issue #177). Asking for translucent bars is right either way —
      // React Native refuses the navigation bar without the status bar, hence both — but it
      // did **not** fix it on that device, so nothing here claims it does.
      statusBarTranslucent
      navigationBarTranslucent
    >
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
                {/* The veil separates the sheet from the screen. With Reduce Transparency
                    it becomes opaque rather than disappearing (issue #133 position 13):
                    taking it away would leave the sheet floating over readable text. */}
                <View
                  style={{
                    flex: 1,
                    backgroundColor: palette.scrim,
                    opacity: reduceTransparency ? 1 : UI.sheet.veilOpacity,
                  }}
                />
              </Pressable>
            </Animated.View>
            <Animated.View
              accessibilityViewIsModal
              style={[
                {
                  backgroundColor: palette.bg,
                  borderTopLeftRadius: CORNER,
                  borderTopRightRadius: CORNER,
                  // 30 under the last part; a home indicator taller than that keeps its room.
                  paddingBottom: Math.max(UI.sheet.bottomPad, bottomRoom(insets.bottom, SPACE.sm)),
                  maxHeight: `${SHEET_MAX * 100}%`,
                  ...SHADOW.float,
                },
                sheet,
              ]}
            >
              {/* The top of the sheet (handle and title) can be pulled down to close it. */}
              <GestureDetector gesture={pan}>
                <View
                  style={{
                    paddingTop: UI.sheet.topPad,
                    paddingHorizontal: SIDE,
                    paddingBottom: PARTS,
                    gap: PARTS,
                  }}
                >
                  <View
                    accessibilityElementsHidden
                    importantForAccessibility="no-hide-descendants"
                    style={{
                      alignSelf: 'center',
                      width: UI.sheet.handleWidth,
                      height: UI.sheet.handleHeight,
                      borderRadius: UI.sheet.handleRadius,
                      backgroundColor: palette.ink4,
                    }}
                  />
                  {title ? (
                    <Text accessibilityRole="header" style={[TYPE.title, SHEET_TEXT]}>
                      {title}
                    </Text>
                  ) : null}
                </View>
              </GestureDetector>
              <ScrollView
                ref={attachScroll}
                onLayout={form.controller.refresh}
                onContentSizeChange={form.controller.refresh}
                onScroll={(event) => {
                  form.offset.current = event.nativeEvent.contentOffset.y;
                }}
                testID={scrollTestID}
                style={{ flexGrow: 0, flexShrink: 1 }}
                contentContainerStyle={{
                  paddingHorizontal: SIDE,
                  // The sheet's rhythm: between its parts and under the last.
                  paddingBottom: PARTS,
                  gap: PARTS,
                }}
                keyboardShouldPersistTaps="handled"
              >
                <FormFrameContext.Provider value={form.controller}>
                  {children}
                </FormFrameContext.Provider>
              </ScrollView>
              <View style={{ paddingHorizontal: SIDE, gap: SPACE.sm }}>
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
