// Archived items. Doc 05 §archived. Lists soft-archived subjects and lets
// the account holder restore them (sets archived_at back to null).

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Redirect, router } from 'expo-router';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Btn, CircleBtn, EmptyState } from '../../components/lb/index.js';
import { getAccount } from '../../lib/api/account.js';
import { listArchivedSubjects, restoreSubject } from '../../lib/api/subjects.js';
import { useAppStore } from '../../lib/store/index.js';
import { LB } from '../../lib/theme/colors.js';

export default function ArchivedScreen() {
  const { t } = useTranslation('admin');
  const unlocked = useAppStore((s) => s.admin_unlocked);
  const queryClient = useQueryClient();
  const accountQuery = useQuery({ queryKey: ['account'], queryFn: getAccount });
  const learnerId = accountQuery.data?.learner?.id;
  const subjectsQuery = useQuery({
    queryKey: ['subjects-archived', learnerId],
    enabled: !!learnerId,
    queryFn: () => listArchivedSubjects(learnerId as string),
  });

  const restoreMutation = useMutation({
    mutationFn: (id: string) => restoreSubject(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['subjects-archived', learnerId] });
      void queryClient.invalidateQueries({ queryKey: ['subjects', learnerId] });
    },
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
        <Text style={{ fontSize: 18, fontWeight: '600', color: LB.ink }}>
          {t('archived.title')}
        </Text>
      </View>
      <ScrollView contentContainerStyle={{ padding: 22, gap: 12 }}>
        <View
          style={{
            padding: 14,
            borderRadius: 12,
            backgroundColor: LB.primaryLt,
          }}
        >
          <Text style={{ fontSize: 13, color: LB.primaryDk, lineHeight: 19 }}>
            {t('archived.banner')}
          </Text>
        </View>
        {subjectsQuery.isLoading ? (
          <ActivityIndicator color={LB.ink2} style={{ marginTop: 24 }} />
        ) : (subjectsQuery.data?.length ?? 0) === 0 ? (
          <EmptyState glyph="🗄️" title={t('archived.empty')} />
        ) : (
          (subjectsQuery.data ?? []).map((s) => (
            <View
              key={s.id}
              style={{
                padding: 14,
                borderRadius: 14,
                backgroundColor: '#fff',
                borderColor: LB.hairline,
                borderWidth: 1,
              }}
            >
              <Text style={{ fontSize: 15, color: LB.ink, fontWeight: '500' }}>{s.name}</Text>
              <Text style={{ fontSize: 12, color: LB.ink3, marginTop: 2 }}>
                {s.folder_count} Ordner · {s.material_count} Material
              </Text>
              {s.archived_at && (
                <Text style={{ fontSize: 11, color: LB.ink3, marginTop: 2 }}>
                  {t('archived.archived_on', {
                    date: new Date(s.archived_at).toLocaleDateString(),
                  })}
                </Text>
              )}
              <View style={{ marginTop: 10 }}>
                <Btn
                  size="sm"
                  variant="outline"
                  disabled={restoreMutation.isPending}
                  onPress={() => restoreMutation.mutate(s.id)}
                >
                  {t('archived.restore_cta')}
                </Btn>
              </View>
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
