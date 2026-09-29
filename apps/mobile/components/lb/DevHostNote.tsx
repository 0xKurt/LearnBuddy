// A dev build that talks to a real backend must say so on screen (issue #79 Punkt 4:
// "ein Testlauf auf echten Daten sollte man sehen" — the dev client on the phone points
// at production by design, and that must never be mistaken for a local run). Dev only:
// a release build never renders this (`__DEV__` is false there, and the walkthrough
// exports production bundles). The colour is deliberately outside the calm design
// tokens — this is a diagnostic warning marker, not product UI.

import { Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ENV } from '../../lib/env.js';

declare const __DEV__: boolean;

/** localhost, 127.0.0.1 and the Android emulator's host loopback are this machine. */
const LOCAL = /^http:\/\/(localhost|127\.0\.0\.1|10\.0\.2\.2)(:\d+)?$/;

export function DevHostNote() {
  const insets = useSafeAreaInsets();
  if (typeof __DEV__ === 'undefined' || !__DEV__) return null;
  if (LOCAL.test(ENV.API_URL)) return null;
  const host = ENV.API_URL.replace(/^https?:\/\//, '');
  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        position: 'absolute',
        bottom: insets.bottom + 2,
        alignSelf: 'center',
        backgroundColor: 'rgba(178,58,58,0.92)',
        borderRadius: 999,
        paddingHorizontal: 9,
        paddingVertical: 2,
      }}
    >
      <Text style={{ color: '#ffffff', fontSize: 10, fontWeight: '700' }}>
        {`Dev-Build → ${host}`}
      </Text>
    </View>
  );
}
