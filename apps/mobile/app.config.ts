// The dev build lives beside the real app on the same phone: its own application id, its
// own name. `APP_VARIANT=development` comes from eas.json (development profile) — without
// it this file passes app.json through untouched, so `expo start`, the preview and
// production builds see exactly the static config.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { ConfigContext, ExpoConfig } from 'expo/config';

const DEV = process.env.APP_VARIANT === 'development';
const DEV_ID = 'com.learnbuddy.app.dev';

type FirebaseFile = {
  client?: { client_info?: { android_client_info?: { package_name?: string } } }[];
};

/** Whether a google-services.json carries an Android client for this application id. */
function hasFirebaseClient(file: string, applicationId: string): boolean {
  try {
    const json = JSON.parse(readFileSync(file, 'utf8')) as FirebaseFile;
    return (json.client ?? []).some(
      (c) => c.client_info?.android_client_info?.package_name === applicationId,
    );
  } catch {
    return false;
  }
}

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

export default ({ config, projectRoot }: ConfigContext): ExpoConfig => {
  const base = withSentry(config as ExpoConfig);
  if (!DEV) return base;
  const firebase = base.android?.googleServicesFile;
  return {
    ...base,
    name: 'LearnBuddy Dev',
    android: {
      ...base.android,
      package: DEV_ID,
      // The FCM Gradle plugin fails the build when google-services.json has no client for the
      // .dev package, and without FCM the dev client gets no push token (#677). The file is
      // kept once Firebase has an Android app "com.learnbuddy.app.dev" and the downloaded file
      // carries both clients; until then it is left out (lib/push.ts treats a device without
      // push as "not possible", never a crash).
      googleServicesFile:
        firebase && hasFirebaseClient(join(projectRoot, firebase), DEV_ID) ? firebase : undefined,
    },
    ios: {
      ...base.ios,
      bundleIdentifier: DEV_ID,
    },
  };
};
