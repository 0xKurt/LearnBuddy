// The dev build lives beside the real app on the same phone: its own application id, its
// own name. `APP_VARIANT=development` comes from eas.json (development profile) — without
// it this file passes app.json through untouched, so `expo start`, the preview and
// production builds see exactly the static config.
import type { ConfigContext, ExpoConfig } from 'expo/config';

const DEV = process.env.APP_VARIANT === 'development';

// Where the build should upload its source maps. Build-time only (never EXPO_PUBLIC_*, so
// nothing of it lands in the bundle) and set by the owner in EAS; empty is the normal
// state and simply leaves the plugin out (issue #36). Whether crash reports run at all is
// a separate switch — `EXPO_PUBLIC_SENTRY_DSN`, read in lib/env.ts. The native SDK is
// linked either way, so the dev client does not need rebuilding when the DSN arrives;
// only readable stack traces need this plugin and therefore a build with it set.
const SENTRY_ORG = process.env.SENTRY_ORG ?? '';
const SENTRY_PROJECT = process.env.SENTRY_PROJECT ?? '';

type Plugin = NonNullable<ExpoConfig['plugins']>[number];

function withSentry(base: ExpoConfig): ExpoConfig {
  if (!SENTRY_ORG || !SENTRY_PROJECT) return base;
  const sentry: Plugin = [
    '@sentry/react-native/expo',
    // Sentry's EU region, hardcoded like the DSN check in lib/env.ts: source maps carry
    // our file and function names and belong in the same place as the reports
    // (docs/privacy.md §Processors). An EU organisation cannot upload via sentry.io at all.
    { url: 'https://de.sentry.io/', organization: SENTRY_ORG, project: SENTRY_PROJECT },
  ];
  return { ...base, plugins: [...(base.plugins ?? []), sentry] };
}

export default ({ config }: ConfigContext): ExpoConfig => {
  const base = withSentry(config as ExpoConfig);
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
