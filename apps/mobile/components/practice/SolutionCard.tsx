// The solution of a closed question (the API only sends it once the
// question is closed). It stays on screen until the learner taps "Weiter".

import type { SessionItemView } from '@learnbuddy/shared-types/contracts';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import { currentLocale } from '../../lib/i18n/index.js';
import { localDecimal } from '../../lib/numbers.js';
import { LB } from '../../lib/theme/colors.js';
import { TYPE } from '../../lib/theme/type.js';
import { Card } from '../lb/Card.js';
import { MathText } from '../math/MathText.js';

type Props = {
  status: Exclude<SessionItemView['status'], 'open'>;
  answer: string;
  /** Numbers are shown the way the learner writes them (0,75 in German). */
  numeric: boolean;
};

export function SolutionCard({ status, answer, numeric }: Props) {
  const { t } = useTranslation('practice');
  const solved = status === 'correct';
  return (
    <Card tone={solved ? 'mint' : 'sky'} padding={20} radius={24}>
      <Text style={[TYPE.body, { color: LB.ink2, fontWeight: '600' }]}>{t('solution.title')}</Text>
      <View style={{ marginTop: 4 }}>
        <MathText
          text={numeric ? localDecimal(answer, currentLocale()) : answer}
          style={TYPE.title}
        />
      </View>
      {solved ? null : (
        <Text style={[TYPE.body, { color: LB.ink2, marginTop: 8 }]}>{t('solution.calm')}</Text>
      )}
    </Card>
  );
}

/** Homework help closes a task without a solution to show: she found it herself. */
export function SelfSolvedCard() {
  const { t } = useTranslation('practice');
  return (
    <Card tone="mint" padding={20} radius={24}>
      <View accessibilityLiveRegion="polite">
        <Text style={TYPE.title}>{t('self_solved.title')}</Text>
        <Text style={[TYPE.body, { color: LB.ink2, marginTop: 4 }]}>{t('self_solved.body')}</Text>
      </View>
    </Card>
  );
}
