// The end of a session: what the server counted (answered, right on the
// first try) and which topics sit or deserve another look. No scores, no
// streaks, nothing about what is still "due".

import type { PracticeSummary } from '@learnbuddy/shared-types/contracts';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import { LB } from '../../lib/theme/colors.js';
import { TYPE } from '../../lib/theme/type.js';
import { Card } from '../lb/Card.js';

export function SessionSummary({ summary }: { summary: PracticeSummary }) {
  const { t } = useTranslation('practice');
  const hasTopics = summary.secure_topics.length > 0 || summary.shaky_topics.length > 0;
  return (
    <View style={{ gap: 16 }}>
      <Text accessibilityRole="header" style={TYPE.display}>
        {t('summary.title')}
      </Text>
      <Card tone="mint" padding={20} radius={22}>
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <Stat value={summary.answered} label={t('summary.answered')} />
          <Stat value={summary.first_try} label={t('summary.first_try')} />
        </View>
        {hasTopics ? (
          <View style={{ gap: 6, marginTop: 16 }}>
            {summary.secure_topics.length > 0 ? (
              <Text style={TYPE.body}>
                {t('summary.secure', { topics: summary.secure_topics.join(', ') })}
              </Text>
            ) : null}
            {summary.shaky_topics.length > 0 ? (
              <Text style={TYPE.body}>
                {t('summary.shaky', { topics: summary.shaky_topics.join(', ') })}
              </Text>
            ) : null}
          </View>
        ) : null}
      </Card>
    </View>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <View
      accessible
      accessibilityLabel={`${label}: ${value}`}
      style={{
        flex: 1,
        backgroundColor: LB.paper,
        borderRadius: 16,
        paddingVertical: 14,
        paddingHorizontal: 14,
        gap: 2,
      }}
    >
      <Text
        style={{
          fontSize: 30,
          lineHeight: 36,
          fontWeight: '600',
          color: LB.ink,
          letterSpacing: -0.4,
        }}
      >
        {value}
      </Text>
      <Text style={[TYPE.body, { color: LB.ink2 }]}>{label}</Text>
    </View>
  );
}
