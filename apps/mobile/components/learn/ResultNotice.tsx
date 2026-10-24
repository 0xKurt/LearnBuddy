// The finished practice, told at the end of the conversation on Buddy's home (components/buddy/
// components/learn/HomeNotices.tsx, issue #107): the same true, kind words as the summary — never a
// hit rate (feedback #1). The full view stays one tap away; what is ready next is the bar's job.

import type { BuddyHome, NowCard } from '@learnbuddy/shared-types/contracts';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { resultLines, resultTitle } from '../../lib/practice/resultText.js';
import { ChatCard } from '../buddy/ChatCard.js';
import { quietVariant, type Quiet } from '../buddy/extensions.js';

export function ResultNotice({
  now,
  busy,
  quiet,
  showDetail = true,
}: {
  now: Extract<NowCard, { type: 'practice_result' }>;
  busy: boolean;
  showDetail?: boolean;
  quiet: Quiet;
}) {
  const { t } = useTranslation(['buddy', 'practice']);
  return (
    <ChatCard
      live
      tone="accent"
      icon="check"
      title={t(`practice:${resultTitle(now)}`)}
      detail={
        showDetail
          ? resultLines(now.result, now)
              .map(({ key, ...values }) => t(`practice:${key}`, values))
              .join(' ')
          : undefined
      }
      primary={{
        label: t('buddy:now.result_view'),
        variant: quietVariant(quiet),
        disabled: busy,
        onPress: () => router.push(`/practice/${now.session_id}`),
      }}
    />
  );
}

/** The same result card, with the detail already said by the greeting. */
export function greetingResult(h: BuddyHome, tells: string, on: { busy: boolean; quiet: Quiet }) {
  return h.now?.type === 'practice_result' && h.now.session_id === tells ? (
    <ResultNotice now={h.now} {...on} showDetail={false} />
  ) : null;
}
