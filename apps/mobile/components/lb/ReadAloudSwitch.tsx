// "Vorlesen" (issue #386): the one switch for Buddy reading aloud — in the chat's head and in the
// head of every practice screen, the same component in the same place (CLAUDE.md rule 19). Before
// #386 practice had its own switch with headphones beside the chat's speaker, for one function.
//
// It came back to the chat's head with #181 after #52 had taken out a speaker with no state ("wozu
// ist der eigentlich da"): this one answers that. The SHAPE says which way it is (struck through
// when off), never the colour alone, and it is a switch, so a screen reader says it too. It is the
// one setting a child changes in the middle of working, so it costs one tap, not three.
//
// It shows whether Buddy reads aloud right now, which a conversation includes (`readsAloud`);
// off ends whatever is being read, and a conversation with it (lib/speech/voiceMode.ts).

import { useTranslation } from 'react-i18next';
import { Pressable } from 'react-native';

import { stop as stopSpeaking } from '../../lib/speech/listen.js';
import { readsAloud, useVoiceMode } from '../../lib/speech/voiceMode.js';
import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { SPACE, TOUCH } from '../../lib/theme/space.js';
import { Icon } from './Icon.js';

export function ReadAloudSwitch() {
  const { palette } = useTheme();
  const { t } = useTranslation('common');
  const on = useVoiceMode(readsAloud);
  const press = () => {
    useVoiceMode.getState().setReadAloud(!on);
    if (on) stopSpeaking();
  };
  return (
    <Pressable
      onPress={press}
      accessibilityRole="switch"
      accessibilityState={{ checked: on }}
      // aria-checked as well: the web build says it only from this.
      aria-checked={on}
      accessibilityLabel={t(on ? 'voice.read_aloud_on' : 'voice.read_aloud_off')}
      hitSlop={SPACE.sm}
      style={{
        width: TOUCH,
        height: TOUCH,
        alignItems: 'center',
        justifyContent: 'center',
        // token-exempt: circle, half its size
        borderRadius: TOUCH / 2,
      }}
    >
      {({ pressed }) => (
        <Icon
          name={on ? 'speak' : 'speak-off'}
          size={22}
          color={on ? palette.primaryDk : pressed ? palette.ink : palette.ink3}
        />
      )}
    </Pressable>
  );
}
