// DiagramQuestion — pinch-zoom image with marker pulse. Doc 05 §key-components.
//
// Renders a study_asset (PNG produced by the server's Sharp pipeline,
// `apps/api/src/lib/llm/diagram.ts`) with the labels masked. The numbered
// markers were composited into the PNG server-side; this component adds a
// soft pulsing ring on the active marker so the learner knows which label
// the question is asking about. Pinch to zoom (1×–4×), drag to pan.
//
// Inputs:
//   - storage_url    — signed public/temporary URL to the PNG
//   - width / height — intrinsic PNG dimensions from the study_assets row
//   - label_positions— normalised (0–1) coords from study_asset.metadata
//   - active_index   — the marker the current item is asking about (or null
//                      for a "label all markers" item type)

import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Image, type LayoutChangeEvent, View } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Svg, { Circle } from 'react-native-svg';

import { LB } from '../../lib/theme/colors.js';

type LabelPosition = { index: number; x: number; y: number };

type Props = {
  storage_url: string;
  width: number;
  height: number;
  label_positions: LabelPosition[];
  active_index: number | null;
  /** Cap on the rendered display width — height scales to preserve aspect. */
  max_width?: number;
};

const MIN_SCALE = 1;
const MAX_SCALE = 4;

export function DiagramQuestion({
  storage_url,
  width,
  height,
  label_positions,
  active_index,
  max_width = 320,
}: Props) {
  const aspect = width > 0 ? height / width : 0.75;
  const displayW = Math.min(max_width, width);
  const displayH = displayW * aspect;

  // Container layout — used to translate marker normalized coords into px.
  const [layout, setLayout] = useState({ w: displayW, h: displayH });
  const onLayout = (e: LayoutChangeEvent) => {
    const { width: w, height: h } = e.nativeEvent.layout;
    if (w > 0 && h > 0) setLayout({ w, h });
  };

  // Pinch + pan gestures share these refs.
  const scale = useRef(1);
  const tx = useRef(0);
  const ty = useRef(0);
  const baseScale = useRef(1);
  const baseTx = useRef(0);
  const baseTy = useRef(0);
  const [, force] = useState(0);
  const reflow = () => force((n) => n + 1);

  const pinch = useMemo(
    () =>
      Gesture.Pinch()
        .onUpdate((e) => {
          scale.current = clamp(baseScale.current * e.scale, MIN_SCALE, MAX_SCALE);
          reflow();
        })
        .onEnd(() => {
          baseScale.current = scale.current;
          if (scale.current === 1) {
            // Snap back to origin on full zoom-out.
            tx.current = 0;
            ty.current = 0;
            baseTx.current = 0;
            baseTy.current = 0;
            reflow();
          }
        }),
    [],
  );
  const pan = useMemo(
    () =>
      Gesture.Pan()
        .onUpdate((e) => {
          tx.current = baseTx.current + e.translationX;
          ty.current = baseTy.current + e.translationY;
          reflow();
        })
        .onEnd(() => {
          baseTx.current = tx.current;
          baseTy.current = ty.current;
        }),
    [],
  );
  const composed = useMemo(() => Gesture.Simultaneous(pinch, pan), [pinch, pan]);

  // Marker pulse — animates a single shared opacity value so the active
  // ring fades in/out subtly. Reduced motion handled implicitly because the
  // amplitude is 0.4→0.9 (never invisible).
  const pulse = useRef(new Animated.Value(0.4)).current;
  useEffect(() => {
    if (active_index === null) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.9, duration: 700, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.4, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [active_index, pulse]);

  return (
    <GestureHandlerRootView style={{ width: displayW, height: displayH }}>
      <GestureDetector gesture={composed}>
        <View
          onLayout={onLayout}
          accessibilityRole="image"
          accessibilityLabel={
            active_index !== null
              ? `Diagramm mit Markierung ${active_index}`
              : 'Diagramm zum Beschriften'
          }
          style={{
            width: displayW,
            height: displayH,
            borderRadius: 12,
            overflow: 'hidden',
            backgroundColor: LB.bg,
          }}
        >
          <View
            style={{
              transform: [
                { translateX: tx.current },
                { translateY: ty.current },
                { scale: scale.current },
              ],
            }}
          >
            <Image
              source={{ uri: storage_url }}
              style={{ width: displayW, height: displayH }}
              resizeMode="contain"
              accessibilityIgnoresInvertColors
            />
            <Svg width={displayW} height={displayH} style={{ position: 'absolute', inset: 0 }}>
              {label_positions.map((p) => {
                const cx = p.x * layout.w;
                const cy = p.y * layout.h;
                const isActive = p.index === active_index;
                return (
                  <Circle
                    key={p.index}
                    cx={cx}
                    cy={cy}
                    r={isActive ? 14 : 10}
                    stroke={LB.danger}
                    strokeWidth={2}
                    fill={isActive ? 'rgba(177,73,60,0.18)' : 'rgba(255,255,255,0.0)'}
                  />
                );
              })}
            </Svg>
            {active_index !== null && (
              <Animated.View
                pointerEvents="none"
                style={{
                  position: 'absolute',
                  inset: 0,
                  opacity: pulse,
                }}
              >
                <Svg width={displayW} height={displayH}>
                  {label_positions
                    .filter((p) => p.index === active_index)
                    .map((p) => (
                      <Circle
                        key={`pulse-${p.index}`}
                        cx={p.x * layout.w}
                        cy={p.y * layout.h}
                        r={20}
                        stroke={LB.danger}
                        strokeWidth={3}
                        fill="none"
                      />
                    ))}
                </Svg>
              </Animated.View>
            )}
          </View>
        </View>
      </GestureDetector>
    </GestureHandlerRootView>
  );
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}
