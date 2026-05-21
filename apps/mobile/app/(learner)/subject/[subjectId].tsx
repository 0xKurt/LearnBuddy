// Subject screen — Lernziele the learner created.
//
// Mental model: the learner is studying FOR something — a Klassenarbeit,
// a Vokabeltest, a weekly homework. Each one is a Lernziel she creates
// and fills herself. The app organises her work around those goals, NOT
// around AI-derived auto-topics (which we tried; it was chaos).
//
// What lives here:
//   1. A clean list of Lernziele in this subject (name, count, optional
//      date chip). Tap to open the Lernziel-Detail.
//   2. Schnellrunde — mixed subject-wide practice, FSRS-aware.
//   3. "Lose Karten" row when there are materials without a Lernziel.
//   4. + Material CTA at the bottom.
//   5. Failed-materials sub-section so retry is reachable.
//
// What is NOT here: auto-topics, pastel-rainbow tiles, hidden controls.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';

import {
  Btn,
  CircleBtn,
  EmptyState,
  FolderEditorModal,
  Icon,
  LoadingState,
  SubjectGlyph,
} from '../../../components/lb/index.js';
import { getAccount } from '../../../lib/api/account.js';
import { listFolders, type FolderListItem } from '../../../lib/api/folders.js';
import { useNavigateUp } from '../../../lib/navigation/hierarchy.js';
import { listMaterials, type MaterialListItem } from '../../../lib/api/materials.js';
import { archiveSubject, listSubjects } from '../../../lib/api/subjects.js';
import { LB } from '../../../lib/theme/colors.js';

const GLYPH_FOR_KIND: Record<string, string> = {
  math: '📐',
  physics: '⚛️',
  chemistry: '🧪',
  biology: '🌱',
  geography: '🌍',
  history: '🏛️',
  language_native: '✍️',
  language_foreign: '🗣️',
  religion_ethics: '✝️',
  art_music: '🎨',
  general: '📖',
  other: '📚',
};
function glyphForKind(kind: string): string {
  return GLYPH_FOR_KIND[kind] ?? '✨';
}

function daysUntil(scheduled: string | null, now = new Date()): number | null {
  if (!scheduled) return null;
  const target = new Date(`${scheduled}T00:00:00Z`).getTime();
  if (Number.isNaN(target)) return null;
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.round((target - today) / 86_400_000);
}

