// The latest part of the conversation. Buddy's messages that were also
// sent outside the app show what really happened to them. What Buddy did
// with a message stands right under it, with "Rückgängig" while that still
// applies — there is no separate list of it on the home.

import { MathText } from '../math/MathText.js';
import { withoutEmphasis } from '../../lib/math/emphasis.js';
import type { MessageView } from '@learnbuddy/shared-types/contracts';
import { ActivityIndicator, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { LB } from '../../lib/theme/colors.js';
import { TYPE } from '../../lib/theme/type.js';
import { Btn } from '../lb/Btn.js';
import { OfferCard } from '../learn/OfferCard.js';
import { SHADOW } from '../../lib/theme/shadow.js';
import { AreaCard } from './AreaCard.js';
import { BuddyOrb } from './BuddyOrb.js';
import { deliveryText, describeAction } from './describe.js';

type Props = {
  messages: MessageView[];
  /** Local message being sent right now (optimistic). */
  pending: { text: string } | null;
  busy: boolean;
  showActions?: boolean;
  /** Whether Buddy may message her phone (agreed reminders say where they arrive). */
  contactOn?: boolean;
  onOption: (messageId: string, option: string) => void;
  onResend: (message: MessageView) => void;
  /** Undo one of Buddy's actions (only offered where the API says it still applies). */
  onUndo?: (actionId: string) => void;
};

export function Conversation({
  messages,
  contactOn,
  pending,
  busy,
  showActions = false,
  onOption,
  onResend,
  onUndo,
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
        const done = m.actions.filter(
          (a) => a.summary.tool !== 'offer_learning' && a.summary.tool !== 'open_area',
        );
        return (
          <View key={m.id} style={{ alignItems: mine ? 'flex-end' : 'flex-start', gap: 4 }}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8, maxWidth: '92%' }}>
              {mine ? null : <BuddyOrb size={26} />}
              <View
                accessible
                accessibilityLabel={`${mine ? t('thread.you') : t('thread.buddy')}: ${withoutEmphasis(m.text)}`}
                style={[
                  {
                    flexShrink: 1,
                    backgroundColor: mine ? LB.primary : '#fff',
                    borderRadius: 22,
                    borderBottomRightRadius: mine ? 6 : 22,
                    borderBottomLeftRadius: mine ? 22 : 6,
                    paddingHorizontal: 16,
                    paddingVertical: 11,
                  },
                  mine ? null : SHADOW.soft,
                ]}
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
            </View>
            {m.outreach ? (
              <Text style={[TYPE.small, { fontSize: 12 }]}>{deliveryText(m.outreach)}</Text>
            ) : null}
            {m.actions.map((a) =>
              // Buddy's offers to start something: always shown, one tap starts it.
              a.summary.tool === 'offer_learning' ? (
                <View key={a.id} style={{ width: '86%', marginLeft: 34 }}>
                  <OfferCard actionId={a.id} offer={a.summary} />
                </View>
              ) : a.summary.tool === 'open_area' ? (
                <View key={a.id} style={{ width: '86%', marginLeft: 34 }}>
                  <AreaCard area={a.summary.area} />
                </View>
              ) : null,
            )}
            {showActions && done.length > 0 ? (
              <View style={{ gap: 6, maxWidth: '88%', marginLeft: 34 }}>
                {done.map((a) => {
                  const what = describeAction(a.summary, { contactOn });
                  return (
                    <View
                      key={a.id}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 4,
                        backgroundColor: a.status === 'undone' ? LB.canvas : LB.mint,
                        borderRadius: 16,
                        paddingLeft: 12,
                      }}
                    >
                      <Text
                        style={[
                          TYPE.small,
                          {
                            fontSize: 13,
                            flex: 1,
                            textDecorationLine: a.status === 'undone' ? 'line-through' : 'none',
                          },
                        ]}
                      >
                        ✓ {what}
                      </Text>
                      {onUndo && a.undoable && a.status !== 'undone' ? (
                        <Btn
                          size="sm"
                          variant="ghost"
                          onPress={() => onUndo(a.id)}
                          disabled={busy}
                          accessibilityLabel={t('done.undo_label', { what })}
                        >
                          {t('done.undo')}
                        </Btn>
                      ) : null}
                    </View>
                  );
                })}
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
              backgroundColor: LB.primary,
              borderRadius: 22,
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
