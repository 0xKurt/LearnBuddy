// Buddy's voice (ADR 0008 §Amendment): closed like every group here, with the voice she has
// now as its one line; opened, the same picker as in the setup (components/voice/VoicePicker).
// The speed stays something she asks Buddy for ("sprich langsamer") — no second control.

import type { BuddySettingsView } from '@learnbuddy/shared-types/contracts';
import { useTranslation } from 'react-i18next';

import { CARD_PAD } from '../../lib/theme/space.js';
import { Card } from '../lb/Card.js';
import { VoicePicker } from '../voice/VoicePicker.js';
import { Group } from './Group.js';
import { Row } from './Row.js';

export function VoiceSection({ settings }: { settings: BuddySettingsView }) {
  const { t } = useTranslation(['settings', 'buddy']);
  const current = t(`buddy:voice_pick.name.${settings.voice}`);
  return (
    <Group title={t('settings:voice.title')} fold="voice" summary={current}>
      <Card padding={CARD_PAD.roomy}>
        <Row
          question={t('settings:voice.question')}
          current={current}
          hint={t('settings:voice.speed_hint')}
        >
          <VoicePicker settings={settings} />
        </Row>
      </Card>
    </Group>
  );
}
