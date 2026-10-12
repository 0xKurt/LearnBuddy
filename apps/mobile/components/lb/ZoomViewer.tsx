// Full-screen view of a figure or a photo (gaps.md #1): pinch with two fingers to zoom,
// drag to move around once zoomed, double tap to zoom in on a spot (and back out).
// Closable with an obvious in-sheet "Schließen" button (CLAUDE.md rule 14) and, while
// not zoomed, by pulling it down. A dark, calm veil lets the picture stand out.
// Motion: the veil fades in and the picture grows in softly; reduced motion disables every transition.
//
// <Zoomable> wraps a small picture: a tap on it opens the viewer with a larger version.

import { Image } from 'expo-image';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, Pressable, View } from 'react-native';
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
import {
  ACTIVE_MOTION,
  DURATION,
  EASE,
  SPRING,
  reducedMotionValue,
  useMotionReduced,
} from '../../lib/theme/motion.js';
import { PRACTICE_SCREEN } from '../../lib/theme/practiceScreen.js';
import { PaletteScope, useTheme } from '../../lib/theme/ThemeProvider.js';
import { bottomRoom, GUTTER, SPACE, TOUCH } from '../../lib/theme/space.js';
import { TYPE } from '../../lib/theme/type.js';
import { Btn } from './Btn.js';

type ViewerProps = {
  visible: boolean;
  onClose: () => void;
  /** What the picture shows, for a screen reader. */
  label: string;
  /** The large picture, laid out to fit the free space (flex: 1 is available). */
  children: ReactNode;
};

