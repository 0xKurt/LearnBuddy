// "Sprachmodus an/aus" in a screen header: a round 44 pt switch with the
// headphones icon. On, it is filled and carries a small check badge (not only
// a colour change); switching it on explains in one line what changes.
// Switching it off stops whatever is being read aloud.

import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';

import { stop as stopListening } from '../../lib/speech/listen.js';
import { useVoiceMode } from '../../lib/speech/voiceMode.js';
import { LB } from '../../lib/theme/colors.js';
import { Icon } from '../lb/Icon.js';
import { toast } from '../lb/Toast.js';

export function VoiceModeToggle() {
  const { t } = useTranslation('common');
  const on = useVoiceMode((s) => s.on);
  const setOn = useVoiceMode((s) => s.setOn);

  function press(): void {
    const next = !on;
    setOn(next);
    if (next) toast.show(t('voice.mode_on'), 'info');
    else stopListening();
  }

  return (
    <Pressable
      onPress={press}
      accessibilityRole="switch"
      accessibilityLabel={t('voice.mode')}
      accessibilityHint={t('voice.mode_hint')}
      // aria-checked (not accessibilityState) so the web build says it too.
      aria-checked={on}
      hitSlop={4}
      style={{ borderRadius: 22 }}
    >
      {({ pressed }) => (
        <View
          style={{
            width: 44,
            height: 44,
            borderRadius: 22,
            backgroundColor: on ? LB.primary : '#fff',
            borderColor: on ? LB.primary : LB.hairline,
            borderWidth: 1,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: pressed ? 0.78 : 1,
          }}
        >
          <Icon name="headphones" size={21} color={on ? '#fff' : LB.ink} />
          {on ? (
            <View
              style={{
                position: 'absolute',
                right: -3,
                top: -3,
                width: 18,
                height: 18,
                borderRadius: 9,
                backgroundColor: '#fff',
                borderWidth: 1,
                borderColor: LB.primary,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Icon name="check" size={12} color={LB.primaryDk} />
            </View>
          ) : null}
        </View>
      )}
    </Pressable>
  );
}
