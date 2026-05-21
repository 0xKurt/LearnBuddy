// Material grid card. Replaces the old row-style MaterialRow in the
// Subject + Folder views.
//
// Design language: 2-column grid, square cover photo on top, label
// underneath. Three visible states:
//
//   READY     normal card, "12 Karten" sublabel, tap → material detail
//   PENDING   slight opacity dim + shimmer bar across the bottom of the
//             cover + "Wird vorbereitet" pill. Tap → pending sheet.
//   FAILED    soft red border, dimmed cover with an "X" overlay,
//             "Nicht lesbar" sublabel, INLINE retry button.
//
// No emojis. Status is conveyed by text + colour + an animation cue.
// Long-press always opens the actions sheet (rename / move / delete)
// — provided the parent passes `onLongPress`.

import { useEffect, useRef } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Btn } from '../lb/Btn.js';
import { CachedImage } from '../lb/CachedImage.js';
import { Icon } from '../lb/Icon.js';
import { LB } from '../../lib/theme/colors.js';
import type { MaterialListItem } from '../../lib/api/materials.js';

type Props = {
  material: MaterialListItem;
  onPress: () => void;
  onRetry: () => void;
  onLongPress?: () => void;
  /** When pending for longer than this many ms we switch the sublabel
   *  from "Wird vorbereitet" to "Dauert etwas länger". `null` to disable
   *  the swap (e.g. in stories / previews). */
  pendingLongMs?: number | null;
};

const COVER_RADIUS = 14;

export function MaterialCard({
  material,
  onPress,
  onRetry,
  onLongPress,
  pendingLongMs = 60_000,
}: Props) {
  const { t } = useTranslation('home');
  const isReady = material.extraction_status === 'ready';
  const isFailed = material.extraction_status === 'failed';
  const isPending = !isReady && !isFailed;

  // ── Pending: shimmer + delayed "taking longer" label ───────────────
  const shimmer = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!isPending) {
      shimmer.stopAnimation();
      shimmer.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.timing(shimmer, {
        toValue: 1,
        duration: 1400,
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [isPending, shimmer]);

  const shimmerTranslate = shimmer.interpolate({
    inputRange: [0, 1],
    outputRange: ['-40%', '140%'],
  });

  const ageMs = Date.now() - new Date(material.created_at).getTime();
  const showLongLabel = isPending && pendingLongMs !== null && ageMs > pendingLongMs;

  // Sub-label: ready → item count; pending → status; failed → "Nicht lesbar"
  const subLabel = isReady
    ? t('material.item_count', { count: material.item_count })
    : isFailed
      ? t('material.status.failed')
      : showLongLabel
        ? t('material.status.preparing_long')
        : t('material.status.preparing');

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={400}
      accessibilityRole="button"
      accessibilityLabel={material.title ?? t('material.untitled')}
      style={({ pressed }) => [
        styles.card,
        isFailed && styles.cardFailed,
        pressed && styles.cardPressed,
      ]}
    >
      <View style={styles.coverWrap}>
        {material.cover_url ? (
          <CachedImage
            source={{ uri: material.cover_url }}
            contentFit="cover"
            transition={150}
            style={[styles.cover, isPending && styles.coverDim, isFailed && styles.coverDim]}
          />
        ) : (
          <View style={[styles.cover, styles.coverPlaceholder]}>
            <Icon name="camera" size={28} color={LB.ink3} />
          </View>
        )}

        {/* Failed: subtle X over the cover. Uses the existing 'close' icon
            (line-stroke X), not an emoji. */}
        {isFailed && (
          <View style={styles.failedOverlay}>
            <View style={styles.failedBadge}>
              <Icon name="close" size={18} color="#fff" />
            </View>
          </View>
        )}

        {/* Pending shimmer bar, swept across the bottom of the cover. */}
        {isPending && (
          <View style={styles.shimmerTrack}>
            <Animated.View
              style={[styles.shimmerSlider, { transform: [{ translateX: shimmerTranslate }] }]}
            />
          </View>
        )}
      </View>

      <View style={styles.labelBlock}>
        <Text style={styles.title} numberOfLines={1}>
          {material.title ?? t('material.untitled')}
        </Text>
        <Text style={[styles.subLabel, isFailed && styles.subLabelFailed]} numberOfLines={1}>
          {subLabel}
        </Text>

        {isFailed ? (
          <View style={styles.retryRow}>
            <Btn size="sm" variant="outline" onPress={onRetry} full>
              {t('material.actions.retry')}
            </Btn>
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: COVER_RADIUS,
    borderWidth: 1,
    borderColor: LB.hairline,
    overflow: 'hidden',
  },
  cardFailed: {
    borderColor: 'rgba(177,73,60,0.55)',
    backgroundColor: 'rgba(177,73,60,0.04)',
  },
  cardPressed: {
    opacity: 0.85,
  },
  coverWrap: {
    width: '100%',
    aspectRatio: 1,
    backgroundColor: LB.bg,
    position: 'relative',
  },
  cover: {
    width: '100%',
    height: '100%',
  },
  coverDim: {
    opacity: 0.6,
  },
  coverPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: LB.bg,
  },
  failedOverlay: {
    position: 'absolute',
    inset: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  failedBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: LB.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shimmerTrack: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 3,
    backgroundColor: 'rgba(0,0,0,0.04)',
    overflow: 'hidden',
  },
  shimmerSlider: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: '40%',
    backgroundColor: LB.primary,
    opacity: 0.85,
    borderRadius: 2,
  },
  labelBlock: {
    paddingHorizontal: 10,
    paddingTop: 8,
    paddingBottom: 10,
    gap: 2,
  },
  title: {
    fontSize: 14,
    fontWeight: '600',
    color: LB.ink,
  },
  subLabel: {
    fontSize: 12,
    color: LB.ink3,
  },
  subLabelFailed: {
    color: LB.danger,
    fontWeight: '500',
  },
  retryRow: {
    marginTop: 8,
  },
});
