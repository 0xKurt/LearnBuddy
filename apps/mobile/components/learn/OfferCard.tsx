// Buddy offered to start something in the chat ("Soll ich dir den Dativ
// erklären?"): the offer under its message, as the thread's one card with one "Los geht's"
// (design components/practice/PracticeReady.jsx, #599). It starts
// like the topic sheet does; the offer's action id is the request id, so the
// same offer always opens the same session (tapping it again resumes it).

import type { ActionSummary } from '@learnbuddy/shared-types/contracts';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { useAnnounce } from '../../lib/announce.js';
import { PracticeReady } from '../buddy/ChatCard.js';
import { quietVariant, type Quiet } from '../buddy/extensions.js';
import { FinishedOffer } from './FinishedOffer.js';
import { KIND_LABEL } from './kinds.js';
import { useStartTopic } from './useStartTopic.js';
import { reacted, tapped } from '../../lib/perf.js';
import { useOfferRun } from '../../lib/learning/homeScope.js';
import { useVoiceMode } from '../../lib/speech/voiceMode.js';

type Offer = Extract<ActionSummary, { tool: 'offer_learning' }>;

export function OfferCard({
  actionId,
  offer,
  spoken = false,
  quiet = 'primary',
}: {
  actionId: string;
  offer: Offer;
  /**
   * Tapped while talking (app/talk.tsx): the practice must not turn silent because she
   * started it with her voice (issue #40) — the conversation goes on there (issue #386), so the
   * question is read to her and the mic is the main control.
   */
  spoken?: boolean;
  /** Whether "Los geht's" may be the screen's one filled button (extensions.ts `loudCard`). */
  quiet?: Quiet;
}) {
  const { t } = useTranslation(['learn', 'common', 'buddy']);
  const { state, start } = useStartTopic();
  // Its open run is what the bar on top continues: the one control stays there (#846).
  const { onTop, resumes } = useOfferRun(offer);
  const preparing = state.status === 'preparing';
  // The server already knows this one cannot start: writing its questions was refused while
  // she was still reading Buddy's reply (issue #196). Then there is no button to offer — she
  // reads the same line she used to get only after tapping and waiting for it.
  const dead = offer.startable === false || state.status === 'not_usable';
  // iOS has no live regions: what happened says itself (lib/announce.ts), as StartStatus did.
  // A card that arrives already unable to start says so like the tapped one does — never
  // silently (issue #196).
  useAnnounce(
    preparing
      ? t('learn:topic.preparing')
      : dead
        ? t('learn:topic.not_usable')
        : state.status === 'failed'
          ? state.message
          : null,
  );
  // A test with time says so on its card, before she taps (issue #241) — never a surprise clock.
  const kindLabel = t(`learn:${KIND_LABEL[offer.kind]}`);
  const label =
    offer.minutes !== null
      ? `${kindLabel} · ${t('learn:topic.minutes', { count: offer.minutes })}`
      : kindLabel;

  async function go(): Promise<void> {
    // Tap → the first question on screen (issue #66): the wait she complained about.
    tapped('start_offer');
    const session = await start(offer.kind, offer.text, actionId, {
      goalId: offer.goal_id,
      // What she asked for beyond the topic travels with the offer (issue #113).
      difficulty: offer.difficulty,
      direction: offer.direction,
      // A Diktat of her sheet takes its words from there (issue #242).
      materialId: offer.material_id,
      // A test she asked to sit with time (issue #241): the minutes travel with the offer.
      minutes: offer.minutes,
      // The kinds of picture she asked for (#724) travel with it the same way.
      figures: offer.figures,
    });
    if (session) {
      if (spoken) useVoiceMode.getState().setConversation(true);
      router.push(`/practice/${session.id}`);
    }
    reacted('start_offer');
  }

  // She already worked through it (issue #630): the card says so and opens what came of it.
  if (offer.finished_session_id !== null) {
    return <FinishedOffer label={label} title={offer.text} sessionId={offer.finished_session_id} />;
  }

  return (
    // A bounded thing (issue #15): what it is, its topic, the button. Nothing grows between
    // them — the first owner run had "Los geht's" pushed out of sight by a status line that
    // appeared above it. What is happening lives in the button itself; a failure says why
    // under it, where nothing can push it away. A start that cannot happen has no button:
    // one quiet line where it was (issue #196).
    <PracticeReady
      label={label}
      title={offer.text}
      // Whether its prepared run shows a picture, from the run itself (#842): Buddy's words may
      // promise one; this line says what is there once the questions exist.
      detail={
        offer.pictures_shown === true
          ? t('learn:topic.with_picture')
          : offer.pictures_shown === false
            ? t('learn:topic.without_picture')
            : null
      }
      note={dead ? t('learn:topic.not_usable') : state.status === 'failed' ? state.message : null}
      start={
        dead || onTop
          ? null
          : {
              // A run she started and left goes on where she stopped (#643): the same word as
              // the bar and the practice card, never a fresh-looking start.
              label: preparing
                ? t('learn:topic.preparing')
                : state.status === 'failed'
                  ? t('common:actions.retry')
                  : resumes
                    ? t('buddy:now.resume_cta')
                    : t('learn:topic.submit'),
              busy: preparing,
              variant: quietVariant(quiet),
              accessibilityHint: `${label}: ${offer.text}`,
              onPress: () => (resumes ? router.push(`/practice/${resumes}`) : void go()),
            }
      }
    />
  );
}
