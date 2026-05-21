// Lernziel-Detail screen.
//
// One Lernziel = one folder. Anatomy:
//   1. Title block: name + optional date chip + counts
//   2. Big black-pill "Mit Tutor üben" CTA (the primary action)
//   3. Inline card list (all items across the folder's materials)
//      with reveal pattern — for "I just want to look it up"
//   4. Quellen sub-section at the bottom: collapsed material list, so
//      the learner can verify what fed this Lernziel and retry/delete
//      individual uploads
//   5. ⋯ menu: rename, change date, delete (cards keep, only grouping
//      goes), add material
//
// The Lernziel is the user-curated unit. Cards belong to it via the
// materials inside; the auto-derived `items.topic` field exists in DB
// but is NEVER shown — only goals the learner created are surfaced.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  Btn,
  CircleBtn,
  EmptyState,
  FolderEditorModal,
  Icon,
  LoadingState,
} from '../../../components/lb/index.js';
import { getAccount } from '../../../lib/api/account.js';
import { archiveFolder, getFolderDetail, type FolderMaterial } from '../../../lib/api/folders.js';
import { archiveItem } from '../../../lib/api/items.js';
import { useNavigateUp } from '../../../lib/navigation/hierarchy.js';
import { LB } from '../../../lib/theme/colors.js';

function daysUntil(scheduled: string | null, now = new Date()): number | null {
  if (!scheduled) return null;
  const target = new Date(`${scheduled}T00:00:00Z`).getTime();
  if (Number.isNaN(target)) return null;
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.round((target - today) / 86_400_000);
}

