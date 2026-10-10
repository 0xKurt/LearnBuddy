// The one line that says a recording runs: a pulsing dot and "Ich höre mit … 0:07 / 0:30". The
// pronunciation recorder (`SpeakPanel`) and the rehearsal card in the chat (`RehearseCard`, issue
// #264) show the same line — one component, so a recording looks the same wherever it runs.

import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Animated, Easing, Platform, Text, View } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';

import { formatClock } from '../../lib/speech/voice.js';
import { circle } from '../../lib/theme/radius.js';
import { SPACE } from '../../lib/theme/space.js';
import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { TYPE } from '../../lib/theme/type.js';

/** The pulsing dot while she speaks. */
const REC_DOT = 12;
/** token-exempt: the line keeps the dot's row height while the text changes */
const ROW_MIN = 24;

function RecordingDot() {
  const { palette } = useTheme();
  const pulse = useRef(new Animated.Value(1)).current;
  // Reactive: toggling "reduce motion" while the app runs stops the dot too.
  const still = useReducedMotion();

  useEffect(() => {
    if (still) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 0.35,
          duration: 700,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: Platform.OS !== 'web',
        }),
        Animated.timing(pulse, {
          toValue: 1,
          duration: 700,
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
        width: REC_DOT,
        height: REC_DOT,
        borderRadius: circle(REC_DOT),
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
      style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.sm, minHeight: ROW_MIN }}
    >
      <RecordingDot />
      <Text style={[TYPE.body, { fontWeight: '600' }]}>{t('speak.recording', { time, max })}</Text>
    </View>
  );
}
