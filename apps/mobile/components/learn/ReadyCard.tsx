// Practice Buddy prepared that already waits for her, shown again under his answer (issue #630):
// his words point to it, and this is the button they mean — "liegt schon bereit … mit einem
// Tippen starten" with nothing to tap was the defect. The thread's one card for a practice
// (design components/practice/PracticeReady.jsx, #599), started like the bar on top starts it
// (`HomeTop` startPrepared). Once it no longer waits — started, done or replaced — there is no
// start to offer and no card: the bar or the result says where it went (CLAUDE.md rule 5).

import type { ActionSummary } from '@learnbuddy/shared-types/contracts';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { startStep } from '../../lib/api/endpoints.js';
import { seedSession } from '../../lib/api/queries.js';
import { useHomeAct } from '../../lib/buddy/useHomeAct.js';
import { PracticeReady } from '../buddy/ChatCard.js';
import { quietVariant, type Quiet } from '../buddy/extensions.js';
import { KIND_LABEL } from './kinds.js';

type Ready = Extract<ActionSummary, { tool: 'show_ready' }>;

export function ReadyCard({ ready, quiet = 'primary' }: { ready: Ready; quiet?: Quiet }) {
  const { t } = useTranslation(['learn', 'buddy']);
  const { busy, act } = useHomeAct();
  if (!ready.ready) return null;
  const label = t(`learn:${KIND_LABEL.practice}`);
  return (
    <PracticeReady
      label={label}
      title={ready.title}
      detail={t('buddy:now.ready_body', {
        count: ready.question_count,
        minutes: ready.est_minutes,
      })}
      start={{
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
      }}
    />
  );
}
