// The end of a session: what the server counted (answered, right on the
// first try) and which topics sit or deserve another look. No scores, no
// streaks, nothing about what is still "due". After a practice test, every
// question with its solution (the first time she sees them).
//
// A warm, calm moment: Buddy's orb, the headline, the two numbers on white
// cards – no confetti, nothing that counts what is left.

import type { PracticeSummary, SessionItemView } from '@learnbuddy/shared-types/contracts';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import { LB } from '../../lib/theme/colors.js';
import { SHADOW } from '../../lib/theme/shadow.js';
import { TYPE } from '../../lib/theme/type.js';
import { BuddyOrb } from '../buddy/BuddyOrb.js';
import { currentLocale } from '../../lib/i18n/index.js';
import { localDecimal } from '../../lib/numbers.js';
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
    <View style={{ gap: 18 }}>
      <View style={{ alignItems: 'center', gap: 14, paddingTop: 12 }}>
        <BuddyOrb size={96} />
        <Text accessibilityRole="header" style={[TYPE.display, { textAlign: 'center' }]}>
          {homework
            ? t('summary_help.title')
            : review
              ? t('summary_test.title')
              : t('summary.title')}
        </Text>
      </View>
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <Stat
          value={summary.answered}
          label={homework ? t('summary_help.answered') : t('summary.answered')}
        />
        <Stat value={summary.first_try} label={t('summary.first_try')} />
      </View>
      {hasTopics ? (
        <View style={[SOFT_CARD, { gap: 8 }]}>
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
      {review && review.length > 0 ? (
        <View style={{ gap: 12, marginTop: 4 }}>
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
    <View style={[SOFT_CARD, { padding: 16, gap: 6 }, right ? { backgroundColor: LB.mint } : null]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <Icon
            name={right ? 'check' : 'arrow'}
            size={18}
            color={right ? LB.successText : LB.ink2}
          />
        </View>
        <Text style={[TYPE.label, { color: right ? LB.successText : LB.ink2 }]}>
          {`${number} · ${status}`}
        </Text>
      </View>
      <MathText text={row.item.prompt} style={TYPE.body} />
      {answer !== null && !right ? (
        <MathText
          text={t('summary_test.solution', { answer })}
          style={[TYPE.body, { fontWeight: '600' }]}
        />
      ) : null}
    </View>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <View
      accessible
      accessibilityLabel={`${label}: ${value}`}
      style={[SOFT_CARD, { flex: 1, paddingVertical: 16, gap: 2 }]}
    >
      <Text
        style={{
          fontSize: 34,
          lineHeight: 40,
          fontWeight: '700',
          color: LB.primaryDk,
          letterSpacing: -0.6,
        }}
      >
        {value}
      </Text>
      <Text style={[TYPE.small, { color: LB.ink2 }]}>{label}</Text>
    </View>
  );
}

/** A white card on a soft shadow (no hairline box). */
const SOFT_CARD = {
  backgroundColor: LB.paper,
  borderRadius: 22,
  padding: 18,
  ...SHADOW.soft,
} as const;