export default function LernzielDetailScreen() {
  const params = useLocalSearchParams<{ folderId?: string; subjectId?: string }>();
  const folderId = params.folderId ?? '';
  const subjectId = params.subjectId ?? '';
  const { t } = useTranslation('home');
  const navigateUp = useNavigateUp();
  const insets = useSafeAreaInsets();

  const accountQuery = useQuery({ queryKey: ['account'], queryFn: getAccount });
  const learnerId = accountQuery.data?.learner?.id ?? null;

  const detailQuery = useQuery({
    queryKey: ['folder-detail', folderId],
    queryFn: () => getFolderDetail(folderId),
    enabled: !!folderId,
  });

  const [revealedIds, setRevealedIds] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState(false);
  function toggleReveal(id: string) {
    setRevealedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const qc = useQueryClient();
  const deleteMut = useMutation({
    mutationFn: () => archiveFolder(folderId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['folders', subjectId] });
      qc.invalidateQueries({ queryKey: ['materials', 'subject', subjectId] });
      navigateUp();
    },
    onError: (err: Error) => Alert.alert(t('lernziel.delete'), err.message),
  });

  const deleteItemMut = useMutation({
    mutationFn: (itemId: string) => {
      if (!learnerId) throw new Error('missing learner');
      return archiveItem(learnerId, itemId);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['folder-detail', folderId] });
      qc.invalidateQueries({ queryKey: ['folders', subjectId] });
    },
    onError: () =>
      Alert.alert(
        t('material.detail.card_delete_failed_title'),
        t('material.detail.card_delete_failed_body'),
      ),
  });

  function confirmDeleteItem(itemId: string) {
    Alert.alert(t('material.detail.card_delete_title'), t('material.detail.card_delete_body'), [
      { text: t('lernziel.cancel'), style: 'cancel' },
      {
        text: t('material.detail.card_delete_cta'),
        style: 'destructive',
        onPress: () => deleteItemMut.mutate(itemId),
      },
    ]);
  }

  const startSession = () => {
    if (!learnerId) return;
    router.push({
      pathname: '/(learner)/chat/[sessionId]',
      params: { sessionId: 'new', subjectId, folderId },
    });
  };

  const openMenu = () => {
    Alert.alert(detailQuery.data?.name ?? '', undefined, [
      { text: t('lernziel.cancel'), style: 'cancel' },
      { text: t('lernziel.rename_title'), onPress: () => setEditing(true) },
      {
        text: t('lernziel.delete'),
        style: 'destructive',
        onPress: () => {
          Alert.alert(t('lernziel.delete_confirm_title'), t('lernziel.delete_confirm_body'), [
            { text: t('lernziel.cancel'), style: 'cancel' },
            {
              text: t('lernziel.delete'),
              style: 'destructive',
              onPress: () => deleteMut.mutate(),
            },
          ]);
        },
      },
    ]);
  };

  if (accountQuery.isLoading || detailQuery.isLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: LB.paper }}>
        <LoadingState />
      </View>
    );
  }
  if (detailQuery.isError || !detailQuery.data) {
    return (
      <View style={{ flex: 1, backgroundColor: LB.paper }}>
        <View style={{ padding: 22 }}>
          <CircleBtn icon="back" onPress={navigateUp} />
          <EmptyState
            glyph="🤔"
            title={t('folder.not_found_title')}
            body={t('folder.not_found_body')}
          />
        </View>
      </View>
    );
  }

  const folder = detailQuery.data;
  const items = folder.items;
  const materials = folder.materials;
  const days = daysUntil(folder.scheduled_for);
  const dateLabel =
    days == null
      ? null
      : days === 0
        ? t('test_today')
        : days > 0
          ? t('test_in_days', { count: days })
          : null;

  return (
    <View style={{ flex: 1, backgroundColor: LB.paper }}>
      <View style={styles.headerRow}>
        <CircleBtn icon="back" onPress={navigateUp} />
        <CircleBtn icon="more" onPress={openMenu} />
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingHorizontal: 22,
          paddingTop: 4,
          paddingBottom: insets.bottom + 32,
          gap: 10,
        }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={detailQuery.isFetching && !detailQuery.isLoading}
            onRefresh={() => void detailQuery.refetch()}
            tintColor={LB.ink2}
          />
        }
      >
        <View style={styles.titleBlock}>
          <Text style={styles.title}>{folder.name}</Text>
          <View style={styles.metaLine}>
            <Text style={styles.subtitle}>
              {t('material.item_count', { count: items.length })}
              {materials.length > 0
                ? ` · ${materials.length} ${materials.length === 1 ? 'Material' : 'Materialien'}`
                : ''}
            </Text>
            {dateLabel && (
              <View style={styles.dateChip}>
                <Text style={styles.dateChipText}>{dateLabel}</Text>
              </View>
            )}
          </View>
        </View>

        {items.length > 0 && (
          <View style={{ marginBottom: 12 }}>
            <Btn full size="lg" onPress={startSession}>
              {t('material.detail.practice_cta', { count: items.length })}
            </Btn>
          </View>
        )}

        {items.length === 0 && materials.length === 0 ? (
          <View style={{ paddingVertical: 28 }}>
            <EmptyState
              glyph="📷"
              title={t('material.detail.no_cards')}
              body={t('folder.no_material_body')}
            />
            <View style={{ height: 12 }} />
            <Btn
              full
              size="md"
              onPress={() =>
                router.push({
                  pathname: '/(learner)/capture',
                  params: { subjectId, folderId },
                })
              }
            >
              {t('lernziel.add_material')}
            </Btn>
          </View>
        ) : (
          <>
            <Text style={styles.sectionLabel}>{t('material.detail.section_cards')}</Text>
            {items.length === 0 ? (
              <Text style={styles.emptyHint}>{t('material.detail.no_cards')}</Text>
            ) : (
              <View style={styles.cardList}>
                {items.map((item, idx) => {
                  const revealed = revealedIds.has(item.id);
                  return (
                    <Pressable
                      key={item.id}
                      onPress={() => toggleReveal(item.id)}
                      onLongPress={() => confirmDeleteItem(item.id)}
                      delayLongPress={350}
                      accessibilityHint={t('material.detail.card_long_press_hint')}
                      style={({ pressed }) => [pressed && { opacity: 0.95 }]}
                    >
                      <View style={[styles.cardRow, idx !== 0 && styles.cardRowDivider]}>
                        <Text style={styles.cardIndex}>{`${idx + 1}`.padStart(2, '0')}</Text>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.cardQuestion}>{item.question}</Text>
                          <Text
                            style={[styles.cardAnswer, !revealed && styles.cardAnswerHidden]}
                            numberOfLines={revealed ? undefined : 1}
                          >
                            {revealed ? item.expected_answer : t('material.detail.reveal_hint')}
                          </Text>
                        </View>
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            )}

            <SourcesSection
              materials={materials}
              subjectId={subjectId}
              folderId={folderId}
              onAddMaterial={() =>
                router.push({
                  pathname: '/(learner)/capture',
                  params: { subjectId, folderId },
                })
              }
            />
          </>
        )}
      </ScrollView>

      <FolderEditorModal
        visible={editing}
        subjectId={subjectId}
        initial={folder}
        onClose={() => setEditing(false)}
      />
    </View>
  );
}

function SourcesSection({
  materials,
  subjectId,
  folderId,
  onAddMaterial,
}: {
  materials: FolderMaterial[];
  subjectId: string;
  folderId: string;
  onAddMaterial: () => void;
}) {
  const { t } = useTranslation('home');
  const [expanded, setExpanded] = useState(false);
  return (
    <View style={styles.sourcesWrap}>
      <Pressable onPress={() => setExpanded((v) => !v)}>
        <View style={styles.sourcesHeader}>
          <Text style={styles.sourcesLabel}>
            {t('material.detail.sources_title')} · {materials.length}
          </Text>
          <Icon name={expanded ? 'chevron' : 'chevron'} size={18} color={LB.ink3} />
        </View>
      </Pressable>
      {expanded && (
        <View style={styles.sourcesList}>
          {materials.map((m, idx) => (
            <Pressable
              key={m.id}
              onPress={() =>
                router.push({
                  pathname: '/(learner)/material/[materialId]',
                  params: { materialId: m.id, subjectId, folderId },
                })
              }
              style={({ pressed }) => [pressed && { opacity: 0.85 }]}
            >
              <View style={[styles.sourceRow, idx !== 0 && styles.sourceRowDivider]}>
                <Icon name="camera" size={16} color={LB.ink3} />
                <Text style={styles.sourceTitle} numberOfLines={1}>
                  {m.title ?? `Material ${idx + 1}`}
                </Text>
                {m.extraction_status !== 'ready' && (
                  <Text style={styles.sourceStatus}>
                    {m.extraction_status === 'failed' ? t('material.status.failed') : '…'}
                  </Text>
                )}
                <Icon name="chevron" size={16} color={LB.ink3} />
              </View>
            </Pressable>
          ))}
          <View style={{ padding: 10 }}>
            <Btn full size="sm" variant="outline" onPress={onAddMaterial}>
              {`+ ${t('lernziel.add_material')}`}
            </Btn>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingTop: 6,
    paddingBottom: 4,
  },

  titleBlock: { gap: 6, marginTop: 4, marginBottom: 18 },
  title: {
    fontSize: 34,
    lineHeight: 38,
    fontWeight: '700',
    fontStyle: 'italic',
    color: LB.ink,
    letterSpacing: -0.8,
  },
  metaLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flexWrap: 'wrap',
  },
  subtitle: { fontSize: 13, color: LB.ink2, fontWeight: '500' },
  dateChip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    backgroundColor: 'rgba(177,73,60,0.08)',
  },
  dateChipText: { fontSize: 11, color: LB.primary, fontWeight: '600' },

  sectionLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: LB.ink3,
    marginTop: 22,
    marginBottom: 10,
    paddingHorizontal: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  emptyHint: {
    fontSize: 13,
    color: LB.ink3,
    paddingHorizontal: 4,
    fontStyle: 'italic',
  },

  cardList: {
    backgroundColor: '#fff',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: LB.hairline,
    overflow: 'hidden',
  },
  cardRow: {
    flexDirection: 'row',
    gap: 14,
    paddingHorizontal: 18,
    paddingVertical: 14,
  },
  cardRowDivider: {
    borderTopWidth: 1,
    borderTopColor: LB.hairline,
  },
  cardIndex: {
    fontSize: 11,
    fontWeight: '700',
    color: LB.ink3,
    letterSpacing: 1.0,
    width: 22,
    marginTop: 3,
  },
  cardQuestion: {
    fontSize: 15,
    lineHeight: 21,
    color: LB.ink,
  },
  cardAnswer: {
    fontSize: 13,
    lineHeight: 19,
    color: LB.ink2,
    marginTop: 6,
  },
  cardAnswerHidden: {
    color: LB.ink3,
    fontStyle: 'italic',
  },

  sourcesWrap: {
    marginTop: 24,
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: LB.hairline,
    overflow: 'hidden',
  },
  sourcesHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  sourcesLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: LB.ink2,
    letterSpacing: 0.4,
  },
  sourcesList: {
    borderTopWidth: 1,
    borderTopColor: LB.hairline,
  },
  sourceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  sourceRowDivider: {
    borderTopWidth: 1,
    borderTopColor: LB.hairline,
  },
  sourceTitle: {
    flex: 1,
    fontSize: 14,
    color: LB.ink,
    fontWeight: '500',
  },
  sourceStatus: {
    fontSize: 11,
    color: LB.ink3,
  },
});
