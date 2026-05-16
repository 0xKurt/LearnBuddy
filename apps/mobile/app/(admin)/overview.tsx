// Admin overview. Doc 05 §overview.
// Lists the single learner profile + quick links to all admin sub-screens.

import { useQuery } from '@tanstack/react-query';
import { Link, Redirect, router } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Btn, CircleBtn, Icon } from '../../components/lb/index.js';
import { getAccount } from '../../lib/api/account.js';
import { useAppStore } from '../../lib/store/index.js';
import { LB } from '../../lib/theme/colors.js';

type Row = { label: string; href: string; sub?: string };

const ROWS: Row[] = [
  { label: 'Profil bearbeiten', href: '/(admin)/profile-edit', sub: 'Name, Geburtsjahr, Stufe' },
  { label: 'Benachrichtigungen', href: '/(admin)/profile-notifications' },
  { label: 'Abo', href: '/(admin)/subscription' },
  { label: 'Daten & Datenschutz', href: '/(admin)/data' },
  { label: 'Archiv', href: '/(admin)/archived' },
  { label: 'Konto-Einstellungen', href: '/(admin)/account-settings' },
  { label: 'Über die App', href: '/(admin)/about' },
];

export default function AdminOverviewScreen() {
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
        <Text style={{ fontSize: 14, fontWeight: '600', color: LB.ink }}>Konto</Text>
        <View style={{ width: 40 }} />
      </View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 48 }}>
        <Text style={{ fontSize: 26, fontWeight: '600', color: LB.ink, letterSpacing: -0.5 }}>
          Konto
        </Text>
        {accountQuery.isLoading ? (
          <View style={{ paddingVertical: 24 }}>
            <ActivityIndicator color={LB.ink2} />
          </View>
        ) : accountQuery.data?.learner ? (
          <View style={{ marginTop: 8, gap: 2 }}>
            <Text style={{ fontSize: 14, color: LB.ink2 }}>
              {accountQuery.data.learner.display_name}
            </Text>
            <Text style={{ fontSize: 12, color: LB.ink3 }}>
              Geburtsjahr {accountQuery.data.learner.birth_year} · Klasse{' '}
              {accountQuery.data.learner.grade_level ?? '—'}
            </Text>
          </View>
        ) : null}

        <View style={{ marginTop: 22, gap: 8 }}>
          {ROWS.map((r) => (
            <Link key={r.href} href={r.href as never} asChild>
              <Pressable
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
                  <Text style={{ fontSize: 15, color: LB.ink, fontWeight: '500' }}>{r.label}</Text>
                  {r.sub && (
                    <Text style={{ fontSize: 12, color: LB.ink3, marginTop: 2 }}>{r.sub}</Text>
                  )}
                </View>
                <Icon name="chevron" size={18} color={LB.ink3} />
              </Pressable>
            </Link>
          ))}
        </View>

        <View style={{ marginTop: 28 }}>
          <Btn full variant="outline" onPress={() => router.replace('/(learner)/home')}>
            Zurück zur Lern-Ansicht
          </Btn>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
