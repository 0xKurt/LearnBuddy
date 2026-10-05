// The end of a session: one or two true, kind sentences (what she did; a whole round right
// at once is named) and which topics sit or deserve another look — from the one summary the
// server computes, so a topic is never in both lists (user feedback #1, #3). No hit rate, no
// zero, no scores, no streaks, nothing about what is still "due". After a practice test,
// every question with its solution (the first time she sees them); questions she never got
// to are marked as such, not as wrong (audit M-36) — in the one result list the roleplay's
// feedback uses too (lb/ResultList.tsx, issue #384).
//
// A warm, calm moment: Buddy's orb, the headline, the sentences on a white card – no
// confetti, nothing that counts what is left. They arrive one after the other: the orb
// with a soft halo, then the headline, then each sentence (reduce motion: all at once).
// A session that just ended here also feels like one (a success haptic, once).

import type {
  PracticeSummary,
  SessionItemView,
  SessionMode,
} from '@learnbuddy/shared-types/contracts';
import { useEffect, useState } from 'react';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';

import { haptic } from '../../lib/haptics.js';
import type { Palette } from '../../lib/theme/palettes.js';
import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { DURATION, EASE } from '../../lib/theme/motion.js';
import { SHADOW } from '../../lib/theme/shadow.js';
import { TYPE } from '../../lib/theme/type.js';
import { BuddyOrb, type MoonState } from '../lb/BuddyOrb.js';
import { Rise } from '../lb/Motion.js';
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

/** When each part arrives (ms after the summary appears). */
const AT = { title: 260, card: 460, line: 140, review: 900 } as const;

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
    <View style={{ gap: 18 }}>
      <View style={{ alignItems: 'center', gap: 14, paddingTop: 36 }}>
        {/* Room above the orb: the celebrating moon flies up to about 0.75 × its size. */}
        <OrbArrival celebrate={celebrate} />
        <Rise slow delay={AT.title}>
          <Text accessibilityRole="header" style={[TYPE.display, { textAlign: 'center' }]}>
            {homework
              ? t('summary_help.title')
              : review
                ? t(ranOut ? 'summary_test.time_up_title' : 'summary_test.title')
                : t('summary.title')}
          </Text>
        </Rise>
      </View>
      {sentences.length > 0 ? (
        <Rise slow delay={AT.card} style={[softCard(palette), { gap: 8 }]}>
          {sentences.map((line, i) => (
            <Rise key={line.key} slow delay={AT.card + (i + 1) * AT.line}>
              <Text style={[TYPE.body, line.strong ? { fontWeight: '600' } : null]}>
                {line.text}
              </Text>
            </Rise>
          ))}
        </Rise>
      ) : null}
      {review && review.length > 0 ? (
        <View style={{ marginTop: 4 }}>
          <ResultList
            title={t('summary_test.review')}
            rows={review.map((r, n) => reviewRow(r, n + 1, ranOut, t))}
            delay={AT.review}
          />
        </View>
      ) : null}
    </View>
  );
}

/**
 * Buddy's orb arrives: it grows in softly while a pastel halo breathes out behind it. A
 * session that just ended here is a "Geschafft" moment: once the orb is there, his moon
 * spirals up and bursts into sparkles (lib/buddy/moon.ts, happy).
 */
function OrbArrival({ celebrate }: { celebrate: boolean }) {
  const { palette } = useTheme();
  const reduced = useReducedMotion();
  const [moon, setMoon] = useState<MoonState>('idle');
  useEffect(() => {
    if (!celebrate) return;
    const go = setTimeout(() => setMoon('happy'), reduced ? 0 : DURATION.gentle);
    return () => clearTimeout(go);
  }, [celebrate, reduced]);
  const orb = useSharedValue(reduced ? 1 : 0);
  const halo = useSharedValue(reduced ? 1 : 0);
  useEffect(() => {
    if (reduced) return;
    orb.value = withTiming(1, { duration: DURATION.gentle + 120, easing: EASE.celebrate });
    halo.value = withDelay(
      DURATION.quick,
      withTiming(1, { duration: DURATION.gentle * 3, easing: EASE.standard }),
    );
  }, [reduced, orb, halo]);
  const orbStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, orb.value * 1.5),
    transform: [{ scale: 0.7 + orb.value * 0.3 }],
  }));
  const haloStyle = useAnimatedStyle(() => ({
    opacity: reduced ? 0 : 0.55 * (1 - halo.value),
    transform: [{ scale: 0.9 + halo.value * 0.7 }],
  }));
  return (
    <View
      style={{ width: 96, height: 96, alignItems: 'center', justifyContent: 'center' }}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Animated.View
        style={[
          {
            position: 'absolute',
            width: 96,
            height: 96,
            borderRadius: 48,
            backgroundColor: palette.lavenderDeep,
          },
          haloStyle,
        ]}
      />
      <Animated.View style={orbStyle}>
        <BuddyOrb size={96} state={moon} />
      </Animated.View>
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
    label: `${number} · ${status}`,
    text: row.item.prompt,
    detail: answer !== null && !right ? t('summary_test.solution', { answer }) : null,
    // The review explains, not only lists (report #388 §3.2): the worked way where one was
    // prepared, under the solution of a question she did not get right.
    note: right ? null : row.explanation,
  };
}

/** A white card on a soft shadow (no hairline box). From the palette in use (issue #84). */
const softCard = (p: Palette) =>
  ({
    backgroundColor: p.paper,
    borderRadius: 22,
    padding: 18,
    ...SHADOW.soft,
  }) as const;
