// Subject — tabs Ordner | Material, floating Üben/Neu actions.
// Doc 05 §subject. No pending-item counts; folder chips only when scheduled
// within 7 days (server-computed in /subjects + /schedule-summary).
//
// Materials backend lands in Phase C — until then the Material tab renders
// the empty state, not demo rows, per CLAUDE.md hard rule #6 ("never ship
// a screen with useState('hardcoded') as its primary content").

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  Btn,
  Card,
  Chip,
  CircleBtn,
  EmptyState,
  FolderEditorModal,
  Icon,
  SubjectGlyph,
} from '../../../components/lb/index.js';
import { getAccount } from '../../../lib/api/account.js';
import { listFolders } from '../../../lib/api/folders.js';
import {
  deleteMaterial,
  listMaterials,
  type MaterialListItem,
} from '../../../lib/api/materials.js';
import { archiveSubject, listSubjects } from '../../../lib/api/subjects.js';
import { LB } from '../../../lib/theme/colors.js';
import type { Folder } from '@learnbuddy/shared-types';

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

type Tab = 'ordner' | 'material';

function daysUntil(scheduled: string | null, now = new Date()): number | null {
  if (!scheduled) return null;
  const target = new Date(`${scheduled}T00:00:00Z`).getTime();
  if (Number.isNaN(target)) return null;
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const diff = Math.round((target - today) / 86_400_000);
  return diff >= 0 && diff <= 7 ? diff : null;
}

export default function SubjectScreen() {
  const { t } = useTranslation('home');
  const { subjectId } = useLocalSearchParams<{ subjectId: string }>();
  const [tab, setTab] = useState<Tab>('ordner');
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [editingFolder, setEditingFolder] = useState<Folder | null>(null);

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

  const materialsQuery = useQuery({
    queryKey: ['materials', 'subject', subjectId],
    queryFn: () => listMaterials(learnerId as string, { subjectId }),
    enabled: !!learnerId && tab === 'material',
  });
  const materials = materialsQuery.data ?? [];

  const qc = useQueryClient();

  const handleDeleteMaterial = (m: MaterialListItem) => {
    Alert.alert(t('material.delete_title'), t('material.delete_body'), [
      { text: t('subject.cancel'), style: 'cancel' },
      {
        text: t('common:actions.delete') ?? 'Löschen',
        style: 'destructive',
        onPress: () => {
          void deleteMaterial(learnerId as string, m.id).then(() => {
            qc.invalidateQueries({ queryKey: ['materials', 'subject', subjectId] });
          });
        },
      },
    ]);
  };

  const archiveSubjectMut = useMutation({
    mutationFn: () => archiveSubject(subjectId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['subjects', learnerId] });
      router.back();
    },
  });

  const openSubjectMenu = () => {
    Alert.alert(subject?.name ?? '', undefined, [
      { text: t('subject.cancel'), style: 'cancel' },
      { text: t('subject.add_folder_menu'), onPress: () => setCreatingFolder(true) },
      {
        text: t('subject.archive'),
        style: 'destructive',
        onPress: () => archiveSubjectMut.mutate(),
      },
    ]);
  };

  if (accountQuery.isLoading || subjectsQuery.isLoading) {
    return (
      <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: LB.paper }}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={LB.ink2} />
        </View>
      </SafeAreaView>
    );
  }
  if (!subject) {
    return (
      <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: LB.paper }}>
        <View style={{ padding: 22 }}>
          <CircleBtn icon="back" onPress={() => router.back()} />
          <EmptyState
            glyph="🤔"
            title={t('subject.not_found_title')}
            body={t('subject.not_found_body')}
          />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: LB.paper }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: 20,
          paddingVertical: 12,
        }}
      >
        <CircleBtn icon="back" onPress={() => router.back()} />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <SubjectGlyph
            glyph={subject?.subject_kind ? glyphForKind(subject.subject_kind) : '📚'}
            size={24}
          />
          <Text style={{ fontSize: 14, fontWeight: '600', color: LB.ink }}>{subject.name}</Text>
        </View>
        <CircleBtn icon="more" onPress={openSubjectMenu} />
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 120 }}>
        <Text style={{ fontSize: 24, fontWeight: '600', color: LB.ink, letterSpacing: -0.5 }}>
          {subject.name}
        </Text>
        <Text style={{ fontSize: 12, color: LB.ink2, marginTop: 2 }}>
          {t('subject.material_count', { count: subject.material_count })}
        </Text>

        <View
          style={{
            flexDirection: 'row',
            gap: 4,
            padding: 4,
            backgroundColor: '#fff',
            borderColor: LB.hairline,
            borderWidth: 1,
            borderRadius: 12,
            marginVertical: 14,
            alignSelf: 'flex-start',
          }}
        >
          <TabBtn
            label={t('subject.tab_folders')}
            count={folders.length}
            active={tab === 'ordner'}
            onPress={() => setTab('ordner')}
          />
          <TabBtn
            label={t('subject.tab_materials')}
            count={subject.material_count}
            active={tab === 'material'}
            onPress={() => setTab('material')}
          />
        </View>

        {tab === 'ordner' ? (
          folders.length === 0 ? (
            <EmptyState
              glyph="🗂️"
              title={t('subject.no_folders_title')}
              body={t('subject.no_folders_body')}
            />
          ) : (
            <View style={{ gap: 8 }}>
              {folders.map((f) => (
                <FolderCard
                  key={f.id}
                  folder={f}
                  onPress={() =>
                    router.push({
                      pathname: '/(learner)/folder/[folderId]',
                      params: { folderId: f.id, subjectId },
                    })
                  }
                  onLongPress={() => setEditingFolder(f)}
                />
              ))}
            </View>
          )
        ) : materialsQuery.isLoading ? (
          <ActivityIndicator color={LB.ink2} style={{ marginTop: 16 }} />
        ) : materials.length === 0 ? (
          <EmptyState
            glyph="📷"
            title={t('subject.no_materials_title')}
            body={t('subject.no_materials_body')}
          />
        ) : (
          <View style={{ gap: 8 }}>
            {materials.map((m) => (
              <MaterialRow
                key={m.id}
                material={m}
                onPress={() =>
                  router.push({
                    pathname: '/(learner)/material/[materialId]',
                    params: { materialId: m.id },
                  })
                }
                onDelete={() => handleDeleteMaterial(m)}
              />
            ))}
          </View>
        )}
      </ScrollView>

      <View
        style={{
          position: 'absolute',
          left: 20,
          right: 20,
          bottom: 12,
          flexDirection: 'row',
          gap: 8,
        }}
      >
        <View style={{ flex: 1 }}>
          <Btn
            size="lg"
            full
            variant="outline"
            onPress={() => router.push({ pathname: '/(learner)/capture', params: { subjectId } })}
          >
            {t('subject.new_material')}
          </Btn>
        </View>
        <View style={{ flex: 2 }}>
          <Btn
            size="lg"
            full
            onPress={() =>
              subject.material_count > 0 &&
              router.push({ pathname: '/(learner)/practice', params: { subjectId } } as never)
            }
            disabled={subject.material_count === 0}
          >
            {t('subject.start_practice')}
          </Btn>
        </View>
      </View>

      <FolderEditorModal
        visible={creatingFolder}
        subjectId={subjectId}
        initial={null}
        onClose={() => setCreatingFolder(false)}
      />
      <FolderEditorModal
        visible={!!editingFolder}
        subjectId={subjectId}
        initial={editingFolder}
        onClose={() => setEditingFolder(null)}
      />
    </SafeAreaView>
  );
}