export default function SubjectScreen() {
  const { t } = useTranslation('home');
  const navigateUp = useNavigateUp();
  const { subjectId } = useLocalSearchParams<{ subjectId: string }>();
  const [creatingFolder, setCreatingFolder] = useState(false);

  const accountQuery = useQuery({ queryKey: ['account'], queryFn: getAccount });
  const learnerId = accountQuery.data?.learner?.id;

  const subjectsQuery = useQuery({
    queryKey: ['subjects', learnerId],
    queryFn: () => listSubjects(learnerId as string),
    enabled: !!learnerId,
  });
  const subject = useMemo(
    () => subjectsQuery.data?.find((s) => s.id === subjectId),
    [subjectsQuery.data, subjectId],
  );

  const foldersQuery = useQuery({
    queryKey: ['folders', subjectId],
    queryFn: () => listFolders(subjectId),
    enabled: !!subjectId,
  });
  const folders = foldersQuery.data ?? [];

  // Materials are still queried because we need to surface "Lose Karten"
  // (materials with folder_id = null) AND failed materials. The Lernziel
  // counts themselves come from the enriched folders endpoint.
  const materialsQuery = useQuery({
    queryKey: ['materials', 'subject', subjectId],
    queryFn: () => listMaterials(learnerId as string, { subjectId }),
    enabled: !!learnerId && !!subjectId,
    refetchInterval: (query) => {
      const data = query.state.data as MaterialListItem[] | undefined;
      const anyPending = data?.some(
        (m) => m.extraction_status !== 'ready' && m.extraction_status !== 'failed',
      );
      return anyPending ? 4000 : false;
    },
  });
  const materials = materialsQuery.data ?? [];
  const looseMaterials = useMemo(
    () => materials.filter((m) => !m.folder_id && m.extraction_status === 'ready'),
    [materials],
  );
  const looseCardCount = looseMaterials.reduce((sum, m) => sum + (m.item_count ?? 0), 0);
  const pendingCount = useMemo(
    () =>
      materials.filter((m) => m.extraction_status !== 'ready' && m.extraction_status !== 'failed')
        .length,
    [materials],
  );
  const failedMaterials = useMemo(
    () => materials.filter((m) => m.extraction_status === 'failed'),
    [materials],
  );

  const qc = useQueryClient();
  const statusKey = materials.map((m) => m.extraction_status).join(',');
  useEffect(() => {
    if (!materialsQuery.isFetching) {
      void qc.invalidateQueries({ queryKey: ['folders', subjectId] });
    }
  }, [statusKey, materialsQuery.isFetching, qc, subjectId]);

  const archiveSubjectMut = useMutation({
    mutationFn: () => archiveSubject(subjectId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['subjects', learnerId] });
      navigateUp();
    },
  });

  const openSubjectMenu = () => {
    Alert.alert(subject?.name ?? '', undefined, [
      { text: t('subject.cancel'), style: 'cancel' },
      {
        text: t('subject.add_folder_menu'),
        onPress: () => setCreatingFolder(true),
      },
      {
        text: t('subject.archive'),
        style: 'destructive',
        onPress: () => archiveSubjectMut.mutate(),
      },
    ]);
  };

  const startQuickRound = () => {
    if (!learnerId) return;
    router.push({
      pathname: '/(learner)/chat/[sessionId]',
      params: { sessionId: 'new', subjectId },
    });
  };

  const openFolder = (folderId: string) => {
    router.push({
      pathname: '/(learner)/folder/[folderId]',
      params: { folderId, subjectId },
    });
  };

  const openLooseRow = () => {
    // "Lose Karten" → an unscoped tutor session that uses only materials
    // without a folder. We achieve this by passing a special routing
    // param; the chat screen treats `looseInSubject: 'true'` as
    // "subject scope minus folder-scoped items".
    if (!learnerId) return;
    router.push({
      pathname: '/(learner)/chat/[sessionId]',
      params: { sessionId: 'new', subjectId, looseInSubject: 'true' },
    });
  };

  if (accountQuery.isLoading || subjectsQuery.isLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: LB.paper }}>
        <LoadingState />
      </View>
    );
  }
  if (!subject) {
    return (
      <View style={{ flex: 1, backgroundColor: LB.paper }}>
        <View style={{ padding: 22 }}>
          <CircleBtn icon="back" onPress={navigateUp} />
          <EmptyState
            glyph="🤔"
            title={t('subject.not_found_title')}
            body={t('subject.not_found_body')}
          />
        </View>
      </View>
    );
  }

  const totalCards = folders.reduce((sum, f) => sum + f.item_count, 0) + looseCardCount;
  const hasContent = folders.length > 0 || looseMaterials.length > 0;

  return (
    <View style={{ flex: 1, backgroundColor: LB.paper }}>
      <View style={styles.headerRow}>
        <CircleBtn icon="back" onPress={navigateUp} />
        <CircleBtn icon="more" onPress={openSubjectMenu} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={foldersQuery.isRefetching && !foldersQuery.isLoading}
            onRefresh={() => {
              void foldersQuery.refetch();
              void materialsQuery.refetch();
            }}
            tintColor={LB.ink3}
          />
        }
      >
        <View style={styles.titleBlock}>
          <View style={styles.glyphRow}>
            <SubjectGlyph
              glyph={subject.subject_kind ? glyphForKind(subject.subject_kind) : '📚'}
              size={28}
            />
          </View>
          <Text style={styles.title}>{subject.name}</Text>
          <Text style={styles.subtitle}>
            {totalCards > 0
              ? `${t('material.item_count', { count: totalCards })} · ${folders.length} ${folders.length === 1 ? t('lernziel.singular') : t('lernziel.plural')}`
              : t('subject.no_materials_title')}
          </Text>
        </View>

        {pendingCount > 0 && (
          <View style={styles.pendingBanner}>
            <ActivityIndicator size="small" color={LB.primary} />
            <Text style={styles.pendingText}>
              {t('material.pending_banner', { count: pendingCount })}
            </Text>
          </View>
        )}

        {foldersQuery.isLoading ? (
          <ActivityIndicator color={LB.ink2} style={{ marginTop: 32 }} />
        ) : hasContent ? (
          <>
            {/* Hero coloured anchor — one Schnellrunde card on lavender. */}
            <QuickRoundHero
              label={t('material.detail.quick_round')}
              hint={t('material.detail.quick_round_hint')}
              cardCount={totalCards}
              onPress={startQuickRound}
            />

            <Text style={styles.sectionLabel}>{t('lernziel.section_label')}</Text>

            <View style={styles.list}>
              {folders.map((folder, idx) => (
                <FolderRow
                  key={folder.id}
                  folder={folder}
                  isFirst={idx === 0}
                  onPress={() => openFolder(folder.id)}
                />
              ))}
              {looseMaterials.length > 0 && (
                <LooseRow
                  count={looseCardCount}
                  isFirst={folders.length === 0}
                  onPress={openLooseRow}
                />
              )}
            </View>
          </>
        ) : failedMaterials.length === 0 ? (
          <View style={{ paddingVertical: 36 }}>
            <EmptyState
              glyph="📷"
              title={t('lernziel.empty_title')}
              body={t('lernziel.empty_body')}
            />
          </View>
        ) : null}

        {failedMaterials.length > 0 && (
          <>
            <Text style={[styles.sectionLabel, styles.sectionLabelDanger]}>
              {t('material.detail.needs_attention_section')}
            </Text>
            <View style={styles.list}>
              {failedMaterials.map((m, idx) => (
                <FailedMaterialRow
                  key={m.id}
                  material={m}
                  isFirst={idx === 0}
                  onPress={() =>
                    router.push({
                      pathname: '/(learner)/material/[materialId]',
                      params: { materialId: m.id, subjectId },
                    })
                  }
                />
              ))}
            </View>
          </>
        )}
      </ScrollView>

      <View style={styles.footerBar}>
        <Btn
          full
          size="lg"
          variant="outline"
          onPress={() => router.push({ pathname: '/(learner)/capture', params: { subjectId } })}
        >
          {`+ ${t('subject.new_material')}`}
        </Btn>
      </View>

      <FolderEditorModal
        visible={creatingFolder}
        subjectId={subjectId}
        initial={null}
        onClose={() => setCreatingFolder(false)}
      />
    </View>
  );
}

