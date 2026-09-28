// Full-screen view of a figure or a photo (gaps.md #1): pinch with two fingers to zoom,
// drag to move around once zoomed, double tap to zoom in on a spot (and back out).
// Closable with an obvious in-sheet "Schließen" button (CLAUDE.md rule 14) and, while
// not zoomed, by pulling it down. A dark, calm veil lets the picture stand out.
// Motion: the veil fades in and the picture grows in softly; reduce motion: only fades.
//
// <Zoomable> wraps a small picture: a tap on it opens the viewer with a larger version.

import { Image } from 'expo-image';
import { useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, Pressable, View } from 'react-native';
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

import {
  clamp,
  clampOffset,
  dismissedBySwipe,
  DOUBLE_TAP_SCALE,
  MAX_SCALE,
  MIN_SCALE,
  offsetAroundFocal,
  rubberBand,
} from '../../lib/gestures.js';
import { DURATION, EASE, SPRING } from '../../lib/theme/motion.js';
import { Btn } from './Btn.js';

type ViewerProps = {
  visible: boolean;
  onClose: () => void;
  /** What the picture shows, for a screen reader. */
  label: string;
  /** The large picture, laid out to fit the free space (flex: 1 is available). */
  children: ReactNode;
};

const VEIL = 'rgba(24,20,38,0.97)';

export function ZoomViewer({ visible, onClose, label, children }: ViewerProps) {
  const { t } = useTranslation('common');
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  const [mounted, setMounted] = useState(visible);

  const shown = useSharedValue(0);
  const scale = useSharedValue(1);
  const x = useSharedValue(0);
  const y = useSharedValue(0);
  /** Pull-down to close (only while not zoomed). */
  const pull = useSharedValue(0);
  const start = useSharedValue({ scale: 1, x: 0, y: 0, fx: 0, fy: 0 });
  const box = useSharedValue({ width: 1, height: 1 });

  useEffect(() => {
    if (visible) {
      setMounted(true);
      scale.value = 1;
      x.value = 0;
      y.value = 0;
      pull.value = 0;
      shown.value = withTiming(1, { duration: DURATION.gentle, easing: EASE.standard });
      return;
    }
    shown.value = withTiming(0, { duration: DURATION.base, easing: EASE.standard }, (done) => {
      if (done) runOnJS(setMounted)(false);
    });
  }, [visible, shown, scale, x, y, pull]);

  /** Back inside the edges (and inside the zoom range), softly. */
  const settle = () => {
    'worklet';
    const s = clamp(scale.value, MIN_SCALE, MAX_SCALE);
    scale.value = withSpring(s, SPRING);
    x.value = withSpring(clampOffset(x.value, s, box.value.width), SPRING);
    y.value = withSpring(clampOffset(y.value, s, box.value.height), SPRING);
  };

  const pinch = Gesture.Pinch()
    .onStart((e) => {
      start.value = {
        scale: scale.value,
        x: x.value,
        y: y.value,
        fx: e.focalX - box.value.width / 2,
        fy: e.focalY - box.value.height / 2,
      };
    })
    .onUpdate((e) => {
      const from = start.value;
      // A little beyond the range while the fingers are down; it springs back after.
      const s = clamp(from.scale * e.scale, MIN_SCALE * 0.8, MAX_SCALE * 1.25);
      scale.value = s;
      x.value = offsetAroundFocal(from.fx, from.x, from.scale, s);
      y.value = offsetAroundFocal(from.fy, from.y, from.scale, s);
    })
    .onEnd(() => {
      settle();
    });

  const pan = Gesture.Pan()
    .averageTouches(true)
    .onStart(() => {
      start.value = { ...start.value, x: x.value, y: y.value };
    })
    .onUpdate((e) => {
      if (scale.value <= 1.01) {
        // Not zoomed: a pull down closes the viewer.
        pull.value = Math.max(0, e.translationY);
        return;
      }
      const w = box.value.width;
      const h = box.value.height;
      const mx = (w * scale.value - w) / 2;
      const my = (h * scale.value - h) / 2;
      x.value = rubberBand(start.value.x + e.translationX, mx);
      y.value = rubberBand(start.value.y + e.translationY, my);
    })
    .onEnd((e) => {
      if (scale.value <= 1.01) {
        if (dismissedBySwipe(e.translationY, e.velocityY)) runOnJS(onClose)();
        else pull.value = withSpring(0, SPRING);
        return;
      }
      settle();
    });

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd((e) => {
      if (scale.value > 1.01) {
        scale.value = withSpring(1, SPRING);
        x.value = withSpring(0, SPRING);
        y.value = withSpring(0, SPRING);
        return;
      }
      const s = DOUBLE_TAP_SCALE;
      const fx = e.x - box.value.width / 2;
      const fy = e.y - box.value.height / 2;
      scale.value = withSpring(s, SPRING);
      x.value = withSpring(clampOffset(offsetAroundFocal(fx, 0, 1, s), s, box.value.width), SPRING);
      y.value = withSpring(
        clampOffset(offsetAroundFocal(fy, 0, 1, s), s, box.value.height),
        SPRING,
      );
    });

  const gesture = Gesture.Simultaneous(pinch, pan, doubleTap);

  const veil = useAnimatedStyle(() => ({
    opacity: shown.value * (1 - Math.min(0.6, pull.value / 400)),
  }));
  const chrome = useAnimatedStyle(() => ({
    opacity: shown.value * (1 - Math.min(1, pull.value / 160)),
  }));
  const picture = useAnimatedStyle(() => {
    const grow = reduced ? 1 : 0.92 + shown.value * 0.08;
    return {
      opacity: shown.value,
      transform: [
        { translateX: x.value },
        { translateY: y.value + pull.value },
        { scale: scale.value * grow * (1 - Math.min(0.15, pull.value / 1600)) },
      ],
    };
  });

  if (!mounted) return null;
  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <Animated.View
          style={[{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }, veil]}
        >
          <View style={{ flex: 1, backgroundColor: VEIL }} />
        </Animated.View>
        <View
          accessibilityViewIsModal
          style={{ flex: 1, paddingTop: insets.top + 12, paddingBottom: insets.bottom + 16 }}
        >
          <Animated.Text
            style={[
              {
                color: 'rgba(255,255,255,0.72)',
                fontSize: 14,
                lineHeight: 19,
                textAlign: 'center',
                paddingHorizontal: 24,
              },
              chrome,
            ]}
          >
            {t('zoom.hint')}
          </Animated.Text>
          <GestureDetector gesture={gesture}>
            <View
              style={{ flex: 1, overflow: 'hidden', marginVertical: 12 }}
              onLayout={(e) => {
                box.value = {
                  width: e.nativeEvent.layout.width,
                  height: e.nativeEvent.layout.height,
                };
              }}
            >
              <Animated.View
                accessible
                accessibilityRole="image"
                accessibilityLabel={label}
                style={[
                  { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 12 },
                  picture,
                ]}
              >
                {children}
              </Animated.View>
            </View>
          </GestureDetector>
          <Animated.View style={[{ paddingHorizontal: 22 }, chrome]}>
            <Btn variant="soft" size="lg" pill full onPress={onClose}>
              {t('actions.close')}
            </Btn>
          </Animated.View>
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
}

