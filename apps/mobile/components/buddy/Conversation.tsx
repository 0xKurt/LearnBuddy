// The latest part of the conversation. Buddy's messages that were also
// sent outside the app show what really happened to them.

import { MathText } from '../math/MathText.js';
import { withoutEmphasis } from '../../lib/math/emphasis.js';
import type { MessageView } from '@learnbuddy/shared-types/contracts';
import { ActivityIndicator, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { LB } from '../../lib/theme/colors.js';
import { TYPE } from '../../lib/theme/type.js';
import { Btn } from '../lb/Btn.js';
import { OfferCard } from '../learn/OfferCard.js';
import { deliveryText, describeAction } from './describe.js';

type Props = {
  messages: MessageView[];
  /** Local message being sent right now (optimistic). */
  pending: { text: string } | null;
  busy: boolean;
  showActions?: boolean;
  onOption: (messageId: string, option: string) => void;
  onResend: (message: MessageView) => void;
};

export function Conversation({
  messages,
  pending,
  busy,
  showActions = false,
  onOption,
  onResend,
}: Props) {
  const { t } = useTranslation('buddy');
  const last = messages[messages.length - 1];
  const thinking =
    pending !== null || messages.some((m) => m.role === 'learner' && m.status === 'processing');
  return (
    <View style={{ gap: 10 }}>
      {messages.map((m) => {
        const mine = m.role === 'learner';
        // What Buddy did (✓ list); offers are not done yet, they have their own card.
        const done = m.actions.filter((a) => a.summary.tool !== 'offer_learning');
        return (
          <View key={m.id} style={{ alignItems: mine ? 'flex-end' : 'flex-start', gap: 4 }}>
            <View
              accessible
              accessibilityLabel={`${mine ? t('thread.you') : t('thread.buddy')}: ${withoutEmphasis(m.text)}`}
              style={{
                maxWidth: '86%',
                backgroundColor: mine ? LB.ink : LB.paper,
                borderColor: LB.hairline,
                borderWidth: mine ? 0 : 1,
                borderRadius: 18,
                borderBottomRightRadius: mine ? 6 : 18,
                borderBottomLeftRadius: mine ? 18 : 6,
                paddingHorizontal: 14,
                paddingVertical: 10,
              }}
            >
              {m.outreach ? (
                <Text style={[TYPE.label, { marginBottom: 2 }]}>{m.outreach.title}</Text>
              ) : null}
              <MathText
                text={m.text}
                accessible={false}
                style={[TYPE.body, { color: mine ? '#fff' : LB.ink }]}
              />
            </View>
            {m.outreach ? (
              <Text style={[TYPE.small, { fontSize: 12 }]}>{deliveryText(m.outreach)}</Text>
            ) : null}
            {m.actions.map((a) =>
              // Buddy's offers to start something: always shown, one tap starts it.
              a.summary.tool === 'offer_learning' ? (
                <View key={a.id} style={{ width: '86%' }}>
                  <OfferCard actionId={a.id} offer={a.summary} />
                </View>
              ) : null,
            )}
            {showActions && done.length > 0 ? (
              <View style={{ gap: 2, maxWidth: '86%' }}>
                {done.map((a) => (
                  <Text
                    key={a.id}
                    style={[
                      TYPE.small,
                      {
                        fontSize: 13,
                        textDecorationLine: a.status === 'undone' ? 'line-through' : 'none',
                      },
                    ]}
                  >
                    ✓ {describeAction(a.summary)}
                  </Text>
                ))}
              </View>
            ) : null}
            {mine && m.status === 'failed' ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={[TYPE.small, { color: LB.danger }]}>{t('thread.failed')}</Text>
                <Btn size="sm" variant="outline" onPress={() => onResend(m)} disabled={busy}>
                  {t('thread.resend')}
                </Btn>
              </View>
            ) : null}
            {m === last && m.role === 'buddy' && m.options && m.options.length > 0 ? (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 }}>
                {m.options.map((o) => (
                  <Btn
                    key={o}
                    size="sm"
                    variant="soft"
                    onPress={() => onOption(m.id, o)}
                    disabled={busy}
                  >
                    {o}
                  </Btn>
                ))}
              </View>
            ) : null}
          </View>
        );
      })}
      {pending ? (
        <View style={{ alignItems: 'flex-end' }}>
          <View
            style={{
              maxWidth: '86%',
              backgroundColor: LB.ink,
              borderRadius: 18,
              borderBottomRightRadius: 6,
              paddingHorizontal: 14,
              paddingVertical: 10,
              opacity: 0.7,
            }}
          >
            <Text style={[TYPE.body, { color: '#fff' }]}>{pending.text}</Text>
          </View>
        </View>
      ) : null}
      {thinking ? (
        <View
          accessibilityLiveRegion="polite"
          style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}
        >
          <ActivityIndicator size="small" color={LB.ink3} />
          <Text style={TYPE.small}>{t('thread.typing')}</Text>
        </View>
      ) : null}
    </View>
  );
}