function QuickRoundHero({
  label,
  hint,
  cardCount,
  onPress,
}: {
  label: string;
  hint: string;
  cardCount: number;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [{ opacity: pressed ? 0.94 : 1 }]}>
      <View style={styles.heroCard}>
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={styles.heroTitle}>{label}</Text>
          <Text style={styles.heroHint}>
            {hint} · {cardCount}
          </Text>
        </View>
        <Icon name="practice" size={24} color={LB.primary} />
      </View>
    </Pressable>
  );
}

function FolderRow({
  folder,
  isFirst,
  onPress,
}: {
  folder: FolderListItem;
  isFirst: boolean;
  onPress: () => void;
}) {
  const { t } = useTranslation('home');
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
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={folder.name}
      style={({ pressed }) => [pressed && { opacity: 0.85 }]}
    >
      <View style={[styles.row, !isFirst && styles.rowDivider]}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={styles.rowTitle} numberOfLines={1}>
            {folder.name}
          </Text>
          <View style={styles.rowMetaLine}>
            <Text style={styles.rowMeta}>
              {t('material.item_count', { count: folder.item_count })}
            </Text>
            {dateLabel && (
              <View style={styles.dateChip}>
                <Text style={styles.dateChipText}>{dateLabel}</Text>
              </View>
            )}
            {folder.has_pending && (
              <View style={styles.pendingPin}>
                <ActivityIndicator size="small" color={LB.primary} />
              </View>
            )}
          </View>
        </View>
        <Icon name="chevron" size={20} color={LB.ink3} />
      </View>
    </Pressable>
  );
}

