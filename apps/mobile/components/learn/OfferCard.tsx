// Buddy offered to start something in the chat ("Soll ich dir den Dativ
// erklären?"): the offer under its message, with one "Los geht's". It starts
// like the topic sheet does; the offer's action id is the request id, so the
// same offer always opens the same session (tapping it again resumes it).

import type { ActionSummary } from '@learnbuddy/shared-types/contracts';
import { router } from 'expo-router';
import { Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { useAnnounce } from '../../lib/announce.js';
import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { TYPE } from '../../lib/theme/type.js';
import { Btn } from '../lb/Btn.js';
import { Card } from '../lb/Card.js';
import { Icon } from '../lb/Icon.js';
import { KIND_ICON, KIND_LABEL } from './kinds.js';
import { useStartTopic } from './useStartTopic.js';
import { startTopic } from '../../lib/api/endpoints.js';
import { keys } from '../../lib/api/keys.js';
import { queryClient, useOfferReadiness } from '../../lib/api/queries.js';
import { counted, dropped, tapped } from '../../lib/perf.js';
import { SPACE } from '../../lib/theme/space.js';
import { useVoiceMode } from '../../lib/speech/voiceMode.js';

type Offer = Extract<ActionSummary, { tool: 'offer_learning' }>;

export function OfferCard({
  actionId,
  offer,
  spoken = false,
  newest = false,
}: {
  actionId: string;
  offer: Offer;
  /**
   * The offer under Buddy's newest message: only that one asks whether its practice is ready
   * (issue #59) — an old card in the history has nothing to win from asking.
   */
  newest?: boolean;
  /**
   * Tapped while talking (app/talk.tsx): the practice must not turn silent because she
   * started it with her voice (issue #40) — voice mode goes on, so the question is read
   * to her and the mic waits by itself.
   */
  spoken?: boolean;
}) {
  const { palette } = useTheme();
  const { t } = useTranslation(['learn', 'common']);
  const { state, start } = useStartTopic();
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
  const label = t(`learn:${KIND_LABEL[offer.kind]}`);
  // Buddy prepares what he offers while she reads (issue #48); the card asks whether it stands
  // there yet, so her tap can open it at once. Only "ready" is ever said — "preparing" looks
  // exactly like the card always did (CLAUDE.md rule 5).
  const readiness = useOfferReadiness(actionId, newest && !dead);
  const ready = readiness.session;

  async function go(): Promise<void> {
    // Tap → the first question on screen (issue #66): the wait she complained about. The
    // practice screen says when it is there (reacted('start_offer')).
    tapped('start_offer');
    const request = {
      goalId: offer.goal_id,
      // What she asked for beyond the topic travels with the offer (issue #113).
      difficulty: offer.difficulty,
      direction: offer.direction,
    };
    if (ready) {
      // Already there: open it now, and tell the server she started it on the way (that her
      // tap used what was prepared ahead, and the hints for it start). Its answer is not put
      // over the screen she is already on.
      counted('offer_ready_at_tap');
      if (spoken) useVoiceMode.getState().setOn(true);
      router.push(`/practice/${ready.id}`);
      void startTopic({
        client_request_id: actionId,
        kind: offer.kind,
        text: offer.text,
        ...(request.goalId ? { goal_id: request.goalId } : {}),
        ...(request.difficulty ? { difficulty: request.difficulty } : {}),
        ...(request.direction ? { direction: request.direction } : {}),
      })
        .then(() => queryClient.invalidateQueries({ queryKey: keys.home }))
        .catch(() => undefined);
      return;
    }
    counted('offer_waited_at_tap');
    const session = await start(offer.kind, offer.text, actionId, request);
    if (session) {
      if (spoken) useVoiceMode.getState().setOn(true);
      router.push(`/practice/${session.id}`);
    } else dropped('start_offer');
  }

  return (
    // A bounded thing (issue #15): icon row, two lines of offer, the button. Nothing grows
    // between them — the first owner run had "Los geht's" pushed out of sight by a status
    // line that appeared above it. What is happening lives in the button itself.
    <Card tone="primaryLt" padding={16} radius={18}>
      <View style={{ gap: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <Icon name={KIND_ICON[offer.kind]} size={20} color={palette.primaryDk} />
          </View>
          <Text style={[TYPE.label, { color: palette.primaryDk, flex: 1 }]} numberOfLines={1}>
            {label.toUpperCase()}
          </Text>
          {ready && !preparing ? (
            // Said only once it is true: the questions are stored and her tap opens them.
            <View
              accessibilityLiveRegion="polite"
              style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.xs }}
            >
              <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                <Icon name="check" size={14} color={palette.successText} />
              </View>
              <Text style={[TYPE.small, { color: palette.successText }]}>
                {t('learn:topic.ready')}
              </Text>
            </View>
          ) : null}
        </View>
        <Text style={TYPE.body} numberOfLines={2}>
          {offer.text}
        </Text>
        {dead ? (
          // Nothing to learn from this text: one quiet line where the button was.
          <Text accessibilityLiveRegion="polite" style={[TYPE.small, { color: palette.ink2 }]}>
            {t('learn:topic.not_usable')}
          </Text>
        ) : (
          <Btn
            busy={preparing}
            onPress={() => void go()}
            accessibilityHint={`${label}: ${offer.text}`}
          >
            {preparing
              ? t('learn:topic.preparing')
              : state.status === 'failed'
                ? t('common:actions.retry')
                : t('learn:topic.submit')}
          </Btn>
        )}
        {/* A failure says why — under the button, where nothing can push it away. */}
        {state.status === 'failed' ? (
          <Text accessibilityLiveRegion="polite" style={[TYPE.small, { color: palette.ink2 }]}>
            {state.message}
          </Text>
        ) : null}
      </View>
    </Card>
  );
}
