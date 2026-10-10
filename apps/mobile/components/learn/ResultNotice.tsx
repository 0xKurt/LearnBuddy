// The finished practice, told at the end of the conversation on Buddy's home (components/buddy/
// HomeNotices.tsx `resultNotice`, issue #107): the same true, kind words as the summary — never a
// hit rate (feedback #1). The full view stays one tap away; what is ready next is the bar's job.

import type { NowCard } from '@learnbuddy/shared-types/contracts';
import { useTranslation } from 'react-i18next';

import { summaryLines } from '../../lib/practice/summaryLine.js';
import type { Quiet } from '../buddy/extensions.js';
import { ResultViewBtn } from '../buddy/HomeNotices.js';
import { NoticeBubble } from '../buddy/NoticeBubble.js';

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
    <NoticeBubble
      text={t('buddy:now.result_title')}
      detail={summaryLines(now.result, now.mode)
        .map((l) =>
          l.count === undefined
            ? t(`practice:${l.key}`)
            : t(`practice:${l.key}`, { count: l.count }),
        )
        .join(' ')}
    >
      <ResultViewBtn sessionId={now.session_id} busy={busy} quiet={quiet} />
    </NoticeBubble>
  );
}
