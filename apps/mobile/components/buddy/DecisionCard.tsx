// The one open decision, answered with a tap (no model involved). It is asked at the end
// of the conversation like everything Buddy asks — never a card on top (issue #17): the top
// of home belongs to the slim bar of what happens now, and the violet button with it, so
// the answers here stay quiet (user feedback #6, docs/UX-PRINCIPLES.md §31–32).
//
// Messages to the phone say exactly what would be allowed, from the stored rules —
// for a minor too, so the parents see what their PIN allows (user feedback #4).

import type { Decision } from '@learnbuddy/shared-types/contracts';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';

import { Btn } from '../lb/Btn.js';
import { NoticeBubble } from './NoticeBubble.js';

export type OptInDecision = Extract<Decision, { type: 'contact_opt_in' }>;

/** What turning messages on allows, in one or two sentences (from the stored rules). */
export function optInRules(t: TFunction, decision: OptInDecision): string {
  const r = decision.rules;
  if (!r) return t('buddy:decision.optin_body');
  return t('buddy:decision.optin_body_rules', { time: r.quiet_start });
}

type Props = {
  decision: Decision;
  busy: boolean;
  onOptIn: (enable: boolean) => void;
  onAdultOptIn: () => void;
  onOutcome: (goalId: string, outcome: 'good' | 'ok' | 'hard') => void;
};

export function DecisionCard({ decision, busy, onOptIn, onAdultOptIn, onOutcome }: Props) {
  const { t } = useTranslation('buddy');
  if (decision.type === 'how_did_it_go') {
    const goalId = decision.goal.id;
    return (
      <NoticeBubble text={t('decision.outcome_title', { title: decision.goal.title })}>
        {(['good', 'ok', 'hard'] as const).map((o) => (
          <Btn
            key={o}
            variant="outline"
            size="sm"
            onPress={() => onOutcome(goalId, o)}
            disabled={busy}
          >
            {t(`decision.outcome_${o}`)}
          </Btn>
        ))}
      </NoticeBubble>
    );
  }
  const body = [
    optInRules(t, decision),
    decision.can_enable_here ? null : t('decision.optin_minor_body'),
  ]
    .filter(Boolean)
    .join(' ');
  // The violet button belongs to the bar on top: here a soft one.
  return (
    <NoticeBubble text={t('decision.optin_title')} detail={body}>
      <Btn
        variant="soft"
        size="sm"
        onPress={decision.can_enable_here ? () => onOptIn(true) : onAdultOptIn}
        disabled={busy}
      >
        {decision.can_enable_here ? t('decision.optin_yes') : t('decision.optin_minor_cta')}
      </Btn>
      <Btn variant="ghost" size="sm" onPress={() => onOptIn(false)} disabled={busy}>
        {t('decision.optin_no')}
      </Btn>
    </NoticeBubble>
  );
}
