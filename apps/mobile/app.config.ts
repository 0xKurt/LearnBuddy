// The dev build lives beside the real app on the same phone: its own application id, its
// own name. `APP_VARIANT=development` comes from eas.json (development profile) — without
// it this file passes app.json through untouched, so `expo start`, the preview and
// production builds see exactly the static config.
import type { ConfigContext, ExpoConfig } from 'expo/config';

const DEV = process.env.APP_VARIANT === 'development';

export default ({ config }: ConfigContext): ExpoConfig => {
  const base = config as ExpoConfig;
  if (!DEV) return base;
  return {
    ...base,
    name: 'LearnBuddy Dev',
    android: {
      ...base.android,
      package: 'com.learnbuddy.app.dev',
      // google-services.json has no client for the .dev package and the FCM Gradle plugin
      // fails the build over it. Push in dev builds comes back once Firebase has an Android
      // app "com.learnbuddy.app.dev" and the downloaded file carries both clients
      // (lib/push.ts already treats a device without push as "not possible", never a crash).
      googleServicesFile: undefined,
    },
    ios: {
      ...base.ios,
      bundleIdentifier: 'com.learnbuddy.app.dev',
    },
  };
};
