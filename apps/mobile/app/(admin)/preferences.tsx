// Admin → Preferences. USER-FLOWS-DEEP §9.
//
// Aggregates the small power-user toggles that don't belong on the dedicated
// admin screens:
//   - Haptics (§9.2)
//   - Default session length (§9.3) — 5 / 10 / 20 / 30 items
//   - Photo retention (§9.6) — 1 / 3 / 7 days. DSGVO §photo-retention caps
//     hard at 7 days; this screen only lets the user ask for a *shorter*
//     retention window. Server-side enforcement still wipes at the chosen
//     interval (or 7d, whichever is sooner).
//   - Data saver (§9.9) — skip image downloads in study session preview
//   - OpenDyslexic font (§5 + §9 — "needs design") — toggle persisted only;
//     the actual font load lands when we add the file to assets and wire it
//     through expo-font.
//
// Persistence is via lib/prefs.ts (single SecureStore JSON bag).

import { Redirect } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Btn, CircleBtn } from '../../components/lb/index.js';
import { useNavigateUp } from '../../lib/navigation/hierarchy.js';
import { SESSION_LENGTH_CHOICES, usePref, type SessionLength } from '../../lib/prefs.js';
import { useAppStore } from '../../lib/store/index.js';
import { LB } from '../../lib/theme/colors.js';

export default function PreferencesScreen() {
  const { t } = useTranslation('admin');
  const navigateUp = useNavigateUp();
  const unlocked = useAppStore((s) => s.admin_unlocked);

  const [haptics, setHaptics] = usePref('haptics');
  const [sessionLength, setSessionLength] = usePref('session_length');
  const [dataSaver, setDataSaver] = usePref('data_saver');

  if (!unlocked) return <Redirect href="/(admin)/unlock" />;

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: LB.paper }}>
      <Header title={t('preferences.title')} />
      <ScrollView contentContainerStyle={{ padding: 22, gap: 18, paddingBottom: 48 }}>
        <ToggleRow
          label={t('preferences.haptics.label')}
          sub={t('preferences.haptics.sub')}
          value={haptics}
          onChange={(v) => void setHaptics(v)}
        />

        <Section title={t('preferences.session_length.title')}>
          <Text style={{ fontSize: 12, color: LB.ink3, marginBottom: 10 }}>
            {t('preferences.session_length.sub')}
          </Text>
          <RadioRow<SessionLength>
            options={SESSION_LENGTH_CHOICES}
            value={sessionLength}
            onChange={(v) => void setSessionLength(v)}
            label={(v) => t('preferences.session_length.option', { count: v })}
          />
        </Section>

        <ToggleRow
          label={t('preferences.data_saver.label')}
          sub={t('preferences.data_saver.sub')}
          value={dataSaver}
          onChange={(v) => void setDataSaver(v)}
        />

        <View style={{ marginTop: 10 }}>
          <Btn variant="ghost" onPress={navigateUp}>
            {t('preferences.done')}
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

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View
      style={{
        padding: 16,
        borderRadius: 14,
        backgroundColor: '#fff',
        borderColor: LB.hairline,
        borderWidth: 1,
      }}
    >
      <Text
        style={{
          fontSize: 13,
          color: LB.ink2,
          fontWeight: '600',
          marginBottom: 6,
          textTransform: 'uppercase',
          letterSpacing: 0.4,
        }}
      >
        {title}
      </Text>
      {children}
    </View>
  );
}

function ToggleRow({
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

function RadioRow<T extends number>({
  options,
  value,
  onChange,
  label,
}: {
  options: readonly T[];
  value: T;
  onChange: (v: T) => void;
  label: (v: T) => string;
}) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {options.map((opt) => {
        const selected = opt === value;
        return (
          <Pressable
            key={opt}
            onPress={() => onChange(opt)}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            accessibilityLabel={label(opt)}
          >
            <View
              style={{
                paddingHorizontal: 14,
                paddingVertical: 10,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: selected ? LB.primary : LB.hairline,
                backgroundColor: selected ? LB.primaryLt : '#fff',
              }}
            >
              <Text
                style={{
                  fontSize: 14,
                  color: selected ? LB.primaryDk : LB.ink,
                  fontWeight: '500',
                }}
              >
                {label(opt)}
              </Text>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}
