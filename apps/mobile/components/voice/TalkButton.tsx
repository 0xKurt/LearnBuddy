// Conversation mode's entry: a filled round waveform button inside the
// composer pill, right end — the size and mark she knows from the assistants
// she uses (owner feedback 2026-09-28: waveform, not headphones; inside, not
// bigger than the rest). Background on the inner View, never on the
// Pressable (RN drops it silently there).

import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';

import { LB } from '../../lib/theme/colors.js';
import { Icon } from '../lb/Icon.js';

export function TalkButton({ onPress }: { onPress: () => void }) {
  const { t } = useTranslation('buddy');
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={t('talk.open')}
      hitSlop={6}
    >
      {({ pressed }) => (
        <View
          style={{
            width: 40,
            height: 40,
            borderRadius: 20,
            backgroundColor: LB.primary,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: pressed ? 0.85 : 1,
            transform: [{ scale: pressed ? 0.96 : 1 }],
          }}
        >
          <Icon name="voice" size={24} color={LB.paper} />
        </View>
      )}
    </Pressable>
  );
}
