// Material screen. Doc 05 §Material.
//
// One clear job: review the questions from this material, then practise
// them as a conversation. (The old flip-card mode was removed — the
// conversational session is the single, obvious way to practise.)

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  Btn,
  CachedImage,
  CircleBtn,
  EmptyState,
  LoadingState,
} from '../../../components/lb/index.js';
import { PhotoViewerModal } from '../../../components/material/PhotoViewerModal.js';
import { retryErrorCopy } from '../../../components/material/retry-error.js';
import { getAccount } from '../../../lib/api/account.js';
import { archiveItem } from '../../../lib/api/items.js';
import { getMaterial, retryMaterial } from '../../../lib/api/materials.js';
import { useNavigateUp } from '../../../lib/navigation/hierarchy.js';
import { LB } from '../../../lib/theme/colors.js';

export default function MaterialScreen() {
  const { materialId } = useLocalSearchParams<{ materialId: string }>();
  const navigateUp = useNavigateUp();
  const { t: tCommon } = useTranslation('common');
  const { t: tHome } = useTranslation('home');
  const insets = useSafeAreaInsets();
  const accountQuery = useQuery({ queryKey: ['account'], queryFn: getAccount });
  const learnerId = accountQuery.data?.learner?.id;

  const materialQuery = useQuery({
    queryKey: ['material', materialId],
    queryFn: () => getMaterial(learnerId as string, materialId),
    enabled: !!learnerId && !!materialId,
  });

  const [revealedIds, setRevealedIds] = useState<Set<string>>(new Set());
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const qc = useQueryClient();

  const retryMut = useMutation({
    mutationFn: () => retryMaterial(learnerId as string, materialId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['material', materialId] });
      qc.invalidateQueries({ queryKey: ['materials'] });
    },
    onError: (err) => {
      const { title, body } = retryErrorCopy(err, tHome);
      Alert.alert(title, body);
    },
  });

  const deleteItemMut = useMutation({
    mutationFn: (itemId: string) => archiveItem(learnerId as string, itemId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['material', materialId] });
      qc.invalidateQueries({ queryKey: ['folder-detail'] });
    },
    onError: () =>
      Alert.alert(
        tHome('material.detail.card_delete_failed_title'),
        tHome('material.detail.card_delete_failed_body'),
      ),
  });

  function confirmDeleteItem(itemId: string) {
    Alert.alert(
      tHome('material.detail.card_delete_title'),
      tHome('material.detail.card_delete_body'),
      [
        { text: tCommon('actions.cancel'), style: 'cancel' },
        {
          text: tHome('material.detail.card_delete_cta'),
          style: 'destructive',
          onPress: () => deleteItemMut.mutate(itemId),
        },
      ],
    );
  }

  if (materialQuery.isError) {
    return (
      <View style={{ flex: 1, backgroundColor: LB.paper }}>
        <View style={{ padding: 22 }}>
          <CircleBtn icon="back" onPress={navigateUp} />
          <EmptyState
            glyph="😕"
            title={tCommon('material.load_error_title')}
            body={tCommon('load_error')}
            action={
              <Btn size="sm" onPress={() => void materialQuery.refetch()}>
                {tCommon('actions.retry')}
              </Btn>
            }
          />
        </View>
      </View>
    );
  }

  if (materialQuery.isLoading || accountQuery.isLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: LB.paper }}>
        <LoadingState />
      </View>
    );
  }

  if (!materialQuery.data) {
    return (
      <View style={{ flex: 1, backgroundColor: LB.paper }}>
        <View style={{ padding: 22 }}>
          <CircleBtn icon="back" onPress={navigateUp} />
          <EmptyState
            glyph="🤔"
            title={tCommon('material.not_found')}
            body={tCommon('material.not_found_body')}
          />
        </View>
      </View>
    );
  }

  const material = materialQuery.data;
  const items = material.items;
  const photoUrls = material.photo_urls ?? [];
  const isFailed = material.extraction_status === 'failed';
  const isPending =
    material.extraction_status !== 'ready' && material.extraction_status !== 'failed';

  function toggleReveal(id: string) {
    setRevealedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const practise = () => {
    if (!learnerId) return;
    router.push({
      pathname: '/(learner)/chat/[sessionId]',
      params: { sessionId: 'new', materialId },
    });
  };

  return (
    <View style={{ flex: 1, backgroundColor: LB.paper }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: 20,
          paddingVertical: 12,
          gap: 10,
        }}
      >
        <CircleBtn icon="back" onPress={navigateUp} />
        <Text style={{ fontSize: 14, fontWeight: '600', color: LB.ink, flex: 1 }} numberOfLines={1}>
          {material.title ?? tCommon('material.untitled')}
        </Text>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingBottom: 24,
          gap: 12,
        }}
        refreshControl={
          <RefreshControl
            refreshing={materialQuery.isFetching && !materialQuery.isLoading}
            onRefresh={() => void materialQuery.refetch()}
            tintColor={LB.ink2}
          />
        }
      >
        {/* Photo strip — horizontal scroll of the originals so the user
            can verify "this is the right material" at a glance. Tap to
            enlarge in the full-screen viewer. */}
        {photoUrls.length > 0 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.photoStrip}
          >
            {photoUrls.map((uri, i) => (
              <Pressable key={i} onPress={() => setViewerIndex(i)}>
                <CachedImage
                  source={{ uri }}
                  contentFit="cover"
                  transition={150}
                  style={styles.photoThumb}
                />
              </Pressable>
            ))}
          </ScrollView>
        )}

        {/* Failed-state banner — appears when the worker couldn't read
            the material. Big inline Retry button so the user doesn't
            need to dig into a menu. */}
        {isFailed && (
          <View style={styles.failedBanner}>
            <Text style={styles.failedTitle}>{tHome('material.status.failed')}</Text>
            <Text style={styles.failedBody}>{tHome('material.retry_max_body')}</Text>
            <Btn full onPress={() => retryMut.mutate()} disabled={retryMut.isPending}>
              {tHome('material.actions.retry')}
            </Btn>
          </View>
        )}

        {/* Pending-state banner — material is still being processed.
            We just remind the user; no actions to take. */}
        {isPending && (
          <View style={styles.pendingBanner}>
            <Text style={styles.pendingText}>{tHome('material.status.preparing')}</Text>
          </View>
        )}

        <Text style={{ fontSize: 26, fontWeight: '600', color: LB.ink, letterSpacing: -0.5 }}>
          {material.title ?? tCommon('material.untitled')}
        </Text>
        <Text style={{ fontSize: 12, color: LB.ink2 }}>
          {tCommon('material.question_count', { count: items.length })}
        </Text>

        {items.length > 0 && (
          <Text
            style={{
              fontSize: 11,
              fontWeight: '700',
              color: LB.ink3,
              letterSpacing: 0.8,
              textTransform: 'uppercase',
              marginTop: 10,
              marginBottom: 2,
            }}
          >
            {/* "Karten" / "Cards" section header above the items list */}
            {tHome('material.detail.section_cards')}
          </Text>
        )}

        {items.length === 0 ? (
          <View style={{ paddingVertical: 28 }}>
            <EmptyState
              glyph="📷"
              title={tCommon('material.no_items')}
              body={tCommon('material.no_items_body')}
            />
          </View>
        ) : (
          <View style={{ gap: 10 }}>
            {items.map((item, idx) => {
              const revealed = revealedIds.has(item.id);
              return (
                <Pressable
                  key={item.id}
                  onLongPress={() => confirmDeleteItem(item.id)}
                  delayLongPress={350}
                  accessibilityHint={tHome('material.detail.card_long_press_hint')}
                  style={({ pressed }) => [
                    {
                      borderRadius: 18,
                      backgroundColor: '#fff',
                      borderColor: LB.hairline,
                      borderWidth: 1,
                      overflow: 'hidden',
                    },
                    pressed && { opacity: 0.95 },
                  ]}
                >
                  <View style={{ padding: 16 }}>
                    <Text style={{ fontSize: 11, color: LB.ink3, fontWeight: '600' }}>
                      {tCommon('material.question_label', { index: idx + 1 })}
                    </Text>
                    <Text style={{ fontSize: 15, color: LB.ink, marginTop: 6, lineHeight: 21 }}>
                      {item.question}
                    </Text>
                  </View>
                  <Pressable
                    onPress={() => toggleReveal(item.id)}
                    onLongPress={() => confirmDeleteItem(item.id)}
                    delayLongPress={350}
                    style={{
                      borderTopWidth: 1,
                      borderTopColor: LB.hairline,
                      padding: 14,
                      backgroundColor: revealed ? '#F7F4FF' : 'transparent',
                    }}
                  >
                    {revealed ? (
                      <Text style={{ fontSize: 14, color: LB.ink, lineHeight: 20 }}>
                        {item.expected_answer}
                      </Text>
                    ) : (
                      <Text style={{ fontSize: 12, color: LB.ink3, fontStyle: 'italic' }}>
                        {tCommon('material.reveal')}
                      </Text>
                    )}
                  </Pressable>
                </Pressable>
              );
            })}
          </View>
        )}
      </ScrollView>

      <View
        style={{
          paddingHorizontal: 20,
          paddingTop: 12,
          paddingBottom: Math.max(insets.bottom, 12),
          gap: 8,
          backgroundColor: LB.paper,
          borderTopColor: LB.hairline,
          borderTopWidth: 1,
        }}
      >
        {items.length > 0 && (
          <Btn size="lg" full onPress={practise}>
            {tCommon('material.practice')}
          </Btn>
        )}
        <Btn size="md" full variant="ghost" onPress={() => router.replace('/(learner)/home')}>
          {tCommon('actions.done')}
        </Btn>
      </View>

      <PhotoViewerModal
        visible={viewerIndex !== null}
        photoUrls={photoUrls}
        initialIndex={viewerIndex ?? 0}
        onClose={() => setViewerIndex(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  photoStrip: {
    gap: 10,
    paddingVertical: 4,
  },
  photoThumb: {
    width: 88,
    height: 116,
    borderRadius: 10,
    backgroundColor: LB.bg,
  },
  failedBanner: {
    backgroundColor: 'rgba(177,73,60,0.06)',
    borderColor: 'rgba(177,73,60,0.4)',
    borderWidth: 1,
    borderRadius: 14,
    padding: 16,
    gap: 8,
  },
  failedTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: LB.danger,
  },
  failedBody: {
    fontSize: 13,
    color: LB.ink2,
    lineHeight: 18,
    marginBottom: 4,
  },
  pendingBanner: {
    backgroundColor: LB.bg,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  pendingText: {
    fontSize: 14,
    color: LB.ink2,
    fontWeight: '500',
  },
});
