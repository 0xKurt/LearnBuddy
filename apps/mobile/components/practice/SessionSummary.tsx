// The end of a session: one or two true, kind sentences (what she did; a whole round right
// at once is named) and which topics sit or deserve another look — from the one summary the
// server computes, so a topic is never in both lists (user feedback #1, #3). No hit rate, no
// zero, no scores, no streaks, nothing about what is still "due". After a practice test,
// every question with its solution (the first time she sees them); questions she never got
// to are marked as such, not as wrong (audit M-36).
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
import { Icon } from '../lb/Icon.js';
import { MathText } from '../math/MathText.js';

type Props = {
  summary: PracticeSummary;
  mode: SessionMode;
  /** A practice test: the questions to go through, with their solutions. */
  review?: readonly SessionItemView[] | null;
  /** The session just ended on this screen (not reopened later): a success haptic. */
  celebrate?: boolean;
};

/** When each part arrives (ms after the summary appears). */
const AT = { title: 260, card: 460, line: 140, review: 900 } as const;

export function SessionSummary({ summary, mode, review = null, celebrate = false }: Props) {
  const { palette } = useTheme();
  useEffect(() => {
    if (celebrate) haptic.success();
  }, [celebrate]);
  const { t } = useTranslation('practice');
  const homework = mode === 'help';
  const lines = summaryLines(summary, mode).map((l) =>
    l.count === undefined ? t(l.key) : t(l.key, { count: l.count }),
  );
  // Homework is about solving it herself, not about topics that "sit".
  const secure = homework ? [] : summary.secure_topics;
  const shaky = homework ? [] : summary.shaky_topics;
  const sentences = [
    ...(lines.length > 0 ? [{ key: 'lines', text: lines.join(' '), strong: true }] : []),
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
                ? t('summary_test.title')
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
        <View style={{ gap: 12, marginTop: 4 }}>
          <Rise delay={AT.review}>
            <Text accessibilityRole="header" style={TYPE.title}>
              {t('summary_test.review')}
            </Text>
          </Rise>
          {review.map((r, n) => (
            // Only the first few are staggered; the rest are below the fold anyway.
            <Rise key={r.item.id} index={Math.min(n, 5)} delay={AT.review + 60}>
              <ReviewRow number={n + 1} row={r} />
            </Rise>
          ))}
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

function ReviewRow({ number, row }: { number: number; row: SessionItemView }) {
  const { palette } = useTheme();
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
    <View
      style={[
        softCard(palette),
        { padding: 16, gap: 6 },
        right ? { backgroundColor: palette.mint } : null,
      ]}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <Icon
            name={right ? 'check' : 'arrow'}
            size={18}
            color={right ? palette.successText : palette.ink2}
          />
        </View>
        <Text style={[TYPE.label, { color: right ? palette.successText : palette.ink2 }]}>
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

/** A white card on a soft shadow (no hairline box). From the palette in use (issue #84). */
const softCard = (p: Palette) =>
  ({
    backgroundColor: p.paper,
    borderRadius: 22,
    padding: 18,
    ...SHADOW.soft,
  }) as const;
