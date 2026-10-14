// An offer whose run she already worked through (issues #630, #643): the card says so and opens
// what came of it — "Los geht's" on a run that ended promised a start that was over, and opened
// the ended run's result at the moment she "started" it. Drawn like the finished practice's own
// card (HomeNotices `ResultView`): the tick, "Geschafft!", "Ansehen". One card for every offer
// kind that starts a run (`OfferCard`, `DrillOfferCard`).

import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { ChatCard } from '../buddy/ChatCard.js';

export function FinishedOffer({
  label,
  title,
  sessionId,
}: {
  /** What it was ("Üben", "Kopfrechnen"). */
  label: string;
  title: string;
  /** The run it started, opened by "Ansehen". */
  sessionId: string;
}) {
  const { t } = useTranslation('buddy');
  return (
    <ChatCard
      tone="accent"
      icon="check"
      label={label}
      title={title}
      titleLines={2}
      detail={t('now.result_title')}
      primary={{
        label: t('now.result_view'),
        variant: 'secondary',
        accessibilityHint: `${label}: ${title}`,
        onPress: () => router.push(`/practice/${sessionId}`),
      }}
    />
  );
}
