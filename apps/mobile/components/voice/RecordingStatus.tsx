// The one line that says a recording runs: a dot and "Ich höre mit … 0:07 / 0:30", on the
// pronunciation recorder (`SpeakPanel`). The dot stands still (#599): only the orb moves by
// itself (HANDOFF §4), and the design shows a running recording with words alone
// (ui_kits/app/Flows.jsx:111, Gaps.jsx:135) — the running time is what shows that it runs.

import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import { formatClock } from '../../lib/speech/voice.js';
import { circle } from '../../lib/theme/radius.js';
import { SPACE } from '../../lib/theme/space.js';
import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { TYPE } from '../../lib/theme/type.js';
import { VOICE } from '../../lib/theme/voice.js';

/** "Ich höre mit … 0:07 / 0:30", read by a screen reader as "Aufnahme läuft, 0:07 von 0:30". */
export function RecordingStatus({ elapsedMs, maxMs }: { elapsedMs: number; maxMs: number }) {
  const { palette } = useTheme();
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
      <View
        testID="recording-dot"
        style={{
          width: VOICE.dot.size,
          height: VOICE.dot.size,
          borderRadius: circle(VOICE.dot.size),
          backgroundColor: palette.primary,
        }}
      />
      <Text style={TYPE.voiceStatus}>{t('speak.recording', { time, max })}</Text>
    </View>
  );
}
