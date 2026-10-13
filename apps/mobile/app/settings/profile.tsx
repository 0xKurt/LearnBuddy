// Actual Profile settings page (ui_kits/app/Extra.jsx `Profile`). The separate /profile route
// still owns onboarding.
import { Redirect, router, usePathname } from 'expo-router';
import { ScrollView } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Screen } from '../../components/lb/Screen.js';
import { ProfilePage } from '../../components/settings/ProfilePage.js';
import { SettingsPending } from '../../components/settings/SettingsPage.js';
import { useMe } from '../../lib/api/queries.js';
import { SPACE } from '../../lib/theme/space.js';
import { useRouteFocused } from '../../lib/useRouteFocused.js';

export default function ProfileSettingsScreen() {
  const { t } = useTranslation('settings');
  const me = useMe();
  const active = useRouteFocused();
  const pathname = usePathname();
  const title = t('profile.page_title');
  if (!me.data) return <SettingsPending title={title} queries={[me]} />;
  if (!me.data.account || !me.data.learner) return <Redirect href="/" />;
  return (
    <Screen
      title={title}
      back
      // The design's Profile leads back to the settings (ui_kits/app/App.jsx:103).
      leading={{ icon: 'back', onPress: () => router.dismissTo('/settings') }}
    >
      <ScrollView
        testID="scroll-list"
        contentContainerStyle={{
          paddingHorizontal: SPACE.gutter,
          paddingTop: SPACE.md,
          paddingBottom: SPACE.xxl,
          gap: SPACE.lg,
        }}
      >
        <ProfilePage
          learner={me.data.learner}
          account={me.data.account}
          active={active}
          pinActive={pathname === '/pin'}
          onOpenSubject={(id) => router.push({ pathname: '/subject/[id]', params: { id } })}
        />
      </ScrollView>
    </Screen>
  );
}
