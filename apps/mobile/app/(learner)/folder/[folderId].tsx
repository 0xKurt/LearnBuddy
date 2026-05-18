// Folder — detail screen with name, date chip, material list, Üben button.
// Doc 05 §folder. Long-press → rename/archive sheet.

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  Btn,
  Chip,
  CircleBtn,
  EmptyState,
  FolderEditorModal,
  Icon,
} from '../../../components/lb/index.js';
import { getAccount } from '../../../lib/api/account.js';
import { newIdempotencyKey } from '../../../lib/api/client.js';
import { listFolders } from '../../../lib/api/folders.js';
import { useNavigateUp } from '../../../lib/navigation/hierarchy.js';
import {
  deleteMaterial,
  listMaterials,
  type MaterialListItem,
} from '../../../lib/api/materials.js';
import { LB } from '../../../lib/theme/colors.js';

function daysUntil(scheduled: string | null, now = new Date()): number | null {
  if (!scheduled) return null;
  const target = new Date(`${scheduled}T00:00:00Z`).getTime();
  if (Number.isNaN(target)) return null;
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const diff = Math.round((target - today) / 86_400_000);
  return diff >= 0 && diff <= 7 ? diff : null;
}

export default function FolderScreen() {
  const { t } = useTranslation('home');
  const navigateUp = useNavigateUp();
  const { folderId, subjectId } = useLocalSearchParams<{ folderId: string; subjectId: string }>();
  const [editing, setEditing] = useState(false);

  const accountQuery = useQuery({ queryKey: ['account'], queryFn: getAccount });
  const learnerId = accountQuery.data?.learner?.id ?? null;

  const foldersQuery = useQuery({
    queryKey: ['folders', subjectId],
    queryFn: () => listFolders(subjectId),
    enabled: !!subjectId,
  });
  const folder = foldersQuery.data?.find((f) => f.id === folderId);
  const inDays = daysUntil(folder?.scheduled_for ?? null);

  const materialsQuery = useQuery({
    queryKey: ['materials', 'folder', folderId],
    queryFn: () => listMaterials(learnerId as string, { folderId }),
    enabled: !!learnerId && !!folderId,
  });
  const materials = materialsQuery.data ?? [];
  const readyMaterials = materials.filter((m) => m.extraction_status === 'ready');

  const qc = useQueryClient();

  const handleDeleteMaterial = (m: MaterialListItem) => {
    Alert.alert(t('material.delete_title'), t('material.delete_body'), [
      { text: t('folder.cancel'), style: 'cancel' },
      {
        text: t('common:actions.delete'),
        style: 'destructive',
        onPress: () => {
          void deleteMaterial(learnerId as string, m.id)
            .then(() => {
              qc.invalidateQueries({ queryKey: ['materials', 'folder', folderId] });
            })
            .catch(() => Alert.alert(t('material.delete_title'), t('material.delete_failed')));
        },
      },
    ]);
  };

  const openFolderMenu = () => {
    if (!folder) return;
    Alert.alert(folder.name, undefined, [
      { text: t('folder.cancel'), style: 'cancel' },
      { text: t('folder.rename'), onPress: () => setEditing(true) },
      {
        text: t('folder.archive'),
        style: 'destructive',
        onPress: () => {
          Alert.alert(t('folder.archive_title'), t('folder.archive_body'), [
            { text: t('folder.cancel'), style: 'cancel' },
            {
              text: t('folder.archive'),
              style: 'destructive',
              onPress: () => {
                qc.invalidateQueries({ queryKey: ['folders', subjectId] });
                navigateUp();
              },
            },
          ]);
        },
      },
    ]);
  };

  if (!subjectId) {
    return (
      <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: LB.paper }}>
        <View style={{ padding: 22 }}>
          <CircleBtn icon="back" onPress={navigateUp} />
          <EmptyState
            glyph="🤔"
            title={t('folder.not_found_title')}
            body={t('folder.missing_subject')}
          />
        </View>
      </SafeAreaView>
    );
  }

  if (foldersQuery.isLoading) {
    return (
      <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: LB.paper }}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={LB.ink2} />
        </View>
      </SafeAreaView>
    );
  }

  if (!folder) {
    return (
      <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: LB.paper }}>
        <View style={{ padding: 22 }}>
          <CircleBtn icon="back" onPress={navigateUp} />
          <EmptyState
            glyph="🤔"
            title={t('folder.not_found_title')}
            body={t('folder.not_found_body')}
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
        <CircleBtn icon="back" onPress={navigateUp} />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Icon name="folder" size={20} color={inDays != null ? LB.primary : LB.ink3} />
          <Text style={{ fontSize: 14, fontWeight: '600', color: LB.ink }}>{folder.name}</Text>
        </View>
        <CircleBtn icon="more" onPress={openFolderMenu} />
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 120 }}>
        <Text style={{ fontSize: 24, fontWeight: '600', color: LB.ink, letterSpacing: -0.5 }}>
          {folder.name}
        </Text>
        {folder.scheduled_for && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 }}>
            <Text style={{ fontSize: 12, color: LB.ink2 }}>{`${folder.scheduled_for}`}</Text>
            {inDays != null && (
              <Chip tone="warning">
                {inDays === 0
                  ? t('folder.test_today')
                  : t('folder.test_in_days', { count: inDays })}
              </Chip>
            )}
          </View>
        )}

        <View
          style={{
            marginTop: 20,
            borderTopWidth: 1,
            borderTopColor: LB.hairline,
            paddingTop: 16,
          }}
        >
          <Text style={{ fontSize: 13, fontWeight: '600', color: LB.ink2, marginBottom: 12 }}>
            {t('folder.materials_section')}
          </Text>

          {materialsQuery.isLoading ? (
            <ActivityIndicator color={LB.ink2} style={{ marginTop: 12 }} />
          ) : materials.length === 0 ? (
            <EmptyState
              glyph="📷"
              title={t('folder.no_material_title')}
              body={t('folder.no_material_body')}
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
                      params: { materialId: m.id, folderId, subjectId },
                    })
                  }
                  onDelete={() => handleDeleteMaterial(m)}
                />
              ))}
            </View>
          )}
        </View>
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
            onPress={() =>
              router.push({
                pathname: '/(learner)/capture',
                params: { subjectId, folderId },
              })
            }
          >
            {t('folder.add_material')}
          </Btn>
        </View>
        <View style={{ flex: 2 }}>
          <Btn
            size="lg"
            full
            disabled={readyMaterials.length === 0 || !learnerId}
            onPress={() => {
              if (readyMaterials.length > 0 && learnerId) {
                router.push({
                  pathname: '/(learner)/session/[sessionId]',
                  params: { sessionId: newIdempotencyKey(), learnerId, subjectId, folderId },
                });
              }
            }}
          >
            {t('folder.start_practice')}
          </Btn>
        </View>
      </View>

      <FolderEditorModal
        visible={editing}
        subjectId={subjectId}
        initial={folder}
        onClose={() => setEditing(false)}
      />
    </SafeAreaView>
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
  const { t: tCommon } = useTranslation('common');
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
          {material.title ?? tCommon('material.untitled')}
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
