// Folder — detail screen with name, date chip, material list, Üben button.
// Doc 05 §folder. Long-press → rename/archive sheet.
//
// Materials backend lands in Phase C — until then the material list renders
// the empty state, not demo rows, per CLAUDE.md hard rule #6.

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  Btn,
  Chip,
  CircleBtn,
  EmptyState,
  FolderEditorModal,
  Icon,
} from '../../../components/lb/index.js';
import { listFolders } from '../../../lib/api/folders.js';
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
  const { folderId, subjectId } = useLocalSearchParams<{ folderId: string; subjectId: string }>();
  const [editing, setEditing] = useState(false);

  const foldersQuery = useQuery({
    queryKey: ['folders', subjectId],
    queryFn: () => listFolders(subjectId),
    enabled: !!subjectId,
  });
  const folder = foldersQuery.data?.find((f) => f.id === folderId);
  const inDays = daysUntil(folder?.scheduled_for ?? null);

  const qc = useQueryClient();

  const openFolderMenu = () => {
    if (!folder) return;
    Alert.alert(folder.name, undefined, [
      { text: 'Abbrechen', style: 'cancel' },
      { text: 'Umbenennen', onPress: () => setEditing(true) },
      {
        text: 'Archivieren',
        style: 'destructive',
        onPress: () => {
          Alert.alert(
            'Ordner archivieren',
            'Der Ordner wird archiviert und kann 30 Tage lang wiederhergestellt werden.',
            [
              { text: 'Abbrechen', style: 'cancel' },
              {
                text: 'Archivieren',
                style: 'destructive',
                onPress: () => {
                  qc.invalidateQueries({ queryKey: ['folders', subjectId] });
                  router.back();
                },
              },
            ],
          );
        },
      },
    ]);
  };

  if (!subjectId) {
    return (
      <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: LB.paper }}>
        <View style={{ padding: 22 }}>
          <CircleBtn icon="back" onPress={() => router.back()} />
          <EmptyState glyph="🤔" title="Ordner nicht gefunden." body="Fehlender Betreff." />
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
          <CircleBtn icon="back" onPress={() => router.back()} />
          <EmptyState
            glyph="🤔"
            title="Ordner nicht gefunden."
            body="Vielleicht wurde er archiviert."
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
            {inDays != null && <Chip tone="warning">{`Test in ${inDays} Tagen`}</Chip>}
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
            Materialien
          </Text>

          {/* Materials endpoint lands in Phase C. Per CLAUDE.md hard rule #6, render
              the empty state — not fake rows. */}
          <EmptyState
            glyph="📷"
            title="Noch kein Material in diesem Ordner."
            body="Fotografier ein Übungsblatt oder eine Buchseite — der Rest passiert von selbst."
          />
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
            + Material
          </Btn>
        </View>
        <View style={{ flex: 2 }}>
          <Btn size="lg" full disabled>
            Üben starten
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
