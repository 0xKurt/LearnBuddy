// Buddy's voice, chosen like a ringtone in the phone's own settings (issue #526): a list, one row
// per voice — its name and how it sounds, a tick on the one she has — and beside every row its
// own round button that only plays a sample (and stops it). Listening and choosing are two
// things now: a tap on the row chooses the voice (PATCH /buddy/settings with the version it was
// based on) and plays nothing; a tap on the sound button plays (POST /voice/speech with the voice
// to try, her settings untouched) and chooses nothing. Before, one tap did both, so whoever only
// wanted to hear one changed the setting every time (owner 09.10.).
//
// Only shown where the voices can be told apart: the server says so up front
// (`natural_voice`, issue #526). Without Buddy's own voices the phone's voice would read every
// sample alike, and a choice that makes no difference is no choice — so the setup leaves the step
// out and the settings leave the group out (owner 10.10.). The same component in the setup and in
// the settings (same action → same component).

import {
  VOICE_NAMES,
  type BuddySettingsView,
  type VoiceName,
} from '@learnbuddy/shared-types/contracts';
import { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { ApiError } from '../../lib/api/client.js';
import { updateSettings } from '../../lib/api/endpoints.js';
import { keys, queryClient } from '../../lib/api/queries.js';
import { messageFor } from '../../lib/errors.js';
import { speak, stop } from '../../lib/speech/listen.js';
import { useBuddyVoice } from '../../lib/speech/useBuddyVoice.js';
import { voiceStore } from '../../lib/speech/voiceState.js';
import { RHYTHM, SPACE } from '../../lib/theme/space.js';
import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { TYPE } from '../../lib/theme/type.js';
import { Btn } from '../lb/Btn.js';
import { CircleBtn } from '../lb/CircleBtn.js';
import { Icon } from '../lb/Icon.js';
import { toast } from '../lb/Toast.js';

/** The tick on the chosen voice. */
const TICK = 20;

export function VoicePicker({ settings }: { settings: BuddySettingsView }) {
  const { palette } = useTheme();
  const { t, i18n } = useTranslation('buddy');
  // Shown at once; back to what the server has when saving fails.
  const [chosen, setChosen] = useState<VoiceName>(settings.voice);
  const [saving, setSaving] = useState(false);
  const inFlight = useRef(false);
  /** The voice whose sample is on its way or playing: its button is the way to stop it. */
  const [playing, setPlaying] = useState<VoiceName | null>(null);
  const sample = t('voice_pick.sample');
  const voice = useBuddyVoice();

  useEffect(() => setChosen(settings.voice), [settings.voice]);
  // The sample stops when she leaves (anything else being read goes on).
  useEffect(
    () => () => {
      if (voiceStore.get().text === sample) stop();
    },
    [sample],
  );
  /**
   * Plays one voice's sample, or stops it. The button follows the reading: back to "play" when
   * it ends, fails, is stopped, or another sample (or anything else) takes the voice over.
   */
  function listen(name: VoiceName) {
    if (playing === name) {
      stop();
      return;
    }
    setPlaying(name);
    void speak(sample, i18n.language, {
      voice: name,
      onEnd: () => setPlaying((now) => (now === name ? null : now)),
    });
  }

  async function choose(name: VoiceName) {
    if (name === chosen || inFlight.current) return;
    inFlight.current = true;
    setSaving(true);
    setChosen(name);
    try {
      const version =
        queryClient.getQueryData<BuddySettingsView>(keys.settings)?.version ?? settings.version;
      const next = await updateSettings({ voice: name, version });
      queryClient.setQueryData(keys.settings, next);
      setChosen(next.voice);
    } catch (err) {
      setChosen(settings.voice);
      toast.show(messageFor(err), 'error');
      if (err instanceof ApiError && err.code === 'stale') {
        await queryClient.invalidateQueries({ queryKey: keys.settings });
      }
    } finally {
      inFlight.current = false;
      setSaving(false);
    }
  }

  return (
    <View style={{ gap: RHYTHM.parts }}>
      <View
        accessibilityRole="radiogroup"
        accessibilityLabel={t('voice_pick.label')}
        style={{ gap: SPACE.sm, opacity: saving ? 0.85 : 1 }}
      >
        {VOICE_NAMES.map((name) => {
          const isChosen = name === chosen;
          const title = t(`voice_pick.name.${name}`);
          return (
            <View key={name} style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.sm }}>
              <View style={{ flex: 1 }}>
                <Btn
                  full
                  size="sm"
                  variant={isChosen ? 'soft' : 'outline'}
                  selected={isChosen}
                  disabled={saving && !isChosen}
                  accessibilityHint={t('voice_pick.choose_hint')}
                  onPress={() => void choose(name)}
                  label={
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.sm }}>
                      <View style={{ flex: 1 }}>
                        <Text style={[TYPE.label, { color: palette.ink }]}>{title}</Text>
                        <Text style={[TYPE.small, { color: palette.ink2 }]}>
                          {t(`voice_pick.about.${name}`)}
                        </Text>
                      </View>
                      {isChosen ? (
                        <Icon name="check" size={TICK} color={palette.primaryDk} />
                      ) : null}
                    </View>
                  }
                >
                  {title}
                </Btn>
              </View>
              <CircleBtn
                icon={playing === name ? 'stop' : 'speak'}
                onPress={() => listen(name)}
                accessibilityLabel={
                  playing === name
                    ? t('voice_pick.stop_label')
                    : t('voice_pick.play_label', { name: title })
                }
              />
            </View>
          );
        })}
      </View>
      {playing !== null && voice.text === sample && voice.phase === 'loading' ? (
        // The natural voice synthesises on the server, and seconds of silence read as "nothing
        // is coming" (user feedback 2026-09-28).
        <Text
          accessibilityLiveRegion="polite"
          style={[TYPE.small, { color: palette.ink2, paddingHorizontal: SPACE.xs }]}
        >
          {t('voice_pick.loading')}
        </Text>
      ) : null}
    </View>
  );
}
