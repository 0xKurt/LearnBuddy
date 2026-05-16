// Data & privacy. Doc 05 §data + Doc 09 §account-holder-rights.
// DSGVO export + 7-day-hold delete.

import { Redirect, router } from 'expo-router';
import { useState } from 'react';
import { Alert, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Btn, CircleBtn } from '../../components/lb/index.js';
import { requestDsgvoDelete, requestDsgvoExport } from '../../lib/api/dsgvo.js';
import { useAppStore } from '../../lib/store/index.js';
import { LB } from '../../lib/theme/colors.js';

export default function DataScreen() {
  const unlocked = useAppStore((s) => s.admin_unlocked);
  const [exporting, setExporting] = useState(false);

  if (!unlocked) return <Redirect href="/(admin)/unlock" />;

  const onExport = async () => {
    setExporting(true);
    try {
      await requestDsgvoExport();
      Alert.alert(
        'Export angefordert',
        'Du bekommst per Email einen Link, sobald die Daten bereit sind (bis zu 24 Std).',
      );
    } catch (err) {
      Alert.alert('Ups.', err instanceof Error ? err.message : 'Export fehlgeschlagen.');
    } finally {
      setExporting(false);
    }
  };

  const onDelete = () => {
    Alert.alert(
      'Konto löschen?',
      'Wir geben dir 7 Tage Zeit, das zurückzunehmen. Danach werden alle Daten endgültig gelöscht.',
      [
        { text: 'Abbrechen', style: 'cancel' },
        {
          text: 'Löschen anfordern',
          style: 'destructive',
          onPress: async () => {
            try {
              await requestDsgvoDelete();
              Alert.alert(
                'Löschanfrage erfasst',
                'Du erhältst eine Bestätigung per Email. Innerhalb von 7 Tagen kannst du das rückgängig machen.',
              );
            } catch (err) {
              Alert.alert('Ups.', err instanceof Error ? err.message : 'Anfrage fehlgeschlagen.');
            }
          },
        },
      ],
    );
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
        <Text style={{ fontSize: 18, fontWeight: '600', color: LB.ink }}>Daten</Text>
      </View>
      <ScrollView contentContainerStyle={{ padding: 22, gap: 18 }}>
        <Section
          title="Datenexport"
          body="Wir packen dir alles in eine ZIP-Datei: Konto, Profil, Fragen, Versuche, Abo-Status. Kommt per Email, gültig 7 Tage."
        >
          <Btn full onPress={onExport} disabled={exporting}>
            {exporting ? 'Lade …' : 'Export anfordern'}
          </Btn>
        </Section>
        <Section
          title="Konto löschen"
          body="7-Tage-Frist: in dieser Zeit kannst du den Löschvorgang noch stoppen. Danach werden alle Daten endgültig entfernt."
        >
          <Btn full variant="danger" onPress={onDelete}>
            Konto löschen anfordern
          </Btn>
        </Section>
      </ScrollView>
    </SafeAreaView>
  );
}

function Section({
  title,
  body,
  children,
}: {
  title: string;
  body: string;
  children: React.ReactNode;
}) {
  return (
    <View
      style={{
        padding: 16,
        borderRadius: 14,
        backgroundColor: '#fff',
        borderColor: LB.hairline,
        borderWidth: 1,
        gap: 10,
      }}
    >
      <Text style={{ fontSize: 16, fontWeight: '600', color: LB.ink }}>{title}</Text>
      <Text style={{ fontSize: 13, color: LB.ink2, lineHeight: 19 }}>{body}</Text>
      {children}
    </View>
  );
}
