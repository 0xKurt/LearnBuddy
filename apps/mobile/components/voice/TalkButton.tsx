// Conversation mode's entry: the filled round waveform at the input bar's end — the size and
// mark she knows from the assistants she uses (owner feedback 2026-09-28: waveform, not
// headphones; inside, not bigger than the rest). It holds the place the round send arrow takes
// once there is something to send (issue #522): one filled circle per bar.

import { useTranslation } from 'react-i18next';

import { CircleBtn } from '../lb/CircleBtn.js';

export function TalkButton({ onPress }: { onPress: () => void }) {
  const { t } = useTranslation('buddy');
  return <CircleBtn icon="voice" filled onPress={onPress} accessibilityLabel={t('talk.open')} />;
}
