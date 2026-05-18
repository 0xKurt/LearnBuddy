// Practice hub. Lists upcoming tests from the schedule summary so the user can
// jump straight to the relevant folder for a quick prep session.

import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Btn, EmptyState } from '../../../components/lb/index.js';
import { getAccount } from '../../../lib/api/account.js';
import { getScheduleSummary } from '../../../lib/api/subjects.js';
import { LB } from '../../../lib/theme/colors.js';

export default function PracticeHubScreen() {
  const { t } = useTranslation('practice');

  const accountQuery = useQuery({ queryKey: ['account'], queryFn: getAccount });
  const learnerId = accountQuery.data?.learner?.id;

  const scheduleQuery = useQuery({
    queryKey: ['schedule-summary', learnerId],
    queryFn: () => getScheduleSummary(learnerId as string),
    enabled: !!learnerId,
  });

  const tests = scheduleQuery.data?.upcoming_tests ?? [];

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: LB.paper }}>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 22, paddingBottom: 32 }}>
        <Text
          style={{
            fontSize: 28,
            fontWeight: '700',
            color: LB.ink,
            letterSpacing: -0.6,
            marginTop: 24,
            marginBottom: 20,
          }}
        >
          {t('hub.title')}
        </Text>

        {tests.length > 0 && (
          <>
            <Text
              style={{
                fontSize: 12,
                fontWeight: '600',
                color: LB.ink2,
                letterSpacing: 0.5,
                textTransform: 'uppercase',
                marginBottom: 12,
              }}
            >
              {t('hub.upcoming_tests')}
            </Text>
            <View style={{ gap: 10 }}>
              {tests.map((test) => (
                <Pressable
                  key={test.folder_id}
                  onPress={() =>
                    router.push({
                      pathname: '/(learner)/folder/[folderId]',
                      params: { folderId: test.folder_id, subjectId: test.subject_id },
                    })
                  }
                  accessibilityRole="button"
                  accessibilityLabel={test.name}
                >
                  <View
                    style={{
                      backgroundColor: '#fff',
                      borderRadius: 16,
                      borderWidth: 1,
                      borderColor: LB.hairline,
                      paddingHorizontal: 16,
                      paddingVertical: 14,
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}
                  >
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text
                        style={{ fontSize: 15, fontWeight: '600', color: LB.ink }}
                        numberOfLines={1}
                      >
                        {test.name}
                      </Text>
                      <Text style={{ fontSize: 12, color: LB.warning }}>
                        {test.days_until === 0
                          ? t('hub.test_today')
                          : t('hub.test_in_days', { count: test.days_until })}
                      </Text>
                    </View>
                    <Text
                      style={{ fontSize: 12, color: LB.primary, fontWeight: '500', marginLeft: 12 }}
                    >
                      {t('hub.go_to_folder')}
                    </Text>
                  </View>
                </Pressable>
              ))}
            </View>
          </>
        )}

        {!scheduleQuery.isLoading && tests.length === 0 && (
          <EmptyState
            glyph="🌿"
            title={t('hub.empty_title')}
            body={t('hub.empty_body')}
            action={
              <Btn size="sm" onPress={() => router.push('/(learner)/home')}>
                {t('hub.browse_home')}
              </Btn>
            }
          />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
