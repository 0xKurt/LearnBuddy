// "Stimme": how Buddy sounds, as a page of the settings (ui_kits/app/More.jsx `VoiceSettings`,
// #589) — the same picker as in the setup (components/voice/VoicePicker, ADR 0008 §Amendment).
// The orb in the head speaks while a sample is really playing, and thinks while it is fetched.
// Not there where Buddy's own voices are not (`natural_voice`, issue #526): the phone's voice
// would read every sample alike, and a choice without a difference is no choice.
import { Redirect } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { Screen } from '../../components/lb/Screen.js';
import {
  Hint,
  SETTINGS_BACK,
  SettingsBody,
  SettingsPending,
} from '../../components/settings/SettingsPage.js';
import { VoicePicker } from '../../components/voice/VoicePicker.js';
import { useSettings } from '../../lib/api/queries.js';
import { useBuddyVoice } from '../../lib/speech/useBuddyVoice.js';

export default function VoiceSettingsScreen() {
  const { t } = useTranslation('settings');
  const settings = useSettings();
  const voice = useBuddyVoice();
  const title = t('voice.title');
  if (!settings.data) return <SettingsPending title={title} queries={[settings]} />;
  if (!settings.data.natural_voice) return <Redirect href="/settings" />;
  return (
    <Screen
      title={title}
      state={voice.phase === 'speaking' ? 'speak' : voice.phase === 'loading' ? 'think' : 'idle'}
      leading={SETTINGS_BACK}
    >
      <SettingsBody>
        <Hint>{t('voice.question')}</Hint>
        <VoicePicker settings={settings.data} />
        <Hint>{t('voice.speed_hint')}</Hint>
      </SettingsBody>
    </Screen>
  );
}
