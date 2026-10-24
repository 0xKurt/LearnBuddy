// Buddy offered a Kopfrechnen round in the chat ("Lass uns Einmaleins üben", issue #243): the
// same card as every other offer — what it is, in two words, and one "Los geht's" (design
// ui_kits/app/Flows.jsx:169, `PracticeReady label="Kopfrechnen"`). Starting it
// asks no model: the server writes the twenty tasks from the range in a few milliseconds, so
// there is no "wird vorbereitet" to wait through. The offer's action id is the request id, so
// tapping the same card again opens the same round — once it ended, the card says so instead.

import type { ActionSummary } from '@learnbuddy/shared-types/contracts';
import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useOfferRun } from '../../lib/learning/homeScope.js';
import { useAnnounce } from '../../lib/announce.js';
import { startDrill } from '../../lib/api/learningEndpoints.js';
import { keys, queryClient } from '../../lib/api/queries.js';
import { messageFor } from '../../lib/errors.js';
import { PracticeReady } from '../buddy/ChatCard.js';
import { quietVariant, type Quiet } from '../buddy/extensions.js';
import { FinishedOffer } from './FinishedOffer.js';

type Offer = Extract<ActionSummary, { tool: 'offer_drill' }>;

export function DrillOfferCard({
  actionId,
  offer,
  quiet = 'primary',
}: {
  actionId: string;
  offer: Offer;
  /** Whether "Los geht's" may be the screen's one filled button (extensions.ts `loudCard`). */
  quiet?: Quiet;
}) {
  const { t } = useTranslation(['learn', 'common', 'buddy']);
  const { onTop, resumes } = useOfferRun(offer);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const running = useRef(false);
  useAnnounce(failed);
  const label = t('learn:drill.label');

  async function go(): Promise<void> {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setFailed(null);
    try {
      const session = await startDrill(actionId, {
        range: offer.range,
        rows: offer.rows,
        carry: offer.carry,
      });
      queryClient.setQueryData(keys.session(session.id), session);
      void queryClient.invalidateQueries({ queryKey: keys.home });
      router.push(`/practice/${session.id}`);
    } catch (err) {
      setFailed(messageFor(err));
    } finally {
      running.current = false;
      setBusy(false);
    }
  }

  // The round ended (issue #643): the card says so and opens it, never a start that opens an
  // ended round.
  if (offer.finished_session_id !== null) {
    return (
      <FinishedOffer label={label} title={offer.title} sessionId={offer.finished_session_id} />
    );
  }

  return (
    <PracticeReady
      label={label}
      title={offer.title}
      note={failed}
      start={
        onTop
          ? null
          : {
              label: failed
                ? t('common:actions.retry')
                : resumes
                  ? t('buddy:now.resume_cta')
                  : t('learn:topic.submit'),
              busy,
              variant: quietVariant(quiet),
              accessibilityHint: `${label}: ${offer.title}`,
              onPress: () => (resumes ? router.push(`/practice/${resumes}`) : void go()),
            }
      }
    />
  );
}
