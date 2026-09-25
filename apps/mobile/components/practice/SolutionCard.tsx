// The solution of a closed question (the API only sends it once the
// question is closed). It stays on screen until the learner taps "Weiter".

import type { SessionItemView } from '@learnbuddy/shared-types/contracts';
import { useTranslation } from 'react-i18next';
import { Text } from 'react-native';

import { currentLocale } from '../../lib/i18n/index.js';
import { localDecimal } from '../../lib/numbers.js';
import { LB } from '../../lib/theme/colors.js';
import { TYPE } from '../../lib/theme/type.js';
import { Card } from '../lb/Card.js';

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
    <Card tone={solved ? 'mint' : 'sky'} padding={18} radius={20}>
      <Text style={[TYPE.body, { color: LB.ink2, fontWeight: '600' }]}>{t('solution.title')}</Text>
      <Text style={[TYPE.title, { marginTop: 4 }]}>
        {numeric ? localDecimal(answer, currentLocale()) : answer}
      </Text>
      {solved ? null : (
        <Text style={[TYPE.body, { color: LB.ink2, marginTop: 8 }]}>{t('solution.calm')}</Text>
      )}
    </Card>
  );
}
