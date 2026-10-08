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
   * started it with her voice (issue #40) — the conversation goes on there (issue #386), so the
   * question is read to her and the mic is the main control.
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
    });
    if (session) {
      if (spoken) useVoiceMode.getState().setConversation(true);
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
            <Icon
              name={offer.minutes !== null ? 'clock' : KIND_ICON[offer.kind]}
              size={20}
              color={palette.primaryDk}
            />
          </View>
          <Text style={[TYPE.label, { color: palette.primaryDk }]}>{label.toUpperCase()}</Text>
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
