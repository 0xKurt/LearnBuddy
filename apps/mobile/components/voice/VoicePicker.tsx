// Buddy's voice, picked with a tap (ADR 0008 §Amendment): the small curated set as four
// choices. A tap plays a short sample in that voice (POST /voice/speech with the voice to try,
// her settings untouched) and chooses it (PATCH /buddy/settings with the version it was based
// on). The same component in the setup and in the settings (same action → same component).
//
// Honest about what she hears: when Buddy's own voice is not available on this phone (not
// configured, offline, a language it lacks), the phone's voice reads the sample — then all
// four sound alike, and a short line says so instead of pretending a difference.

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
import { LB } from '../../lib/theme/colors.js';
import { TYPE } from '../../lib/theme/type.js';
import { Btn } from '../lb/Btn.js';
import { toast } from '../lb/Toast.js';

/** Two rows of two: short enough for a 360 pt phone, big enough to tap. */
const ROWS: VoiceName[][] = [VOICE_NAMES.slice(0, 2), VOICE_NAMES.slice(2, 4)];

export function VoicePicker({ settings }: { settings: BuddySettingsView }) {
  const { t, i18n } = useTranslation('buddy');
  // Shown at once; back to what the server has when saving fails.
  const [chosen, setChosen] = useState<VoiceName>(settings.voice);
  const [saving, setSaving] = useState(false);
  const inFlight = useRef(false);
  const [phoneVoice, setPhoneVoice] = useState(false);
  /** The tile whose sample is on its way: the natural voice synthesises on the
      server, and seconds of silence read as "nothing is coming" (user feedback
      2026-09-28) — so the tapped tile shows it is working. */
  const [previewing, setPreviewing] = useState<VoiceName | null>(null);
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
  useEffect(() => {
    if (voice.text === sample && voice.source === 'device') setPhoneVoice(true);
    if (voice.text === sample && voice.source === 'natural') setPhoneVoice(false);
    // The sample started (or reading ended another way): the tile stops waiting.
    if (voice.text === sample && voice.phase !== 'loading') setPreviewing(null);
  }, [voice.text, voice.source, voice.phase, sample]);
  // Sound may never come at all (muted, refused): the wait must not stick forever.
  useEffect(() => {
    if (!previewing) return;
    const give = setTimeout(() => setPreviewing(null), 8000);
    return () => clearTimeout(give);
  }, [previewing]);

  async function choose(name: VoiceName) {
    setPreviewing(name);
    void speak(sample, i18n.language, { voice: name });
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
    <View style={{ gap: 10 }}>
      <View
        accessibilityRole="radiogroup"
        accessibilityLabel={t('voice_pick.label')}
        style={{ gap: 8, opacity: saving ? 0.85 : 1 }}
      >
        {ROWS.map((row) => (
          <View key={row.join()} style={{ flexDirection: 'row', gap: 8 }}>
            {row.map((name) => (
              <View key={name} style={{ flex: 1 }}>
                <Btn
                  full
                  pill
                  size="sm"
                  icon="speak"
                  variant={name === chosen ? 'primary' : 'outline'}
                  selected={name === chosen}
                  busy={previewing === name}
                  disabled={saving && name !== chosen}
                  accessibilityHint={t('voice_pick.tap_hint')}
                  onPress={() => void choose(name)}
                >
                  {t(`voice_pick.name.${name}`)}
                </Btn>
              </View>
            ))}
          </View>
        ))}
      </View>
      {previewing ? (
        <Text
          accessibilityLiveRegion="polite"
          style={[TYPE.small, { color: LB.ink2, paddingHorizontal: 4 }]}
        >
          {t('voice_pick.loading')}
        </Text>
      ) : phoneVoice ? (
        <Text style={[TYPE.small, { color: LB.ink2, paddingHorizontal: 4 }]}>
          {t('voice_pick.phone_voice')}
        </Text>
      ) : null}
    </View>
  );
}
