// Admin material drill-in. Doc 05 §admin-material. Read-only list of items
// with a per-item delete (soft-archive) for cleaning up bad questions.

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CircleBtn, EmptyState } from '../../../components/lb/index.js';
import { getAccount } from '../../../lib/api/account.js';
import { archiveItem } from '../../../lib/api/items.js';
import { getMaterial } from '../../../lib/api/materials.js';
import { useAppStore } from '../../../lib/store/index.js';
import { LB } from '../../../lib/theme/colors.js';

export default function AdminMaterialScreen() {
  const unlocked = useAppStore((s) => s.admin_unlocked);
  const { id } = useLocalSearchParams<{ id: string }>();
  const accountQuery = useQuery({ queryKey: ['account'], queryFn: getAccount });
  const learnerId = accountQuery.data?.learner?.id;
  const qc = useQueryClient();

  const materialQuery = useQuery({
    queryKey: ['admin-material', id],
    queryFn: () => getMaterial(learnerId as string, id),
    enabled: !!learnerId && !!id,
  });

  const archiveMut = useMutation({
    mutationFn: (itemId: string) => archiveItem(learnerId as string, itemId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-material', id] });
    },
    onError: (err: Error) => Alert.alert('Ups.', err.message),
  });

  if (!unlocked) return <Redirect href="/(admin)/unlock" />;

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: LB.paper }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: 18,
          paddingVertical: 12,
          gap: 10,
        }}
      >
        <CircleBtn icon="back" onPress={() => router.back()} />
        <Text style={{ fontSize: 18, fontWeight: '600', color: LB.ink, flex: 1 }} numberOfLines={1}>
          {materialQuery.data?.title ?? 'Material'}
        </Text>
      </View>
      <ScrollView contentContainerStyle={{ padding: 22, gap: 10 }}>
        {materialQuery.isLoading ? (
          <ActivityIndicator color={LB.ink2} />
        ) : !materialQuery.data ? (
          <EmptyState glyph="🤔" title="Nicht gefunden." />
        ) : materialQuery.data.items.length === 0 ? (
          <EmptyState glyph="📷" title="Keine Fragen." />
        ) : (
          materialQuery.data.items.map((it, i) => (
            <Pressable
              key={it.id}
              onLongPress={() =>
                Alert.alert('Frage löschen?', it.question, [
                  { text: 'Abbrechen', style: 'cancel' },
                  {
                    text: 'Löschen',
                    style: 'destructive',
                    onPress: () => archiveMut.mutate(it.id),
                  },
                ])
              }
              style={{
                padding: 14,
                borderRadius: 14,
                backgroundColor: '#fff',
                borderColor: LB.hairline,
                borderWidth: 1,
              }}
            >
              <Text style={{ fontSize: 11, color: LB.ink3, fontWeight: '600' }}>Frage {i + 1}</Text>
              <Text style={{ fontSize: 14, color: LB.ink, marginTop: 4, lineHeight: 20 }}>
                {it.question}
              </Text>
              <Text style={{ fontSize: 12, color: LB.ink2, marginTop: 6 }}>
                Erwartet: {it.expected_answer}
              </Text>
            </Pressable>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
