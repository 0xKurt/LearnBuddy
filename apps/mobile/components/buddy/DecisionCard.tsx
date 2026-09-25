// The one open decision, answered with a tap (no model involved).

import type { Decision } from '@learnbuddy/shared-types/contracts';
import { Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { TYPE } from '../../lib/theme/type.js';
import { Btn } from '../lb/Btn.js';
import { Card } from '../lb/Card.js';

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
      <Card tone="lavender" padding={20} radius={22}>
        <Text accessibilityRole="header" style={TYPE.title}>
          {t('decision.outcome_title', { title: decision.goal.title })}
        </Text>
        <View style={{ marginTop: 14, flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
          {(['good', 'ok', 'hard'] as const).map((o) => (
            <Btn key={o} variant="outline" onPress={() => onOutcome(goalId, o)} disabled={busy}>
              {t(`decision.outcome_${o}`)}
            </Btn>
          ))}
        </View>
      </Card>
    );
  }
  return (
    <Card tone="lavender" padding={20} radius={22}>
      <Text accessibilityRole="header" style={TYPE.title}>
        {t('decision.optin_title')}
      </Text>
      <Text style={[TYPE.body, { marginTop: 4 }]}>{t('decision.optin_body')}</Text>
      {!decision.can_enable_here ? (
        <Text style={[TYPE.small, { marginTop: 4 }]}>{t('decision.optin_minor_body')}</Text>
      ) : null}
      <View style={{ marginTop: 14, flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        {decision.can_enable_here ? (
          <Btn onPress={() => onOptIn(true)} disabled={busy}>
            {t('decision.optin_yes')}
          </Btn>
        ) : (
          <Btn onPress={onAdultOptIn} disabled={busy}>
            {t('decision.optin_minor_cta')}
          </Btn>
        )}
        <Btn variant="ghost" onPress={() => onOptIn(false)} disabled={busy}>
          {t('decision.optin_no')}
        </Btn>
      </View>
    </Card>
  );
}
