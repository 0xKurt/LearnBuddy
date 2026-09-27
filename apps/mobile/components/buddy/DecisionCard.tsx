// The one open decision, answered with a tap (no model involved). Alone it is the
// card on top; while another card is there it is asked at the end of the
// conversation instead (at most one card on top, one violet button — user
// feedback #6, docs/UX-PRINCIPLES.md §31–32).
//
// Messages to the phone say exactly what would be allowed, from the stored rules —
// for a minor too, so the parents see what their PIN allows (user feedback #4).

import type { Decision } from '@learnbuddy/shared-types/contracts';
import type { TFunction } from 'i18next';
import { Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { TYPE } from '../../lib/theme/type.js';
import { Btn } from '../lb/Btn.js';
import { Card } from '../lb/Card.js';
import { NoticeBubble } from './NoticeBubble.js';

export type OptInDecision = Extract<Decision, { type: 'contact_opt_in' }>;

/** What turning messages on allows, in one or two sentences (from the stored rules). */
export function optInRules(t: TFunction, decision: OptInDecision): string {
  const r = decision.rules;
  if (!r || r.max_per_day < 1) return t('buddy:decision.optin_body');
  return t('buddy:decision.optin_body_rules', { count: r.max_per_day, time: r.quiet_start });
}

type Props = {
  decision: Decision;
  busy: boolean;
  onOptIn: (enable: boolean) => void;
  onAdultOptIn: () => void;
  onOutcome: (goalId: string, outcome: 'good' | 'ok' | 'hard') => void;
  /** Another card is on top: asked in the conversation, with quieter buttons. */
  inline?: boolean;
};

export function DecisionCard({
  decision,
  busy,
  onOptIn,
  onAdultOptIn,
  onOutcome,
  inline = false,
}: Props) {
  const { t } = useTranslation('buddy');
  const size = inline ? 'sm' : 'md';
  if (decision.type === 'how_did_it_go') {
    const goalId = decision.goal.id;
    const title = t('decision.outcome_title', { title: decision.goal.title });
    const answers = (['good', 'ok', 'hard'] as const).map((o) => (
      <Btn
        key={o}
        variant="outline"
        size={size}
        onPress={() => onOutcome(goalId, o)}
        disabled={busy}
      >
        {t(`decision.outcome_${o}`)}
      </Btn>
    ));
    if (inline) return <NoticeBubble text={title}>{answers}</NoticeBubble>;
    return (
      <Card tone="lavender" padding={16} radius={22}>
        <Text accessibilityRole="header" style={TYPE.title}>
          {title}
        </Text>
        <View style={{ marginTop: 12, flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
          {answers}
        </View>
      </Card>
    );
  }
  const body = [
    optInRules(t, decision),
    decision.can_enable_here ? null : t('decision.optin_minor_body'),
  ]
    .filter(Boolean)
    .join(' ');
  // Inline, the violet button belongs to the card on top: here a soft one.
  const yes = (
    <Btn
      key="yes"
      variant={inline ? 'soft' : 'primary'}
      size={size}
      onPress={decision.can_enable_here ? () => onOptIn(true) : onAdultOptIn}
      disabled={busy}
    >
      {decision.can_enable_here ? t('decision.optin_yes') : t('decision.optin_minor_cta')}
    </Btn>
  );
  const no = (
    <Btn key="no" variant="ghost" size={size} onPress={() => onOptIn(false)} disabled={busy}>
      {t('decision.optin_no')}
    </Btn>
  );
  if (inline) {
    return (
      <NoticeBubble text={t('decision.optin_title')} detail={body}>
        {yes}
        {no}
      </NoticeBubble>
    );
  }
  return (
    <Card tone="lavender" padding={16} radius={22}>
      <Text accessibilityRole="header" style={TYPE.title}>
        {t('decision.optin_title')}
      </Text>
      <Text style={[TYPE.small, { marginTop: 4 }]}>{body}</Text>
      <View style={{ marginTop: 12, flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        {yes}
        {no}
      </View>
    </Card>
  );
}
