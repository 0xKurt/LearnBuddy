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
import { summaryLines, topicsToReview } from '../../lib/practice/summaryLine.js';
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
  // The time ran out (issue #241): how far she got comes first; that what stayed open is not
  // wrong follows it.
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
  // Only what did not end right deserves another look (issue #630): an all-right round says so.
  const shaky = topicsToReview(summary, mode);
  // One calm paragraph under the heading (design ui_kits/app/Done.jsx:26): what she did, what
  // stayed open, what sits and what deserves another look — sentences, never a stack of lines.
  const lead = [
    ...lines,
    ...rest,
    ...(secure.length > 0 ? [t('summary.secure', { topics: secure.join(', ') })] : []),
    ...(shaky.length > 0 ? [t('summary.shaky', { topics: shaky.join(', ') })] : []),
  ].join(' ');
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
        {lead ? (
          <Text testID="summary-lead" style={[TYPE.body, { color: palette.ink2 }]}>
            {lead}
          </Text>
        ) : null}
      </View>
      {review && review.length > 0 ? (
        <ResultList
          variant="rows"
          title={t('summary_test.review')}
          rows={review.map((row) => reviewRow(row, mode, ranOut, t))}
          animate={false}
        />
      ) : null}
    </View>
  );
}

/** One question of a practice test as a row of the result list: its state and its solution. */
function reviewRow(
  row: SessionItemView,
  mode: SessionMode,
  ranOut: boolean,
  t: TFunction,
): ResultRow {
  const right = row.status === 'correct';
  // Outside a test, "Lösung zeigen" is only there after a try or a hint (`revealReady`), and the
  // server stores it as `skipped` (practice/setAside.ts). She did not skip it — she tried and then
  // looked at the solution, which is what a solution shown after her miss says (issue #643, device:
  // "Übersprungen" under a question she had answered "5/8"). In a test it is "Überspringen".
  const shown = mode !== 'test' && row.status === 'skipped' && row.attempts + row.hints_used > 0;
  const state = shown ? 'revealed' : row.status;
  const status = right
    ? t('summary_test.right')
    : state === 'skipped'
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
    status: state,
    // The state alone, at the row's right end (Done.jsx:36): the question is the row's title.
    label: status,
    text: row.item.prompt,
    detail: answer !== null && !right ? t('summary_test.solution', { answer }) : null,
    // The review explains, not only lists (report #388 §3.2): the worked way where one was
    // prepared, under the solution of a question she did not get right.
    note: right ? null : row.explanation,
  };
}
