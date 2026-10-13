// Actual Profile settings page. The separate /profile route still owns onboarding.
import { Redirect, router, useLocalSearchParams, useNavigation, usePathname } from 'expo-router';
import { ScrollView } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Screen } from '../../components/lb/Screen.js';
import { LoadFailed } from '../../components/lb/LoadFailed.js';
import { SettingsSkeleton } from '../../components/lb/Skeletons.js';
import { ProfilePage, type ProfileEditor } from '../../components/settings/ProfilePage.js';
import { useMe } from '../../lib/api/queries.js';
import { SPACE } from '../../lib/theme/space.js';
import { useRouteFocused } from '../../lib/useRouteFocused.js';

export default function ProfileSettingsScreen() {
  const { t } = useTranslation(['settings', 'auth']);
  const me = useMe();
  const active = useRouteFocused();
  const pathname = usePathname();
  const navigation = useNavigation();
  const params = useLocalSearchParams<{ editor?: string }>();
  const editor: ProfileEditor =
    params.editor === 'language' || params.editor === 'region' ? params.editor : null;
  const title =
    editor === 'language'
      ? t('settings:profile.language_title')
      : editor === 'region'
        ? t('auth:region.title_child')
        : t('settings:profile.page_title');
  function editorBack() {
    const state = navigation.getState();
    const previous = state?.routes[(state.index ?? state.routes.length - 1) - 1];
    if (previous?.name === 'settings/profile' && router.canGoBack()) router.back();
    else router.replace('/settings/profile');
  }
  const frame = {
    title,
    back: true,
    leading: {
      icon: 'back' as const,
      onPress: editor ? editorBack : () => router.dismissTo('/settings'),
    },
  };
  if (!me.data && me.error)
    return (
      <Screen {...frame} state="think">
        <LoadFailed error={me.error} onRetry={() => void me.refetch()} />
      </Screen>
    );
  if (!me.data)
    return (
      <Screen {...frame} state="think">
        <SettingsSkeleton label={t('common:loading')} />
      </Screen>
    );
  if (!me.data.account || !me.data.learner) return <Redirect href="/" />;
  return (
    <Screen {...frame}>
      <ScrollView
        testID="scroll-list"
        contentContainerStyle={{
          paddingHorizontal: SPACE.lg,
          paddingTop: SPACE.md,
          paddingBottom: SPACE.xxl,
          gap: SPACE.lg,
        }}
      >
        <ProfilePage
          learner={me.data.learner}
          account={me.data.account}
          editor={editor}
          active={active}
          pinActive={pathname === '/pin'}
          onEdit={(next) =>
            router.push({ pathname: '/settings/profile', params: { editor: next } })
          }
          onOpenSubject={(id) => router.push({ pathname: '/subject/[id]', params: { id } })}
        />
      </ScrollView>
    </Screen>
  );
}
