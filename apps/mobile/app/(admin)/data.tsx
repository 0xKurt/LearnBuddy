// Data & privacy. Doc 05 §data + Doc 09 §account-holder-rights.
// DSGVO export + 7-day-hold delete.

import { Redirect, router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Btn, CircleBtn } from '../../components/lb/index.js';
import { requestDsgvoDelete, requestDsgvoExport } from '../../lib/api/dsgvo.js';
import { useAppStore } from '../../lib/store/index.js';
import { LB } from '../../lib/theme/colors.js';

export default function DataScreen() {
  const { t } = useTranslation('admin');
  const unlocked = useAppStore((s) => s.admin_unlocked);
  const [exporting, setExporting] = useState(false);

  if (!unlocked) return <Redirect href="/(admin)/unlock" />;

  const onExport = async () => {
    setExporting(true);
    try {
      await requestDsgvoExport();
      Alert.alert(t('data.export.requested_title'), t('data.export.requested_body'));
    } catch (err) {
      Alert.alert(
        t('data.export.error_title'),
        err instanceof Error ? err.message : t('data.export.error_generic'),
      );
    } finally {
      setExporting(false);
    }
  };

  const onDelete = () => {
    Alert.alert(t('data.delete.confirm_title'), t('data.delete.confirm_body'), [
      { text: t('data.delete.confirm_cancel'), style: 'cancel' },
      {
        text: t('data.delete.confirm_ok'),
        style: 'destructive',
        onPress: async () => {
          try {
            await requestDsgvoDelete();
            Alert.alert(t('data.delete.requested_title'), t('data.delete.requested_body'));
          } catch (err) {
            Alert.alert(
              t('data.delete.error_title'),
              err instanceof Error ? err.message : t('data.delete.error_generic'),
            );
          }
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
        <Text style={{ fontSize: 18, fontWeight: '600', color: LB.ink }}>{t('data.title')}</Text>
      </View>
      <ScrollView contentContainerStyle={{ padding: 22, gap: 18 }}>
        <Section title={t('data.export.title')} body={t('data.export.body')}>
          <Btn full onPress={onExport} disabled={exporting}>
            {exporting ? t('data.export.loading') : t('data.export.cta')}
          </Btn>
        </Section>
        <Section title={t('data.delete.title')} body={t('data.delete.body')}>
          <Btn full variant="danger" onPress={onDelete}>
            {t('data.delete.cta')}
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
