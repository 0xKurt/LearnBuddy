// Practice Buddy prepared that already waits for her, shown again under his answer (issue #630):
// his words point to it, and this is the button they mean — "liegt schon bereit … mit einem
// Tippen starten" with nothing to tap was the defect. The thread's one card for a practice
// (design components/practice/PracticeReady.jsx, #599), started like the bar on top starts it
// (`HomeTop` startPrepared). Once it no longer waits it stays in the history and says where it
// went (issue #844): running with "Weitermachen", done like any finished offer, or no longer open —
// never a start that is gone (CLAUDE.md rule 5).

import type { ActionSummary } from '@learnbuddy/shared-types/contracts';
import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { startStep } from '../../lib/api/learningEndpoints.js';
import { seedSession } from '../../lib/api/sessionQueries.js';
import { useHomeAct } from '../../lib/buddy/useHomeAct.js';
import { useBarPractice, useCurrentResult } from '../../lib/learning/homeScope.js';
import { PracticeReady } from '../buddy/ChatCard.js';
import { quietVariant, type Quiet } from '../buddy/extensions.js';
import { FinishedOffer } from './FinishedOffer.js';
import { KIND_LABEL } from './kinds.js';

/**
 * The practice it starts: shown again by Buddy (`show_ready`), or announced by his message from
 * the background (`MessageView.announces`, issue #632) — the same card either way.
 */
type Ready = Pick<
  Extract<ActionSummary, { tool: 'show_ready' }>,
  'step_id' | 'title' | 'question_count' | 'est_minutes' | 'outcome'
>;

export function ReadyCard({
  ready,
  quiet = 'primary',
  announced = false,
  wrap,
}: {
  ready: Ready;
  quiet?: Quiet;
  announced?: boolean;
  /** An announcement only adds its entrance and spacing while its card exists. */
  wrap?: (card: ReactNode) => ReactNode;
}) {
  const { t } = useTranslation(['learn', 'buddy']);
  const { busy, act } = useHomeAct();
  // The bar on top starts or continues this very practice: the one control stays there (#846).
  const onBar = useBarPractice();
  const result = useCurrentResult();
  const label = t(`learn:${KIND_LABEL.practice}`);
  const outcome = ready.outcome;
  // A background announcement adds no second card for the practice already shown on this
  // home. Its words and undo remain; history (no home context) keeps the card (#913).
  if (
    announced &&
    (onBar.step === ready.step_id || (outcome?.state === 'done' && result === outcome.session_id))
  )
    return null;
  const show = (card: ReactNode) => (wrap ? wrap(card) : card);
  if (outcome?.state === 'done')
    return show(<FinishedOffer label={label} title={ready.title} sessionId={outcome.session_id} />);
  if (outcome?.state === 'running')
    return show(
      <PracticeReady
        label={label}
        title={ready.title}
        detail={t('buddy:now.resume_body_untitled', { count: outcome.left })}
        start={
          onBar.session === outcome.session_id
            ? null
            : {
                label: t('buddy:now.resume_cta'),
                variant: quietVariant(quiet),
                accessibilityHint: `${label}: ${ready.title}`,
                onPress: () => router.push(`/practice/${outcome.session_id}`),
              }
        }
      />,
    );
  if (outcome?.state === 'closed')
    return show(
      <PracticeReady
        label={label}
        title={ready.title}
        detail={t('buddy:now.ready_closed')}
        start={null}
      />,
    );
  return show(
    <PracticeReady
      label={label}
      title={ready.title}
      detail={t('buddy:now.ready_body', {
        count: ready.question_count,
        minutes: ready.est_minutes,
      })}
      start={
        onBar.step === ready.step_id
          ? null
          : {
              label: t('learn:topic.submit'),
              busy,
              variant: quietVariant(quiet),
              accessibilityHint: `${label}: ${ready.title}`,
              onPress: () =>
                void act(async () => {
                  const { session_id, session } = await startStep(ready.step_id);
                  if (session) seedSession(session);
                  router.push(`/practice/${session_id}`);
                }),
            }
      }
    />,
  );
}
