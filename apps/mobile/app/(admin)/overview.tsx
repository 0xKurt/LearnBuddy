// Admin overview. Doc 05 §overview.
// Lists the single learner profile + quick links to all admin sub-screens.

import { useQuery } from '@tanstack/react-query';
import { Link, Redirect, router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Btn, CircleBtn, EmptyState, Icon } from '../../components/lb/index.js';
import { getAccount } from '../../lib/api/account.js';
import { isoToDisplay } from '../../lib/date.js';
import { devNukeAccount } from '../../lib/dev/reset.js';
import { useAppStore } from '../../lib/store/index.js';
import { LB } from '../../lib/theme/colors.js';

type RowKey =
  | 'profile_edit'
  | 'notifications'
  | 'preferences'
  | 'voice'
  | 'subscription'
  | 'data'
  | 'archive'
  | 'account_settings'
  | 'about';
type Row = { key: RowKey; href: string; hasSub?: boolean };

const ROWS: Row[] = [
  { key: 'profile_edit', href: '/(admin)/profile-edit', hasSub: true },
  { key: 'notifications', href: '/(admin)/profile-notifications' },
  { key: 'preferences', href: '/(admin)/preferences' },
  { key: 'voice', href: '/(admin)/voice-settings' },
  { key: 'subscription', href: '/(admin)/subscription' },
  { key: 'data', href: '/(admin)/data' },
  { key: 'archive', href: '/(admin)/archived' },
  { key: 'account_settings', href: '/(admin)/account-settings' },
  { key: 'about', href: '/(admin)/about' },
];

export default function AdminOverviewScreen() {
  const { t } = useTranslation('admin');
  const unlocked = useAppStore((s) => s.admin_unlocked);
  const accountQuery = useQuery({ queryKey: ['account'], queryFn: getAccount });

  if (!unlocked) {
    return <Redirect href="/(admin)/unlock" />;
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
        <CircleBtn icon="close" onPress={() => router.replace('/(learner)/home')} />
        <Text style={{ fontSize: 14, fontWeight: '600', color: LB.ink }}>
          {t('overview.title')}
        </Text>
        {__DEV__ ? (
          <Pressable
            hitSlop={10}
            onPress={() =>
              Alert.alert(
                'DEV · NUKE ACCOUNT',
                'Hard-delete this user from Supabase Auth?\nAll DB rows cascade. Cannot be undone.',
                [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: 'NUKE',
                    style: 'destructive',
                    onPress: () =>
                      void devNukeAccount()
                        .then(() => router.replace('/(onboarding)/language' as never))
                        .catch((e: unknown) =>
                          Alert.alert('Nuke failed', e instanceof Error ? e.message : String(e)),
                        ),
                  },
                ],
              )
            }
          >
            <View
              style={{
                backgroundColor: '#d1361c',
                paddingHorizontal: 10,
                paddingVertical: 5,
                borderRadius: 999,
              }}
            >
              <Text style={{ color: '#fff', fontSize: 10, fontWeight: '700', letterSpacing: 0.5 }}>
                DEV · NUKE
              </Text>
            </View>
          </Pressable>
        ) : (
          <View style={{ width: 40 }} />
        )}
      </View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 48 }}>
        <Text style={{ fontSize: 26, fontWeight: '600', color: LB.ink, letterSpacing: -0.5 }}>
          {t('overview.title')}
        </Text>
        {accountQuery.isLoading ? (
          <View style={{ paddingVertical: 24 }}>
            <ActivityIndicator color={LB.ink2} />
          </View>
        ) : accountQuery.isError ? (
          <EmptyState
            glyph="⚠️"
            title={t('overview.error_title')}
            body={t('overview.error_body')}
            action={
              <Btn onPress={() => void accountQuery.refetch()}>{t('overview.error_retry')}</Btn>
            }
          />
        ) : accountQuery.data?.learner ? (
          <View style={{ marginTop: 8, gap: 2 }}>
            <Text style={{ fontSize: 14, color: LB.ink2 }}>
              {accountQuery.data.learner.display_name}
            </Text>
            <Text style={{ fontSize: 12, color: LB.ink3 }}>
              {t('overview.birth_date_grade', {
                date: isoToDisplay(accountQuery.data.learner.birth_date) ?? '—',
                grade: accountQuery.data.learner.grade_level ?? t('overview.grade_unknown'),
              })}
            </Text>
          </View>
        ) : null}

        <View style={{ marginTop: 22, gap: 8 }}>
          {ROWS.map((r) => (
            <Link key={r.href} href={r.href as never} asChild>
              <Pressable accessibilityRole="menuitem">
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    paddingHorizontal: 16,
                    paddingVertical: 14,
                    borderRadius: 14,
                    backgroundColor: '#fff',
                    borderColor: LB.hairline,
                    borderWidth: 1,
                  }}
                >
                  <View>
                    <Text style={{ fontSize: 15, color: LB.ink, fontWeight: '500' }}>
                      {t(`overview.rows.${r.key}`)}
                    </Text>
                    {r.hasSub && (
                      <Text style={{ fontSize: 12, color: LB.ink3, marginTop: 2 }}>
                        {t('overview.rows.profile_edit_sub')}
                      </Text>
                    )}
                  </View>
                  <Icon name="chevron" size={18} color={LB.ink3} />
                </View>
              </Pressable>
            </Link>
          ))}
        </View>

        <View style={{ marginTop: 28 }}>
          <Btn full variant="outline" onPress={() => router.replace('/(learner)/home')}>
            {t('overview.back_to_learner')}
          </Btn>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
