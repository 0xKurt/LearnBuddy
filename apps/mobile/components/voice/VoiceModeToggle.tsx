// "Sprachmodus an/aus" in a screen header (Buddy's home and practice): a round 44 pt
// switch with the speaker icon (the headphones stand for conversation mode). On, it is filled and carries a small check badge (not only
// a colour change); switching it names the new state in one line both ways — the icon
// alone left its purpose unclear (issue #52, docs/UX-PRINCIPLES.md §37: the user should
// understand what is happening). Switching it off stops whatever is being read aloud.

import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';

import { stop as stopListening } from '../../lib/speech/listen.js';
import { useVoiceMode } from '../../lib/speech/voiceMode.js';
import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { Icon } from '../lb/Icon.js';
import { toast } from '../lb/Toast.js';

export function VoiceModeToggle() {
  const { palette } = useTheme();
  const { t } = useTranslation('common');
  const on = useVoiceMode((s) => s.on);
  const setOn = useVoiceMode((s) => s.setOn);

  function press(): void {
    const next = !on;
    setOn(next);
    if (next) toast.show(t('voice.mode_on'), 'info');
    else {
      // "Ich lese dir vor …" is no longer true once it is off.
      toast.dismiss(t('voice.mode_on'));
      // Off is told in words too, not only by the icon losing its badge (issue #52).
      toast.show(t('voice.mode_off'), 'info');
      stopListening();
    }
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
            backgroundColor: on ? palette.primary : palette.paper,
            borderColor: on ? palette.primary : palette.hairline,
            borderWidth: 1,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: pressed ? 0.78 : 1,
          }}
        >
          <Icon name="speak" size={21} color={on ? palette.paper : palette.ink} />
          {on ? (
            <View
              style={{
                position: 'absolute',
                right: -3,
                top: -3,
                width: 18,
                height: 18,
                borderRadius: 9,
                backgroundColor: palette.paper,
                borderWidth: 1,
                borderColor: palette.primary,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Icon name="check" size={12} color={palette.primaryDk} />
            </View>
          ) : null}
        </View>
      )}
    </Pressable>
  );
}
