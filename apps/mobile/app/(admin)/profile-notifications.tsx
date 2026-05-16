// Profile notifications. Doc 05 §profile-notifications.
// Local toggles + time picker; persisted via expo-secure-store. Real expo-
// notifications scheduling lives in lib/notifications.ts (Slice F2).

import { Redirect, router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Btn, CircleBtn } from '../../components/lb/index.js';
import {
  loadNotificationPrefs,
  saveNotificationPrefs,
  type NotificationPrefs,
} from '../../lib/notifications.js';
import { useAppStore } from '../../lib/store/index.js';
import { LB } from '../../lib/theme/colors.js';

export default function ProfileNotificationsScreen() {
  const unlocked = useAppStore((s) => s.admin_unlocked);
  const [prefs, setPrefs] = useState<NotificationPrefs | null>(null);

  useEffect(() => {
    void loadNotificationPrefs().then(setPrefs);
  }, []);

  if (!unlocked) return <Redirect href="/(admin)/unlock" />;
  if (!prefs) {
    return (
      <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: LB.paper }}>
        <View style={{ padding: 24 }}>
          <Text style={{ color: LB.ink2 }}>Lade …</Text>
        </View>
      </SafeAreaView>
    );
  }

  const save = (next: NotificationPrefs) => {
    setPrefs(next);
    void saveNotificationPrefs(next);
  };

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: LB.paper }}>
      <Header title="Benachrichtigungen" />
      <ScrollView contentContainerStyle={{ padding: 22, gap: 14 }}>
        <Row
          label="Tägliche Erinnerung"
          sub={`Um ${prefs.daily_time}. Nur an Tagen ohne Sitzung.`}
          value={prefs.daily_enabled}
          onChange={(v) => save({ ...prefs, daily_enabled: v })}
        />
        <Row
          label="Test-Erinnerungen"
          sub="3 Tage / 1 Tag / am Morgen vor Tests in geplanten Ordnern."
          value={prefs.test_reminders}
          onChange={(v) => save({ ...prefs, test_reminders: v })}
        />
        <Row
          label="Streak-Erinnerung"
          sub="Sanftes Anstupsen wenn die Lern-Serie abreißen würde."
          value={prefs.streak_enabled}
          onChange={(v) => save({ ...prefs, streak_enabled: v })}
        />
        <View style={{ marginTop: 12 }}>
          <Btn variant="ghost" onPress={() => router.back()}>
            Fertig
          </Btn>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Header({ title }: { title: string }) {
  return (
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
      <Text style={{ fontSize: 18, fontWeight: '600', color: LB.ink }}>{title}</Text>
    </View>
  );
}

function Row({
  label,
  sub,
  value,
  onChange,
}: {
  label: string;
  sub?: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: 16,
        borderRadius: 14,
        backgroundColor: '#fff',
        borderColor: LB.hairline,
        borderWidth: 1,
      }}
    >
      <View style={{ flex: 1, paddingRight: 12 }}>
        <Text style={{ fontSize: 15, color: LB.ink, fontWeight: '500' }}>{label}</Text>
        {sub && <Text style={{ fontSize: 12, color: LB.ink3, marginTop: 4 }}>{sub}</Text>}
      </View>
      <Switch value={value} onValueChange={onChange} trackColor={{ true: LB.primary }} />
    </View>
  );
}
