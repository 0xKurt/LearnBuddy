// The end of a session: one or two true, kind sentences (what she did; a whole round right
// at once is named) and which topics sit or deserve another look — from the one summary the
// server computes, so a topic is never in both lists (user feedback #1, #3). No hit rate, no
// zero, no scores, no streaks, nothing about what is still "due". After a practice test,
// every question with its solution (the first time she sees them); questions she never got
// to are marked as such, not as wrong (audit M-36).
//
// A warm, calm moment: Buddy's orb, the headline, the sentences on a white card – no
// confetti, nothing that counts what is left.

import type {
  PracticeSummary,
  SessionItemView,
  SessionMode,
} from '@learnbuddy/shared-types/contracts';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import { LB } from '../../lib/theme/colors.js';
import { SHADOW } from '../../lib/theme/shadow.js';
import { TYPE } from '../../lib/theme/type.js';
import { BuddyOrb } from '../lb/BuddyOrb.js';
import { currentLocale } from '../../lib/i18n/index.js';
import { localDecimal } from '../../lib/numbers.js';
import { summaryLines } from '../../lib/practice/summaryLine.js';
import { Icon } from '../lb/Icon.js';
import { MathText } from '../math/MathText.js';

type Props = {
  summary: PracticeSummary;
  mode: SessionMode;
  /** A practice test: the questions to go through, with their solutions. */
  review?: readonly SessionItemView[] | null;
};

export function SessionSummary({ summary, mode, review = null }: Props) {
  const { t } = useTranslation('practice');
  const homework = mode === 'help';
  const lines = summaryLines(summary, mode).map((l) =>
    l.count === undefined ? t(l.key) : t(l.key, { count: l.count }),
  );
  // Homework is about solving it herself, not about topics that "sit".
  const secure = homework ? [] : summary.secure_topics;
  const shaky = homework ? [] : summary.shaky_topics;
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
      {lines.length > 0 || secure.length > 0 || shaky.length > 0 ? (
        <View style={[SOFT_CARD, { gap: 8 }]}>
          {lines.length > 0 ? (
            <Text style={[TYPE.body, { fontWeight: '600' }]}>{lines.join(' ')}</Text>
          ) : null}
          {secure.length > 0 ? (
            <Text style={TYPE.body}>{t('summary.secure', { topics: secure.join(', ') })}</Text>
          ) : null}
          {shaky.length > 0 ? (
            <Text style={TYPE.body}>{t('summary.shaky', { topics: shaky.join(', ') })}</Text>
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
      : row.status === 'open'
        ? t('summary_test.untouched')
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

/** A white card on a soft shadow (no hairline box). */
const SOFT_CARD = {
  backgroundColor: LB.paper,
  borderRadius: 22,
  padding: 18,
  ...SHADOW.soft,
} as const;
