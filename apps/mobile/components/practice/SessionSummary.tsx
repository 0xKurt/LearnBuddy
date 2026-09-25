// The end of a session: what the server counted (answered, right on the
// first try) and which topics sit or deserve another look. No scores, no
// streaks, nothing about what is still "due". After a practice test, every
// question with its solution (the first time she sees them).

import type { PracticeSummary, SessionItemView } from '@learnbuddy/shared-types/contracts';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import { LB } from '../../lib/theme/colors.js';
import { TYPE } from '../../lib/theme/type.js';
import { currentLocale } from '../../lib/i18n/index.js';
import { localDecimal } from '../../lib/numbers.js';
import { Card } from '../lb/Card.js';
import { Icon } from '../lb/Icon.js';
import { MathText } from '../math/MathText.js';

type Props = {
  summary: PracticeSummary;
  /** Homework help: the tasks were solved by the learner, with hints. */
  homework?: boolean;
  /** A practice test: the questions to go through, with their solutions. */
  review?: readonly SessionItemView[] | null;
};

export function SessionSummary({ summary, homework = false, review = null }: Props) {
  const { t } = useTranslation('practice');
  const hasTopics = summary.secure_topics.length > 0 || summary.shaky_topics.length > 0;
  return (
    <View style={{ gap: 16 }}>
      <Text accessibilityRole="header" style={TYPE.display}>
        {homework ? t('summary_help.title') : review ? t('summary_test.title') : t('summary.title')}
      </Text>
      <Card tone="mint" padding={20} radius={22}>
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <Stat
            value={summary.answered}
            label={homework ? t('summary_help.answered') : t('summary.answered')}
          />
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
      {review && review.length > 0 ? (
        <View style={{ gap: 10 }}>
          <Text accessibilityRole="header" style={TYPE.title}>
            {t('summary_test.review')}
          </Text>
          {review.map((r, n) => (
            <ReviewRow key={r.item.id} number={n + 1} row={r} />
          ))}
        </View>
      ) : null}
    </View>
  );
}

function ReviewRow({ number, row }: { number: number; row: SessionItemView }) {
  const { t } = useTranslation('practice');
  const right = row.status === 'correct';
  const status = right
    ? t('summary_test.right')
    : row.status === 'skipped'
      ? t('summary_test.skipped')
      : t('summary_test.missed');
  const answer =
    row.answer === null
      ? null
      : row.item.kind === 'numeric'
        ? localDecimal(row.answer, currentLocale())
        : row.answer;
  return (
    <Card tone={right ? 'mint' : 'paper'} padding={16} radius={18}>
      <View style={{ gap: 6 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <Icon name={right ? 'check' : 'arrow'} size={18} color={right ? LB.ink : LB.ink2} />
          </View>
          <Text style={[TYPE.label, { color: LB.ink2 }]}>{`${number} · ${status}`}</Text>
        </View>
        <MathText text={row.item.prompt} style={TYPE.body} />
        {answer !== null && !right ? (
          <MathText
            text={t('summary_test.solution', { answer })}
            style={[TYPE.body, { fontWeight: '600' }]}
          />
        ) : null}
      </View>
    </Card>
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