function LooseRow({
  count,
  isFirst,
  onPress,
}: {
  count: number;
  isFirst: boolean;
  onPress: () => void;
}) {
  const { t } = useTranslation('home');
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [pressed && { opacity: 0.85 }]}>
      <View style={[styles.row, !isFirst && styles.rowDivider]}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={styles.rowTitle}>{t('lernziel.loose_title')}</Text>
          <Text style={styles.rowMeta}>{t('material.item_count', { count })}</Text>
        </View>
        <Icon name="chevron" size={20} color={LB.ink3} />
      </View>
    </Pressable>
  );
}

function FailedMaterialRow({
  material,
  isFirst,
  onPress,
}: {
  material: MaterialListItem;
  isFirst: boolean;
  onPress: () => void;
}) {
  const { t } = useTranslation('home');
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [pressed && { opacity: 0.85 }]}>
      <View style={[styles.row, !isFirst && styles.rowDivider]}>
        <View style={styles.failedDot} />
        <View style={{ flex: 1, gap: 1 }}>
          <Text style={styles.rowTitle} numberOfLines={1}>
            {material.title ?? t('material.untitled')}
          </Text>
          <Text style={styles.rowMetaDanger}>{t('material.status.failed')}</Text>
        </View>
        <Icon name="chevron" size={20} color={LB.danger} />
      </View>
    </Pressable>
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
  scroll: {
    paddingHorizontal: 22,
    paddingBottom: 120,
  },

  titleBlock: { gap: 4, marginTop: 4, marginBottom: 24 },
  glyphRow: { marginBottom: 10 },
  title: {
    fontSize: 36,
    lineHeight: 40,
    fontWeight: '700',
    fontStyle: 'italic',
    color: LB.ink,
    letterSpacing: -1.0,
  },
  subtitle: { fontSize: 13, color: LB.ink2, fontWeight: '500', marginTop: 2 },

  pendingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 9,
    paddingHorizontal: 14,
    borderRadius: 999,
    backgroundColor: 'rgba(177,73,60,0.06)',
    marginBottom: 18,
    alignSelf: 'flex-start',
  },
  pendingText: { fontSize: 12, color: LB.ink2, fontWeight: '500' },

  heroCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: LB.lavender,
    borderRadius: 20,
    paddingHorizontal: 20,
    paddingVertical: 20,
  },
  heroTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: LB.ink,
    letterSpacing: -0.3,
  },
  heroHint: { fontSize: 12, color: LB.ink2, fontWeight: '500' },

  sectionLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: LB.ink3,
    marginTop: 28,
    marginBottom: 10,
    paddingHorizontal: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  sectionLabelDanger: { color: LB.danger },

  list: {
    backgroundColor: '#fff',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: LB.hairline,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 18,
    paddingVertical: 16,
  },
  rowDivider: {
    borderTopWidth: 1,
    borderTopColor: LB.hairline,
  },
  rowTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: LB.ink,
    letterSpacing: -0.2,
  },
  rowMetaLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  rowMeta: { fontSize: 12, color: LB.ink3, fontWeight: '500' },
  rowMetaDanger: { fontSize: 12, color: LB.danger, fontWeight: '500' },

  dateChip: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
    backgroundColor: 'rgba(177,73,60,0.08)',
  },
  dateChipText: {
    fontSize: 11,
    color: LB.primary,
    fontWeight: '600',
  },
  pendingPin: {
    width: 14,
    height: 14,
  },

  failedDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: LB.danger,
  },

  footerBar: {
    position: 'absolute',
    left: 22,
    right: 22,
    bottom: 14,
  },
});
