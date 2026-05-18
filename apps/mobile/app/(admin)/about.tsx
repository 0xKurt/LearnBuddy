// About. Doc 05 §about. Static info + links.

import * as Application from 'expo-application';
import { Redirect } from 'expo-router';
import { Linking, ScrollView, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Btn, CircleBtn } from '../../components/lb/index.js';
import { useNavigateUp } from '../../lib/navigation/hierarchy.js';
import { useAppStore } from '../../lib/store/index.js';
import { LB } from '../../lib/theme/colors.js';

export default function AboutScreen() {
  const { t } = useTranslation('admin');
  const navigateUp = useNavigateUp();
  const unlocked = useAppStore((s) => s.admin_unlocked);
  if (!unlocked) return <Redirect href="/(admin)/unlock" />;

  const version = Application.nativeApplicationVersion ?? '0.0.0';
  const build = Application.nativeBuildVersion ?? '—';

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
        <CircleBtn icon="back" onPress={navigateUp} />
        <Text style={{ fontSize: 18, fontWeight: '600', color: LB.ink }}>{t('about.title')}</Text>
      </View>
      <ScrollView contentContainerStyle={{ padding: 22, gap: 18 }}>
        <Card title={t('about.version')}>
          <Text style={{ fontSize: 14, color: LB.ink }}>
            {version} ({build})
          </Text>
        </Card>
        <Card title={t('about.privacy_title')}>
          <Text style={{ fontSize: 13, color: LB.ink2, lineHeight: 19 }}>
            {t('about.privacy_body')}
          </Text>
          <Btn
            variant="ghost"
            onPress={() => Linking.openURL('https://learnbuddy.app/datenschutz')}
          >
            {t('about.privacy_link')}
          </Btn>
        </Card>
        <Card title={t('about.imprint_title')}>
          <Btn variant="ghost" onPress={() => Linking.openURL('https://learnbuddy.app/impressum')}>
            {t('about.imprint_link')}
          </Btn>
        </Card>
        <Card title={t('about.support_title')}>
          <Btn variant="ghost" onPress={() => Linking.openURL('mailto:support@learnbuddy.app')}>
            {t('about.support_contact')}
          </Btn>
          <Btn
            variant="ghost"
            onPress={() =>
              Linking.openURL(process.env.EXPO_PUBLIC_FAQ_URL ?? 'https://learnbuddy.app/help')
            }
          >
            {t('about.support_faq')}
          </Btn>
        </Card>
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
        gap: 8,
      }}
    >
      <Text style={{ fontSize: 14, fontWeight: '600', color: LB.ink }}>{title}</Text>
      {children}
    </View>
  );
}
