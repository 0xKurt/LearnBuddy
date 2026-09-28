// The API refuses this build (426 update_required, apps/api/src/app.ts): a calm
// blocking screen instead of an app that silently retries forever. No back button:
// every request would answer the same until the app is newer.

import Constants from 'expo-constants';
import { Linking, Platform, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Btn } from '../components/lb/Btn.js';
import { EmptyState } from '../components/lb/EmptyState.js';
import { Screen } from '../components/lb/Screen.js';

const ANDROID_PACKAGE = 'com.learnbuddy.app';

function openStore(): void {
  const id = Constants.expoConfig?.android?.package ?? ANDROID_PACKAGE;
  void Linking.openURL(`market://details?id=${id}`).catch(() =>
    Linking.openURL(`https://play.google.com/store/apps/details?id=${id}`),
  );
}

export default function UpdateRequired() {
  const { t } = useTranslation(['common', 'errors']);
  return (
    <Screen>
      <View style={{ flex: 1, justifyContent: 'center' }}>
        <EmptyState
          orb
          title={t('common:update.title')}
          body={t('errors:code.update_required')}
          action={
            // iOS has no store page yet; the body names the App Store.
            Platform.OS === 'android' ? (
              <Btn pill center onPress={openStore}>
                {t('common:update.cta')}
              </Btn>
            ) : undefined
          }
        />
      </View>
    </Screen>
  );
}
