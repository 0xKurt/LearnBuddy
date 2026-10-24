// One recording status: elapsed time, actual maximum and an optional rehearsal target.
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import { formatClock } from '../../lib/speech/voice.js';
import { circle } from '../../lib/theme/radius.js';
import { SPACE } from '../../lib/theme/space.js';
import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { TYPE } from '../../lib/theme/type.js';
import { VOICE } from '../../lib/theme/voice.js';

/** "Ich höre mit … 0:07 / 0:30", read by a screen reader as "Aufnahme läuft, 0:07 von 0:30". */
export function RecordingStatus({
  elapsedMs,
  maxMs,
  targetMs,
}: {
  elapsedMs: number;
  maxMs: number | null;
  targetMs?: number;
}) {
  const { palette } = useTheme();
  const { t } = useTranslation('common');
  const time = formatClock(elapsedMs);
  const max = maxMs === null ? '' : formatClock(maxMs);
  const target =
    targetMs === undefined ? '' : ` · ${t('voice.target', { target: formatClock(targetMs) })}`;
  return (
    <View
      accessible
      accessibilityLabel={
        t(maxMs === null ? 'voice.recording_open_value' : 'voice.recording_value', { time, max }) +
        target
      }
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
      <Text style={TYPE.voiceStatus}>
        {t(maxMs === null ? 'voice.recording_open' : 'voice.recording', { time, max }) + target}
      </Text>
    </View>
  );
}
