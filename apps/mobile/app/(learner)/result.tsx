// Result — calm summary, no pressure. Matches handoff ScreenResult.
// Doc 05 §result + Doc 04 §sessions.
import { useQuery } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import * as StoreReview from 'expo-store-review';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Btn, Card, Chip, EmptyState } from '../../components/lb/index.js';
import { getAccount } from '../../lib/api/account.js';
import { getSessionSummary } from '../../lib/api/sessions.js';
import { incrementAndCheckRating } from '../../lib/storage/rating.js';
import { LB, TONE_BG } from '../../lib/theme/colors.js';

type Stat = {
  label: string;
  value: string | number;
  tone: 'mint' | 'sky' | 'butter' | 'blush';
  caption?: string;
};

export default function ResultScreen() {
  const { t } = useTranslation('result');
  const params = useLocalSearchParams<{ sessionId?: string }>();
  // Source the learner from the account (the store value was only ever set
  // during onboarding, so on a normal cold launch it was null and this
  // screen showed nothing — the blank-result bug).
  const accountQuery = useQuery({ queryKey: ['account'], queryFn: getAccount });
  const learnerId = accountQuery.data?.learner?.id ?? null;

  const summaryQ = useQuery({
    queryKey: ['session-summary', params.sessionId],
    queryFn: () => {
      if (!learnerId || !params.sessionId) {
        throw new Error('missing learner or session id');
      }
      return getSessionSummary(learnerId, params.sessionId);
    },
    enabled: Boolean(learnerId && params.sessionId),
  });

  useEffect(() => {
    void incrementAndCheckRating().then(async (shouldPrompt) => {
      if (shouldPrompt && (await StoreReview.isAvailableAsync())) {
        void StoreReview.requestReview();
      }
    });
  }, []);

  // Without a sessionId param the screen is reached via the legacy nav
  // bar — keep the calm headline + the home CTAs but render no stats
  // rather than fake numbers (CLAUDE.md §rule 6).
  const data = summaryQ.data;
  const minutes = data ? Math.max(1, Math.round(data.total_duration_ms / 60_000)) : null;
  const stats: Stat[] = data
    ? [
        { label: t('stats.practiced'), value: data.attempts_count, tone: 'mint' },
        { label: t('stats.secure_now'), value: data.secure_now, tone: 'sky' },
        { label: t('stats.still_unsure'), value: data.still_unsure, tone: 'butter' },
      ]
    : [];

  const startedAt = data?.started_at ?? new Date().toISOString();
  const time = new Date(startedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: LB.paper }}>
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 24 }}
      >
        <Text
          style={{
            fontSize: 11,
            color: LB.ink3,
            fontWeight: '600',
            textTransform: 'uppercase',
            letterSpacing: 0.5,
          }}
        >
          {t('today_at', { time })}
        </Text>
        <Text
          style={{
            fontSize: 26,
            fontWeight: '600',
            color: LB.ink,
            marginVertical: 4,
            letterSpacing: -0.5,
          }}
        >
          {t('title')}
        </Text>
        {data && minutes !== null && (
          <Text style={{ fontSize: 13, color: LB.ink2 }}>
            {t('summary', { minutes, items: data.attempts_count })}
          </Text>
        )}

        {data && data.attempts_count > 0 && data.secure_now === data.attempts_count && (
          <View style={{ marginTop: 14 }}>
            <Card tone="mint" padding={16}>
              <Text style={{ fontSize: 15, color: LB.ink, fontWeight: '600', lineHeight: 21 }}>
                {t('mastery')}
              </Text>
            </Card>
          </View>
        )}

        {summaryQ.isLoading && (
          <View style={{ paddingVertical: 32, alignItems: 'center' }}>
            <ActivityIndicator color={LB.ink2} />
          </View>
        )}

        {summaryQ.isError && (
          <EmptyState
            title={t('error_title')}
            body={t('error_body')}
            action={<Btn onPress={() => void summaryQ.refetch()}>{t('error_retry')}</Btn>}
          />
        )}

        {stats.length > 0 && (
          <View
            style={{
              flexDirection: 'row',
              flexWrap: 'wrap',
              justifyContent: 'space-between',
              marginTop: 18,
              rowGap: 10,
            }}
          >
            {stats.map((s) => (
              <StatCard key={s.label} stat={s} />
            ))}
          </View>
        )}

        {data && data.topics.length > 0 && (
          <Card padding={14} style={{ marginTop: 10 }}>
            <Text
              style={{
                fontSize: 11,
                color: LB.ink3,
                fontWeight: '600',
                textTransform: 'uppercase',
                letterSpacing: 0.5,
              }}
            >
              {t('this_week_label')}
            </Text>
            <View style={{ flexDirection: 'row', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
              {data.topics.map((tp) => (
                <Chip key={tp.name} tone={tp.tone === 'secure' ? 'success' : 'warning'}>
                  {tp.name}
                </Chip>
              ))}
            </View>
          </Card>
        )}

        <View style={{ gap: 8, marginTop: 18 }}>
          <Btn
            size="lg"
            full
            onPress={() => {
              // Start a fresh session now — FSRS resurfaces the items just
              // missed first, so this really is "again with the hard ones"
              // instead of dumping the learner back at a picker.
              if (learnerId) {
                router.replace({
                  pathname: '/(learner)/session/[sessionId]',
                  params: { sessionId: `again-${Date.now()}`, learnerId },
                });
              } else {
                router.replace('/(learner)/practice');
              }
            }}
          >
            {t('cta_review_hard')}
          </Btn>
          <Btn size="md" full variant="ghost" onPress={() => router.replace('/(learner)/home')}>
            {t('cta_overview')}
          </Btn>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function StatCard({ stat }: { stat: Stat }) {
  return (
    <View
      style={{
        width: '48%',
        backgroundColor: TONE_BG[stat.tone],
        borderRadius: 14,
        padding: 14,
      }}
    >
      <Text style={{ fontSize: 11, color: LB.ink2, fontWeight: '500' }}>{stat.label}</Text>
      <Text style={{ fontSize: 32, fontWeight: '600', color: LB.ink, marginTop: 2 }}>
        {stat.value}
      </Text>
      {stat.caption && (
        <Text style={{ fontSize: 11, color: LB.ink2, marginTop: -2 }}>{stat.caption}</Text>
      )}
    </View>
  );
}
