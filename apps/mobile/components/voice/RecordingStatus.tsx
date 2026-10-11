// The one line that says a recording runs: a pulsing dot and "Ich höre mit … 0:07 / 0:30". The
// pronunciation recorder (`SpeakPanel`) and the rehearsal card in the chat (`RehearseCard`, issue
// #264) show the same line — one component, so a recording looks the same wherever it runs.

import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Animated, Easing, Platform, Text, View } from 'react-native';
import { DURATION, useMotionReduced } from '../../lib/theme/motion.js';
import { VOICE } from '../../lib/theme/voice.js';

import { formatClock } from '../../lib/speech/voice.js';
import { circle } from '../../lib/theme/radius.js';
import { SPACE } from '../../lib/theme/space.js';
import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { TYPE } from '../../lib/theme/type.js';

function RecordingDot() {
  const { palette } = useTheme();
  const pulse = useRef(new Animated.Value(1)).current;
  // Reactive: toggling "reduce motion" while the app runs stops the dot too.
  const still = useMotionReduced();

  useEffect(() => {
    if (still) {
      pulse.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: VOICE.dot.lowOpacity,
          duration: DURATION.recordingPulse,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: Platform.OS !== 'web',
        }),
        Animated.timing(pulse, {
          toValue: 1,
          duration: DURATION.recordingPulse,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: Platform.OS !== 'web',
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse, still]);

  return (
    <Animated.View
      style={{
        width: VOICE.dot.size,
        height: VOICE.dot.size,
        borderRadius: circle(VOICE.dot.size),
        backgroundColor: palette.primary,
        opacity: still ? 1 : pulse,
      }}
    />
  );
}

/** "Ich höre mit … 0:07 / 0:30", read by a screen reader as "Aufnahme läuft, 0:07 von 0:30". */
export function RecordingStatus({ elapsedMs, maxMs }: { elapsedMs: number; maxMs: number }) {
  const { t } = useTranslation('practice');
  const time = formatClock(elapsedMs);
  const max = formatClock(maxMs);
  return (
    <View
      accessible
      accessibilityLabel={t('speak.recording_label', { time, max })}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: SPACE.sm,
        minHeight: VOICE.rowHeight,
      }}
    >
      <RecordingDot />
      <Text style={TYPE.voiceStatus}>{t('speak.recording', { time, max })}</Text>
    </View>
  );
}
