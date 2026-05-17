// Archived items. Doc 05 §archived. Lists soft-archived subjects/folders/
// materials and lets the account holder restore (mocked for now: a banner
// explains "30-day grace" and the row shows when each item was archived).

import { useQuery } from '@tanstack/react-query';
import { Redirect, router } from 'expo-router';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CircleBtn, EmptyState } from '../../components/lb/index.js';
import { getAccount } from '../../lib/api/account.js';
import { listSubjects } from '../../lib/api/subjects.js';
import { useAppStore } from '../../lib/store/index.js';
import { LB } from '../../lib/theme/colors.js';

export default function ArchivedScreen() {
  const { t } = useTranslation('admin');
  const unlocked = useAppStore((s) => s.admin_unlocked);
  const accountQuery = useQuery({ queryKey: ['account'], queryFn: getAccount });
  const learnerId = accountQuery.data?.learner?.id;
  const subjectsQuery = useQuery({
    queryKey: ['subjects-archived', learnerId],
    queryFn: () => listSubjects(learnerId as string),
    enabled: !!learnerId,
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
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