type ZoomableProps = {
  /** What the picture shows ("Foto 1 von 2", the figure's description). */
  label: string;
  /** The small picture on the page. */
  children: ReactNode;
  /** The large picture in the viewer (defaults to the small one again). */
  large?: ReactNode;
  /** The tap target fills the box it sits in (a thumbnail that stretches). */
  fill?: boolean;
};

/** A picture that opens full screen when tapped. */
export function Zoomable({ label, children, large, fill = false }: ZoomableProps) {
  const { t } = useTranslation('common');
  const [open, setOpen] = useState(false);
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityHint={t('zoom.open_hint')}
        onPress={() => setOpen(true)}
        // Thumbnails in the chat are ~30×40; the slop lifts them to the 44 pt target.
        hitSlop={10}
        style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1, flex: fill ? 1 : undefined })}
      >
        {children}
      </Pressable>
      <ZoomViewer visible={open} onClose={() => setOpen(false)} label={label}>
        {large ?? children}
      </ZoomViewer>
    </>
  );
}

/** A photo thumbnail that opens the whole photo full screen when tapped. */
export function ZoomablePhoto({
  uri,
  label,
  children,
  fill,
}: {
  uri: string;
  /** What the photo is (defaults to "Dein Foto"). */
  label?: string;
  children: ReactNode;
  fill?: boolean;
}) {
  const { t } = useTranslation('common');
  return (
    <Zoomable
      label={label ?? t('zoom.photo')}
      fill={fill}
      large={
        <Image
          source={{ uri }}
          accessible={false}
          contentFit="contain"
          style={{ width: '100%', height: '100%' }}
        />
      }
    >
      {children}
    </Zoomable>
  );
}
