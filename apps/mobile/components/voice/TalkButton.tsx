// Conversation mode's entry: the one prominent round button at the composer's
// right, where she knows it from the assistants she has used (user feedback
// 2026-09-28). Filled violet, so it — not the dictation mic — reads as "talk
// with Buddy". Background on the inner View, never on the Pressable (RN drops
// it silently there).

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
      hitSlop={4}
    >
      {({ pressed }) => (
        <View
          style={{
            width: 52,
            height: 52,
            borderRadius: 26,
            backgroundColor: LB.primary,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: pressed ? 0.85 : 1,
            transform: [{ scale: pressed ? 0.96 : 1 }],
          }}
        >
          <Icon name="headphones" size={24} color={LB.paper} />
        </View>
      )}
    </Pressable>
  );
}
