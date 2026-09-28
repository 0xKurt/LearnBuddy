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

/** The App Store id, once there is a published iOS app (app.json extra). */
function appStoreId(): string | null {
  const id = (Constants.expoConfig?.extra as { appStoreId?: unknown } | undefined)?.appStoreId;
  return typeof id === 'string' && /^\d+$/.test(id) ? id : null;
}

/** Where this build's update comes from — null while a store page is missing. */
function storeUrls(): [string, string] | null {
  if (Platform.OS === 'android') {
    const id = Constants.expoConfig?.android?.package ?? ANDROID_PACKAGE;
    return [`market://details?id=${id}`, `https://play.google.com/store/apps/details?id=${id}`];
  }
  const id = appStoreId();
  return id
    ? [`itms-apps://apps.apple.com/app/id${id}`, `https://apps.apple.com/app/id${id}`]
    : null;
}

function openStore(): void {
  const urls = storeUrls();
  if (!urls) return;
  void Linking.openURL(urls[0]).catch(() => Linking.openURL(urls[1]));
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
            // Only where an update can really be fetched: a button that opens
            // nothing would be a stub (CLAUDE.md rule 12).
            storeUrls() ? (
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
