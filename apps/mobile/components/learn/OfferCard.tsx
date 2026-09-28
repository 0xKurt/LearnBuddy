// Buddy offered to start something in the chat ("Soll ich dir den Dativ
// erklären?"): the offer under its message, with one "Los geht's". It starts
// like the topic sheet does; the offer's action id is the request id, so the
// same offer always opens the same session (tapping it again resumes it).

import type { ActionSummary } from '@learnbuddy/shared-types/contracts';
import { router } from 'expo-router';
import { Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { useAnnounce } from '../../lib/announce.js';
import { LB } from '../../lib/theme/colors.js';
import { TYPE } from '../../lib/theme/type.js';
import { Btn } from '../lb/Btn.js';
import { Card } from '../lb/Card.js';
import { Icon } from '../lb/Icon.js';
import { KIND_ICON, KIND_LABEL } from './kinds.js';
import { useStartTopic } from './useStartTopic.js';
import { reacted, tapped } from '../../lib/perf.js';
import { useVoiceMode } from '../../lib/speech/voiceMode.js';

type Offer = Extract<ActionSummary, { tool: 'offer_learning' }>;

export function OfferCard({
  actionId,
  offer,
  spoken = false,
}: {
  actionId: string;
  offer: Offer;
  /**
   * Tapped while talking (app/talk.tsx): the practice must not turn silent because she
   * started it with her voice (issue #40) — voice mode goes on, so the question is read
   * to her and the mic waits by itself.
   */
  spoken?: boolean;
}) {
  const { t } = useTranslation(['learn', 'common']);
  const { state, start } = useStartTopic();
  const preparing = state.status === 'preparing';
  // iOS has no live regions: what happened says itself (lib/announce.ts), as StartStatus did.
  useAnnounce(
    preparing
      ? t('learn:topic.preparing')
      : state.status === 'not_usable'
        ? t('learn:topic.not_usable')
        : state.status === 'failed'
          ? state.message
          : null,
  );
  const label = t(`learn:${KIND_LABEL[offer.kind]}`);

  async function go(): Promise<void> {
    // Tap → the first question on screen (issue #66): the wait she complained about.
    tapped('start_offer');
    const session = await start(offer.kind, offer.text, actionId, offer.goal_id);
    if (session) {
      if (spoken) useVoiceMode.getState().setOn(true);
      router.push(`/practice/${session.id}`);
    }
    reacted('start_offer');
  }

  return (
    // A bounded thing (issue #15): icon row, two lines of offer, the button. Nothing grows
    // between them — the first owner run had "Los geht's" pushed out of sight by a status
    // line that appeared above it. What is happening lives in the button itself.
    <Card tone="primaryLt" padding={16} radius={18}>
      <View style={{ gap: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <Icon name={KIND_ICON[offer.kind]} size={20} color={LB.primaryDk} />
          </View>
          <Text style={[TYPE.label, { color: LB.primaryDk }]}>{label.toUpperCase()}</Text>
        </View>
        <Text style={TYPE.body} numberOfLines={2}>
          {offer.text}
        </Text>
        {state.status === 'not_usable' ? (
          // Nothing to learn from this text: one quiet line where the button was.
          <Text accessibilityLiveRegion="polite" style={[TYPE.small, { color: LB.ink2 }]}>
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
          <Text accessibilityLiveRegion="polite" style={[TYPE.small, { color: LB.ink2 }]}>
            {state.message}
          </Text>
        ) : null}
      </View>
    </Card>
  );
}
