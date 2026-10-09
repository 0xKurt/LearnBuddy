// Conversation mode's entry: a filled round waveform button inside the
// composer pill, right end — the size and mark she knows from the assistants
// she uses (owner feedback 2026-09-28: waveform, not headphones; inside, not
// bigger than the rest). Background on the inner View, never on the
// press target (RN drops it silently there).

import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { TOUCH } from '../../lib/theme/space.js';
import { Icon } from '../lb/Icon.js';
import { PressArea } from '../lb/PressArea.js';

export function TalkButton({ onPress }: { onPress: () => void }) {
  const { palette } = useTheme();
  const { t } = useTranslation('buddy');
  return (
    <PressArea
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={t('talk.open')}
      hitSlop={6}
    >
      {(pressed) => (
        <View
          style={{
            // TOUCH, like its neighbours in the pill: three sizes in one row put their
            // centres 4 pt apart, which is what the owner saw (issue #134).
            width: TOUCH,
            height: TOUCH,
            borderRadius: TOUCH / 2,
            backgroundColor: palette.primary,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: pressed ? 0.85 : 1,
            transform: [{ scale: pressed ? 0.96 : 1 }],
          }}
        >
          <Icon name="voice" size={24} color={palette.paper} />
        </View>
      )}
    </PressArea>
  );
}
