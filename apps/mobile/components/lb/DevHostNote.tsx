// A dev build that talks to a real backend must say so on screen (issue #79 Punkt 4:
// "ein Testlauf auf echten Daten sollte man sehen" — the dev client on the phone points
// at production by design, and that must never be mistaken for a local run). Dev only:
// a release build never renders this (`__DEV__` is false there, and the walkthrough
// exports production bundles). The colour is deliberately outside the calm design
// tokens — this is a diagnostic warning marker, not product UI.
//
// It sits at the TOP and leaves again by itself (issue #103): pinned to the bottom it
// landed exactly on the composer and covered the input field — the owner read it as a
// cut-off text box. A start-up notice has to be seen once, not forever, so it fades after
// a few seconds and the screen belongs to the learner again.

import { useEffect, useState } from 'react';
import { Text } from 'react-native';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { HEADER_HEIGHT } from '../buddy/Header.js';
import { ENV } from '../../lib/env.js';
import { fadeIn, fadeOut } from '../../lib/theme/enter.js';
import { RADIUS } from '../../lib/theme/radius.js';
import { SPACE } from '../../lib/theme/space.js';

declare const __DEV__: boolean;

/** localhost, 127.0.0.1 and the Android emulator's host loopback are this machine. */
const LOCAL = /^http:\/\/(localhost|127\.0\.0\.1|10\.0\.2\.2)(:\d+)?$/;

/** Long enough to read the host while the app settles, short enough to stay out of the way. */
const SHOWN_MS = 6000;

export function DevHostNote() {
  const insets = useSafeAreaInsets();
  const [gone, setGone] = useState(false);
  const dev = typeof __DEV__ !== 'undefined' && __DEV__;
  const remote = dev && !LOCAL.test(ENV.API_URL);
  useEffect(() => {
    if (!remote) return;
    const t = setTimeout(() => setGone(true), SHOWN_MS);
    return () => clearTimeout(t);
  }, [remote]);
  if (!remote || gone) return null;
  const host = ENV.API_URL.replace(/^https?:\/\//, '');
  return (
    <Animated.View
      entering={fadeIn()}
      exiting={fadeOut()}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        position: 'absolute',
        // UNDER the head, not in it. The bottom is where the composer lives (issue #103),
        // and the top band is Buddy, his name and ⋯ since #174 — at the left edge this lay
        // straight across the orb, the same fault as #137 one head later. Below the band
        // nothing is a control, it touches nothing (pointerEvents none) and it leaves by
        // itself after six seconds.
        top: insets.top + HEADER_HEIGHT,
        left: SPACE.lg,
        backgroundColor: 'rgba(178,58,58,0.92)',
        borderRadius: RADIUS.round,
        // token-exempt: developer's note, tiny on purpose; never in a release build
        paddingHorizontal: 9,
        paddingVertical: 2, // token-exempt: the same tiny developer's note
      }}
    >
      {/* token-exempt: tiny on purpose, the developer's note is no part of the design */}
      <Text style={{ color: '#ffffff', fontSize: 10, fontWeight: '700' }}>
        {`Dev-Build → ${host}`}
      </Text>
    </Animated.View>
  );
}