function TabBtn({
  label,
  count,
  active,
  onPress,
}: {
  label: string;
  count: number;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress}>
      <View
        style={{
          paddingHorizontal: 14,
          paddingVertical: 6,
          borderRadius: 8,
          backgroundColor: active ? LB.primary : 'transparent',
          flexDirection: 'row',
          alignItems: 'center',
          gap: 5,
        }}
      >
        <Text style={{ fontSize: 12, fontWeight: '600', color: active ? '#fff' : LB.ink2 }}>
          {label}
        </Text>
        <Text
          style={{
            fontSize: 12,
            fontWeight: '500',
            color: active ? '#fff' : LB.ink2,
            opacity: 0.7,
          }}
        >
          {count}
        </Text>
      </View>
    </Pressable>
  );
}

function MaterialRow({
  material,
  onPress,
  onDelete,
}: {
  material: MaterialListItem;
  onPress: () => void;
  onDelete: () => void;
}) {
  const { t } = useTranslation('home');
  const isReady = material.extraction_status === 'ready';
  const isFailed = material.extraction_status === 'failed';

  return (
    <Pressable
      onPress={isReady ? onPress : undefined}
      onLongPress={isFailed ? onDelete : undefined}
      delayLongPress={400}
      style={{
        padding: 12,
        borderRadius: 12,
        backgroundColor: isFailed ? 'rgba(177,73,60,0.06)' : '#fff',
        borderColor: isFailed ? LB.danger : LB.hairline,
        borderWidth: 1,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
      }}
    >
      <Icon name="camera" size={18} color={isFailed ? LB.danger : LB.ink3} />
      <View style={{ flex: 1 }}>
        <Text
          style={{ fontSize: 14, fontWeight: '500', color: isFailed ? LB.danger : LB.ink }}
          numberOfLines={1}
        >
          {material.title ?? 'Material'}
        </Text>
        {isFailed ? (
          <Text style={{ fontSize: 11, color: LB.danger, marginTop: 1 }}>
            {t('material.failed_hint')}
          </Text>
        ) : !isReady ? (
          <Text style={{ fontSize: 11, color: LB.ink3, marginTop: 1 }}>
            {t('material.processing')}
          </Text>
        ) : material.page_count != null ? (
          <Text style={{ fontSize: 11, color: LB.ink3, marginTop: 1 }}>
            {t('material.page_count', { count: material.page_count })}
          </Text>
        ) : null}
      </View>
      {!isReady && !isFailed && <ActivityIndicator size="small" color={LB.ink3} />}
      {isFailed && <Text style={{ fontSize: 16, color: LB.danger }}>⚠</Text>}
    </Pressable>
  );
}

function FolderCard({
  folder,
  onPress,
  onLongPress,
}: {
  folder: Folder;
  onPress: () => void;
  onLongPress: () => void;
}) {
  const { t } = useTranslation('home');
  const inDays = daysUntil(folder.scheduled_for);
  return (
    <Pressable onPress={onPress} onLongPress={onLongPress} delayLongPress={350}>
      <Card padding={14}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
          <View style={{ flexDirection: 'row', gap: 10, flex: 1 }}>
            <Icon name="folder" size={20} color={inDays != null ? LB.primary : LB.ink3} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 14, fontWeight: '600', color: LB.ink }}>{folder.name}</Text>
              {folder.scheduled_for && (
                <Text style={{ fontSize: 11, color: LB.ink2, marginTop: 1 }}>
                  {`${folder.scheduled_for}`}
                </Text>
              )}
            </View>
          </View>
          {inDays != null && (
            <Chip tone="warning">{t('folder.test_in_days', { count: inDays })}</Chip>
          )}
        </View>
      </Card>
    </Pressable>
  );
}