export function ZoomViewer({ visible, onClose, label, children }: ViewerProps) {
  const { t } = useTranslation('common');
  const insets = useSafeAreaInsets();
  const reduced = useMotionReduced();
  const { palette } = useTheme();
  const [mounted, setMounted] = useState(visible);
  const visibility = useRef(visible);
  visibility.current = visible;
  const epoch = useRef(0);
  const requested = useRef(false);
  const requestClose = useCallback(() => {
    if (requested.current) return;
    requested.current = true;
    onClose();
  }, [onClose]);
  const finishClose = useCallback((version: number) => {
    if (epoch.current === version && !visibility.current) setMounted(false);
  }, []);

  const shown = useSharedValue(0);
  const scale = useSharedValue(1);
  const x = useSharedValue(0);
  const y = useSharedValue(0);
  /** Pull-down to close (only while not zoomed). */
  const pull = useSharedValue(0);
  const start = useSharedValue({ scale: 1, x: 0, y: 0, fx: 0, fy: 0 });
  const box = useSharedValue({ width: 1, height: 1 });

  useEffect(() => {
    const version = ++epoch.current;
    if (visible) {
      requested.current = false;
      setMounted(true);
      scale.value = 1;
      x.value = 0;
      y.value = 0;
      pull.value = 0;
      cancelAnimation(shown);
      shown.value = reducedMotionValue.value
        ? 1
        : withTiming(1, { duration: DURATION.gentle, easing: EASE.standard, ...ACTIVE_MOTION });
      return;
    }
    cancelAnimation(shown);
    if (reducedMotionValue.value) {
      shown.value = 0;
      setMounted(false);
      return;
    }
    shown.value = withTiming(
      0,
      { duration: DURATION.base, easing: EASE.standard, ...ACTIVE_MOTION },
      (done) => {
        if (done) runOnJS(finishClose)(version);
      },
    );
    return () => cancelAnimation(shown);
  }, [visible, shown, scale, x, y, pull, finishClose]);

  useEffect(() => {
    if (!reduced) return;
    // Cancel at the current transform: changing the OS preference never resets a zoom.
    for (const value of [shown, scale, x, y, pull]) cancelAnimation(value);
    shown.value = visible ? 1 : 0;
    if (!visible) setMounted(false);
  }, [reduced, visible, shown, scale, x, y, pull]);

  useEffect(
    () => () => {
      for (const value of [shown, scale, x, y, pull]) cancelAnimation(value);
    },
    [shown, scale, x, y, pull],
  );

  const spring = (target: number) => {
    'worklet';
    return reducedMotionValue.value ? target : withSpring(target, { ...SPRING, ...ACTIVE_MOTION });
  };

  /** Back inside the edges (and inside the zoom range), softly. */
  const settle = () => {
    'worklet';
    const s = clamp(scale.value, MIN_SCALE, MAX_SCALE);
    scale.value = spring(s);
    x.value = spring(clampOffset(x.value, s, box.value.width));
    y.value = spring(clampOffset(y.value, s, box.value.height));
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
      const s = clamp(
        from.scale * e.scale,
        MIN_SCALE * PRACTICE_SCREEN.pinchUnder,
        MAX_SCALE * PRACTICE_SCREEN.pinchOver,
      );
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
      if (scale.value <= PRACTICE_SCREEN.zoomedFrom) {
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
      if (scale.value <= PRACTICE_SCREEN.zoomedFrom) {
        if (dismissedBySwipe(e.translationY, e.velocityY)) runOnJS(requestClose)();
        else pull.value = spring(0);
        return;
      }
      settle();
    });

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd((e) => {
      if (scale.value > PRACTICE_SCREEN.zoomedFrom) {
        scale.value = spring(1);
        x.value = spring(0);
        y.value = spring(0);
        return;
      }
      const s = DOUBLE_TAP_SCALE;
      const fx = e.x - box.value.width / 2;
      const fy = e.y - box.value.height / 2;
      scale.value = spring(s);
      x.value = spring(clampOffset(offsetAroundFocal(fx, 0, 1, s), s, box.value.width));
      y.value = spring(clampOffset(offsetAroundFocal(fy, 0, 1, s), s, box.value.height));
    });

  const gesture = Gesture.Simultaneous(pinch, pan, doubleTap);

  const veil = useAnimatedStyle(() => ({
    opacity:
      shown.value *
      (1 - Math.min(PRACTICE_SCREEN.pullVeilFade, pull.value / PRACTICE_SCREEN.pullVeilDistance)),
  }));
  const chrome = useAnimatedStyle(() => ({
    opacity: shown.value * (1 - Math.min(1, pull.value / PRACTICE_SCREEN.pullChromeDistance)),
  }));
  const picture = useAnimatedStyle(() => {
    const grow = reduced
      ? 1
      : PRACTICE_SCREEN.viewerStartScale + shown.value * (1 - PRACTICE_SCREEN.viewerStartScale);
    return {
      opacity: shown.value,
      transform: [
        { translateX: x.value },
        { translateY: y.value + pull.value },
        {
          scale:
            scale.value *
            grow *
            (1 -
              Math.min(
                PRACTICE_SCREEN.pullScaleShrink,
                pull.value / PRACTICE_SCREEN.pullScaleDistance,
              )),
        },
      ],
    };
  });

  if (!mounted) return null;
  return (
    <Modal visible transparent animationType="none" onRequestClose={requestClose}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <Animated.View
          style={[{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }, veil]}
        >
          <View style={{ flex: 1, backgroundColor: palette.viewerVeil }} />
        </Animated.View>
        <View
          accessibilityViewIsModal
          style={{
            flex: 1,
            paddingTop: Math.max(insets.top + SPACE.md, PRACTICE_SCREEN.viewerHintTop),
            paddingBottom: bottomRoom(insets.bottom, PRACTICE_SCREEN.viewerBottomRoom),
          }}
        >
          <Animated.Text
            style={[
              TYPE.metaSemibold,
              {
                color: palette.onViewerVeil,
                textAlign: 'center',
                paddingHorizontal: SPACE.xl,
              },
              chrome,
            ]}
          >
            {t('zoom.hint')}
          </Animated.Text>
          <GestureDetector gesture={gesture}>
            <View
              style={{ flex: 1, overflow: 'hidden', marginVertical: SPACE.md }}
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
                  { flex: 1, alignItems: 'center', justifyContent: 'center', padding: SPACE.md },
                  picture,
                ]}
              >
                {children}
              </Animated.View>
            </View>
          </GestureDetector>

          <Animated.View style={[{ paddingHorizontal: GUTTER }, chrome]}>
            <PaletteScope name="pastellDark">
              <Btn variant="secondary" full onPress={requestClose}>
                {t('actions.close')}
              </Btn>
            </PaletteScope>
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
        hitSlop={PRACTICE_SCREEN.thumbnailSlop}
        style={({ pressed }) => ({
          opacity: pressed ? PRACTICE_SCREEN.thumbnailPressed : 1,
          minWidth: TOUCH,
          minHeight: TOUCH,
          flex: fill ? 1 : undefined,
        })}
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
          accessibilityLabel={label ?? t('zoom.photo')}
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

/**
 * A photo that fills its thumbnail box and opens full screen on a tap: a page she is about to
 * send (components/buddy/AttachStrip.tsx), a page Buddy is reading (components/buddy/SlimBar.tsx).
 * `onError`: the phone cannot show it, and the caller says so in its place.
 */
export function PhotoThumb({
  uri,
  label,
  onError,
}: {
  uri: string;
  /** What the photo is ("Foto 1 von 2"). */
  label: string;
  onError: () => void;
}) {
  const reduced = useMotionReduced();
  return (
    <ZoomablePhoto uri={uri} label={label} fill>
      <Image
        source={{ uri }}
        accessible
        accessibilityLabel={label}
        contentFit="cover"
        key={`${uri}.${reduced}`}
        transition={reduced ? 0 : DURATION.zoomPhotoArrival}
        recyclingKey={uri}
        cachePolicy="memory-disk"
        onError={onError}
        style={{ flex: 1 }}
      />
    </ZoomablePhoto>
  );
}
