// Profile notifications. Doc 05 §profile-notifications.
// Local toggles + time picker; persisted via expo-secure-store. Real expo-
// notifications scheduling lives in lib/notifications.ts (Slice F2).

import { Redirect } from 'expo-router';
import { useEffect, useState } from 'react';
import { Linking, ScrollView, Switch, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Btn, CircleBtn } from '../../components/lb/index.js';
import {
  ensurePermissions,
  getPermissionStatus,
  loadNotificationPrefs,
  saveNotificationPrefs,
  type NotificationPrefs,
} from '../../lib/notifications.js';
import { useNavigateUp } from '../../lib/navigation/hierarchy.js';
import { useAppStore } from '../../lib/store/index.js';
import { LB } from '../../lib/theme/colors.js';

export default function ProfileNotificationsScreen() {
  const { t } = useTranslation('admin');
  const navigateUp = useNavigateUp();
  const unlocked = useAppStore((s) => s.admin_unlocked);
  const [prefs, setPrefs] = useState<NotificationPrefs | null>(null);
  const [permGranted, setPermGranted] = useState(true);
  const [permDenied, setPermDenied] = useState(false);
  const [requestingPerm, setRequestingPerm] = useState(false);

  useEffect(() => {
    void loadNotificationPrefs().then(setPrefs);
    void getPermissionStatus().then((status) => {
      setPermGranted(status === 'granted');
      setPermDenied(status === 'denied');
    });
  }, []);

  const onRequestPermission = async () => {
    setRequestingPerm(true);
    if (permDenied) {
      // iOS/Android won't re-show the dialog once denied — must go to Settings.
      await Linking.openSettings();
      // Re-check status after user returns from Settings.
      const status = await getPermissionStatus();
      setPermGranted(status === 'granted');
      setPermDenied(status === 'denied');
    } else {
      const granted = await ensurePermissions();
      setPermGranted(granted);
      setPermDenied(!granted);
    }
    setRequestingPerm(false);
  };

  if (!unlocked) return <Redirect href="/(admin)/unlock" />;
  if (!prefs) {
    return (
      <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: LB.paper }}>
        <View style={{ padding: 24 }}>
          <Text style={{ color: LB.ink2 }}>{t('notifications.loading')}</Text>
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
      <Header title={t('notifications.title')} />
      <ScrollView contentContainerStyle={{ padding: 22, gap: 14 }}>
        {!permGranted && (
          <View
            style={{
              backgroundColor: 'rgba(181,138,60,0.10)',
              borderColor: 'rgba(181,138,60,0.25)',
              borderWidth: 1,
              borderRadius: 14,
              padding: 16,
              gap: 10,
            }}
          >
            <Text style={{ fontSize: 14, color: LB.warning, fontWeight: '600' }}>
              {t('notifications.permission_title')}
            </Text>
            <Text style={{ fontSize: 13, color: LB.ink2, lineHeight: 19 }}>
              {t('notifications.permission_body')}
            </Text>
            <Btn size="sm" onPress={() => void onRequestPermission()} disabled={requestingPerm}>
              {requestingPerm
                ? t('notifications.loading')
                : permDenied
                  ? t('notifications.open_settings')
                  : t('notifications.permission_cta')}
            </Btn>
          </View>
        )}
        <Row
          label={t('notifications.daily_label')}
          sub={t('notifications.daily_sub', { time: prefs.daily_time })}
          value={prefs.daily_enabled}
          onChange={(v) => save({ ...prefs, daily_enabled: v })}
        />
        <Row
          label={t('notifications.test_label')}
          sub={t('notifications.test_sub')}
          value={prefs.test_reminders}
          onChange={(v) => save({ ...prefs, test_reminders: v })}
        />
        <Row
          label={t('notifications.streak_label')}
          sub={t('notifications.streak_sub')}
          value={prefs.streak_enabled}
          onChange={(v) => save({ ...prefs, streak_enabled: v })}
        />
        <View style={{ marginTop: 12 }}>
          <Btn variant="ghost" onPress={navigateUp}>
            {t('notifications.done')}
          </Btn>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Header({ title }: { title: string }) {
  const navigateUp = useNavigateUp();
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
      <CircleBtn icon="back" onPress={navigateUp} />
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
