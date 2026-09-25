// Where the learner is in the session ("Frage 2 von 8" and a thin bar – no
// timer, no pressure) and the question itself in large, readable text.

import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import { LB } from '../../lib/theme/colors.js';
import { TYPE } from '../../lib/theme/type.js';
import { Card } from '../lb/Card.js';
import { Progress } from '../lb/Progress.js';

type ProgressProps = {
  /** 1-based position of the question on screen. */
  position: number;
  total: number;
  /** Questions already closed (answered right, or solution shown). */
  closed: number;
};

export function ProgressRow({ position, total, closed }: ProgressProps) {
  const { t } = useTranslation('practice');
  return (
    <View style={{ gap: 8 }}>
      <Text style={[TYPE.body, { color: LB.ink2, fontWeight: '600' }]}>
        {t('progress', { current: position, total })}
      </Text>
      {/* Progress stretches along a row; the text above already says where we are. */}
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={{ flexDirection: 'row' }}
      >
        <Progress value={total > 0 ? closed / total : 0} />
      </View>
    </View>
  );
}

export function QuestionCard({ prompt, topic }: { prompt: string; topic: string | null }) {
  return (
    <Card tone="lavender" padding={20} radius={22}>
      {topic ? <Text style={[TYPE.body, { color: LB.ink2, marginBottom: 8 }]}>{topic}</Text> : null}
      <Text
        accessibilityRole="header"
        style={[TYPE.title, { fontSize: 20, lineHeight: 28, fontWeight: '500' }]}
      >
        {prompt}
      </Text>
    </Card>
  );
}
