// PROTOTYPE (issue #312) — not for merge.
//
// react-native-gifted-charts 1.4.80 reads `Platform.constants.reactNativeVersion` when its module
// loads; react-native-web 0.21 has no `Platform.constants`, so the import alone throws on the web
// and takes the whole bundle down. This fills in the one field it reads, before it is imported.
// A production adoption would carry this as a pnpm patch of the library instead.

import { Platform } from 'react-native';

type WithConstants = { constants?: { reactNativeVersion?: object } };
const platform = Platform as unknown as WithConstants;
if (Platform.OS === 'web' && !platform.constants?.reactNativeVersion) {
  platform.constants = {
    ...platform.constants,
    reactNativeVersion: { major: 0, minor: 81, patch: 5 },
  };
}
