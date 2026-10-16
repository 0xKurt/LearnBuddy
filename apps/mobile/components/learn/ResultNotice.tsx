// The finished practice, told at the end of the conversation on Buddy's home (components/buddy/
// components/learn/HomeNotices.tsx, issue #107): the same true, kind words as the summary — never a
// hit rate (feedback #1). The full view stays one tap away; what is ready next is the bar's job.

import type { NowCard } from '@learnbuddy/shared-types/contracts';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { summaryLines } from '../../lib/practice/summaryLine.js';
import { ChatCard } from '../buddy/ChatCard.js';
import { quietVariant, type Quiet } from '../buddy/extensions.js';

export function ResultNotice({
  now,
  busy,
  quiet,
}: {
  now: Extract<NowCard, { type: 'practice_result' }>;
  busy: boolean;
  quiet: Quiet;
}) {
  const { t } = useTranslation(['buddy', 'practice']);
  return (
    <ChatCard
      live
      tone="accent"
      icon="check"
      title={t('buddy:now.result_title')}
      detail={summaryLines(now.result, now.mode)
        .map((l) =>
          l.count === undefined
            ? t(`practice:${l.key}`)
            : t(`practice:${l.key}`, { count: l.count }),
        )
        .join(' ')}
      primary={{
        label: t('buddy:now.result_view'),
        variant: quietVariant(quiet),
        disabled: busy,
        onPress: () => router.push(`/practice/${now.session_id}`),
      }}
    />
  );
}
