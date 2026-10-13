// The end of a session: one or two true, kind sentences (what she did; a whole round right
// at once is named) and which topics sit or deserve another look — from the one summary the
// server computes, so a topic is never in both lists (user feedback #1, #3). No hit rate, no
// zero, no scores, no streaks, nothing about what is still "due". After a practice test,
// every question with its solution (the first time she sees them); questions she never got
// to are marked as such, not as wrong (audit M-36) — in the one result list the roleplay's
// feedback uses too (lb/ResultList.tsx, issue #384).
//
// The factual sentences and the results stand beneath the shared header, whose orb celebrates
// (`RunResult`); nothing here draws a Buddy of its own (HANDOFF §4).
// A session that just ended here also feels like one (a success haptic, once).

import type {
  PracticeSummary,
  SessionItemView,
  SessionMode,
} from '@learnbuddy/shared-types/contracts';
import { useEffect } from 'react';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import { haptic } from '../../lib/haptics.js';
import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { RESULT } from '../../lib/theme/results.js';
import { RHYTHM } from '../../lib/theme/space.js';
import { TYPE } from '../../lib/theme/type.js';
import { currentLocale } from '../../lib/i18n/index.js';
import { localDecimal } from '../../lib/numbers.js';
import { summaryLines } from '../../lib/practice/summaryLine.js';
import { timeUpLines } from '../../lib/practice/testClock.js';
import { ResultList, type ResultRow } from '../lb/ResultList.js';

type Props = {
  summary: PracticeSummary;
  mode: SessionMode;
  /** A practice test: the questions to go through, with their solutions. */
  review?: readonly SessionItemView[] | null;
  /** The session just ended on this screen (not reopened later): a success haptic. */
  celebrate?: boolean;
  /**
   * A test she sat with time, and the time ran out (issue #241): the result says how far she
   * got, and the questions still open are "nicht beantwortet" — never wrong.
   */
  ranOut?: boolean;
};

export function SessionSummary({
  summary,
  mode,
  review = null,
  celebrate = false,
  ranOut = false,
}: Props) {
  const { palette } = useTheme();
  useEffect(() => {
    if (celebrate) haptic.success();
  }, [celebrate]);
  const { t } = useTranslation('practice');
  const homework = mode === 'help';
  // The time ran out (issue #241): how far she got is the strong sentence; that what stayed open
  // is not wrong follows as a plain one — one bold paragraph of three lines read like a verdict.
  const timeUp = ranOut && review ? timeUpLines(summary, review.length) : [];
  const lines = (
    timeUp.length > 0
      ? timeUp.filter((l) => l.count !== undefined)
      : summaryLines(summary, mode).map((l) => ({ ...l, answered: undefined }))
  ).map((l) =>
    l.count === undefined ? t(l.key) : t(l.key, { count: l.count, answered: l.answered }),
  );
  const rest = timeUp.filter((l) => l.count === undefined).map((l) => t(l.key));
  // Homework is about solving it herself, not about topics that "sit".
  const secure = homework ? [] : summary.secure_topics;
  const shaky = homework ? [] : summary.shaky_topics;
  const sentences = [
    ...(lines.length > 0 ? [{ key: 'lines', text: lines.join(' '), strong: true }] : []),
    ...rest.map((text, i) => ({ key: `rest-${i}`, text, strong: false })),
    ...(secure.length > 0
      ? [{ key: 'secure', text: t('summary.secure', { topics: secure.join(', ') }), strong: false }]
      : []),
    ...(shaky.length > 0
      ? [{ key: 'shaky', text: t('summary.shaky', { topics: shaky.join(', ') }), strong: false }]
      : []),
  ];
  return (
    <View style={{ gap: RHYTHM.sections }}>
      <View style={{ gap: RESULT.introGap }}>
        <Text accessibilityRole="header" style={TYPE.display}>
          {homework
            ? t('summary_help.title')
            : mode === 'test'
              ? t(ranOut ? 'summary_test.time_up_title' : 'summary_test.title')
              : t('summary.title')}
        </Text>
        {sentences.map((line) => (
          <Text key={line.key} style={[TYPE.body, { color: palette.ink2 }]}>
            {line.text}
          </Text>
        ))}
      </View>
      {review && review.length > 0 ? (
        <ResultList
          variant="rows"
          title={t('summary_test.review')}
          rows={review.map((row, n) => reviewRow(row, n + 1, ranOut, t))}
          animate={false}
        />
      ) : null}
    </View>
  );
}

/** One question of a practice test as a row of the result list: its state and its solution. */
function reviewRow(row: SessionItemView, number: number, ranOut: boolean, t: TFunction): ResultRow {
  const right = row.status === 'correct';
  const status = right
    ? t('summary_test.right')
    : row.status === 'skipped'
      ? t('summary_test.skipped')
      : row.status === 'open'
        ? // Left open when the time ran out: not answered — said as exactly that (issue #241).
          t(ranOut ? 'summary_test.unanswered' : 'summary_test.untouched')
        : t('summary_test.missed');
  const answer =
    row.answer === null
      ? null
      : row.item.kind === 'numeric'
        ? localDecimal(row.answer, currentLocale())
        : row.answer;
  return {
    key: row.item.id,
    right,
    status: row.status,
    label: `${number} · ${status}`,
    text: row.item.prompt,
    detail: answer !== null && !right ? t('summary_test.solution', { answer }) : null,
    // The review explains, not only lists (report #388 §3.2): the worked way where one was
    // prepared, under the solution of a question she did not get right.
    note: right ? null : row.explanation,
  };
}
