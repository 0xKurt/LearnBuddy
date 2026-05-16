// Account settings. Doc 05 §account-settings. Email, language, sign-out.

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Redirect, router } from 'expo-router';
import { Alert, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Btn, CircleBtn } from '../../components/lb/index.js';
import { getAccount } from '../../lib/api/account.js';
import { clearSession } from '../../lib/auth/session.js';
import { useAppStore } from '../../lib/store/index.js';
import { supabase } from '../../lib/supabase.js';
import { LB } from '../../lib/theme/colors.js';

export default function AccountSettingsScreen() {
  const unlocked = useAppStore((s) => s.admin_unlocked);
  const setAdminUnlocked = useAppStore((s) => s.set_admin_unlocked);
  const accountQuery = useQuery({ queryKey: ['account'], queryFn: getAccount });
  const qc = useQueryClient();

  if (!unlocked) return <Redirect href="/(admin)/unlock" />;

  const onSignOut = () => {
    Alert.alert('Abmelden?', undefined, [
      { text: 'Abbrechen', style: 'cancel' },
      {
        text: 'Abmelden',
        style: 'destructive',
        onPress: async () => {
          await supabase.auth.signOut();
          await clearSession();
          qc.clear();
          setAdminUnlocked(false);
          router.replace('/(onboarding)/welcome');
        },
      },
    ]);
  };

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
        <Text style={{ fontSize: 18, fontWeight: '600', color: LB.ink }}>Konto</Text>
      </View>
      <ScrollView contentContainerStyle={{ padding: 22, gap: 16 }}>
        <Card title="Anzeigename">
          <Text style={{ fontSize: 14, color: LB.ink }}>
            {accountQuery.data?.display_name ?? '—'}
          </Text>
        </Card>
        <Card title="Land">
          <Text style={{ fontSize: 14, color: LB.ink }}>
            {accountQuery.data?.country_code ?? '—'}
          </Text>
        </Card>
        <Card title="Sprache">
          <Text style={{ fontSize: 14, color: LB.ink }}>{accountQuery.data?.locale ?? 'de'}</Text>
        </Card>
        <Btn full variant="danger" onPress={onSignOut}>
          Abmelden
        </Btn>
      </ScrollView>
    </SafeAreaView>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View
      style={{
        padding: 16,
        borderRadius: 14,
        backgroundColor: '#fff',
        borderColor: LB.hairline,
        borderWidth: 1,
        gap: 6,
      }}
    >
      <Text style={{ fontSize: 12, color: LB.ink2 }}>{title}</Text>
      {children}
    </View>
  );
}
