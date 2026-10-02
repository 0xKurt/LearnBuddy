// The short conversation about one question: the learner's answers on the
// right in violet, Buddy's replies on the left as white bubbles with the small
// orb beside them (the same bubbles as the Buddy thread, Conversation.tsx).
// Only the latest answer carries its judgement, always in words and never as
// "falsch", on a soft pastel chip (right = mint, almost = butter, not yet =
// neutral); a turn that was not an attempt (a question, "no idea") gets none.
// What arrives while the screen is open moves a little (Buddy's reply rises in, a right
// answer is celebrated softly, a "not yet" nudges her answer; Verdict.tsx); what was
// there when the question opened just stands.
// A reply of Buddy's may carry a figure (issue #298): an explanation with a picture — a parabola
// that changes with a. It stands right under his bubble, indented like the bubble, and opens
// full screen on a tap like every figure.

import type { PracticeTurnView } from '@learnbuddy/shared-types/contracts';
import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { moonForReply, type MoonState } from '../../lib/buddy/moon.js';
import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { SHADOW } from '../../lib/theme/shadow.js';
import { SPACE } from '../../lib/theme/space.js';
import { TYPE } from '../../lib/theme/type.js';
import { BuddyOrb } from '../lb/BuddyOrb.js';
import { Rise } from '../lb/Motion.js';
import { MathText } from '../math/MathText.js';
import { ZoomableFigure } from '../math/ZoomableFigure.js';
import { useSpokenMath } from '../math/useSpokenMath.js';
import { PronunciationNote } from './SpeakPanel.js';
import { Thinking } from './Thinking.js';
import { Nudge, VerdictTag, type VerdictKey } from './Verdict.js';

/** Buddy's orb (26) and the gap after it (8): a figure lines up with his bubble, not the orb. */
const ORB_INDENT = 34;
/**
 * A figure in the conversation stays a glance, not a page: on a 360×740 phone the question and
 * the field keep their room, and a tap opens it full size.
 */
const FIGURE_MAX = 180;
/**
 * As wide as a bubble, not as the screen: a figure drawn at full width is taller than it is
 * useful (its height follows its width), and on a 360×740 phone it pushed Buddy's own sentence
 * out of view. 220 keeps a function plot’s labels readable and the text above it on screen.
 */
const FIGURE_WIDTH = 220;

/** The lines of a reply; a text without a line break stays one paragraph. */
function paragraphs(text: string): string[] {
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l !== '');
  return lines.length > 0 ? lines : [text];
}

/** A line that is one maths run and nothing else ("$2x = 8$"). */
function mathLine(line: string): boolean {
  return /^\$[^$]+\$[.,]?$/.test(line);
}

/** null verdict = the answer could not be judged (no model), nothing was graded. */
function verdictKey(verdict: PracticeTurnView['verdict']): VerdictKey | null {
  if (verdict === 'not_an_attempt') return null;
  return verdict ?? 'unchecked';
}

type Props = {
  /** This question's turns, oldest first. */
  turns: PracticeTurnView[];
  /**
   * Speaking questions: what the judgement says hangs under Buddy's reply (issue #14) —
   * the card above shows the marked sentence, the words about it stand here.
   */
  pronunciation?: boolean;
  /** The answer being sent right now, shown until the server has it. */
  pending: string | null;
  /** A running test: no verdicts until the end. */
  hideVerdicts?: boolean;
  /** What Buddy is doing while `pending` is on its way (default: looking at her answer). */
  thinkingLabel?: string;
};

export function ItemThread({
  turns,
  pending,
  hideVerdicts = false,
  thinkingLabel,
  pronunciation = false,
}: Props) {
  const { t } = useTranslation('practice');
  // What was there when the screen opened stands still; what arrives now moves.
  const initial = useRef<ReadonlySet<string> | null>(null);
  if (initial.current === null) initial.current = new Set(turns.map((turn) => turn.id));
  const known = initial.current;
  if (turns.length === 0 && pending === null) return null;

  let latestAnswerId: string | null = null;
  let latestReplyId: string | null = null;
  for (const turn of turns) {
    if (turn.role === 'learner') latestAnswerId = turn.id;
    else latestReplyId = turn.id;
  }

  return (
    <View style={{ gap: 12 }}>
      {turns.map((turn, index) => {
        const mine = turn.role === 'learner';
        const fresh = !known.has(turn.id);
        // Buddy's reply to a right answer that arrives now: his moon celebrates (happy).
        const before = index > 0 ? turns[index - 1] : undefined;
        const afterCorrect =
          !hideVerdicts && before?.role === 'learner' && before.verdict === 'correct';
        // While a new answer is on its way, the previous judgement no longer applies.
        const verdict =
          mine && turn.id === latestAnswerId && pending === null && !hideVerdicts
            ? verdictKey(turn.verdict)
            : null;
        const bubble = (
          <Bubble
            mine={mine}
            text={turn.text}
            speaker={mine ? t('thread.you') : t('thread.buddy')}
            orb={moonForReply({ fresh, afterCorrect })}
            // Only the newest reply's orb moves, and none while Buddy is looking again.
            alive={turn.id === latestReplyId && pending === null}
          />
        );
        return (
          <Rise
            key={turn.id}
            // Her own answer was on screen already (while it was sent): only Buddy's reply
            // rises in.
            animate={fresh && !mine}
            delay={60}
            style={{ alignItems: mine ? 'flex-end' : 'flex-start', gap: 6 }}
          >
            {mine ? (
              <Nudge active={fresh && (verdict === 'partially_correct' || verdict === 'incorrect')}>
                {bubble}
              </Nudge>
            ) : (
              bubble
            )}
            {verdict ? (
              <VerdictTag verdict={verdict} label={t(`verdict.${verdict}`)} fresh={fresh} />
            ) : null}
            {!mine && turn.figure ? (
              <View
                testID="reply-figure"
                style={{
                  alignSelf: 'stretch',
                  paddingLeft: ORB_INDENT,
                  maxWidth: ORB_INDENT + FIGURE_WIDTH,
                }}
              >
                <ZoomableFigure figure={turn.figure} maxHeight={FIGURE_MAX} />
              </View>
            ) : null}
            {pronunciation && !mine && turn.pronunciation ? (
              <PronunciationNote feedback={turn.pronunciation} />
            ) : null}
          </Rise>
        );
      })}
      {pending !== null ? (
        <>
          <Rise style={{ alignItems: 'flex-end' }}>
            <View style={{ maxWidth: '86%' }}>
              <Bubble mine faded text={pending} speaker={t('thread.you')} />
            </View>
          </Rise>
          <Thinking label={thinkingLabel ?? t('thread.thinking')} />
        </>
      ) : null}
    </View>
  );
}

function Bubble({
  mine,
  text,
  speaker,
  faded = false,
  orb = 'idle',
  alive = false,
}: {
  mine: boolean;
  text: string;
  speaker: string;
  faded?: boolean;
  orb?: MoonState;
  alive?: boolean;
}) {
  const { palette } = useTheme();
  const spoken = useSpokenMath(text);
  const bubble = (
    <View
      accessible
      accessibilityLabel={`${speaker}: ${spoken}`}
      style={[
        {
          flexShrink: 1,
          backgroundColor: mine ? palette.primary : palette.paper,
          borderRadius: 22,
          borderBottomRightRadius: mine ? 6 : 22,
          borderBottomLeftRadius: mine ? 22 : 6,
          paddingHorizontal: 16,
          paddingVertical: 11,
          opacity: faded ? 0.7 : 1,
        },
        mine ? null : SHADOW.soft,
      ]}
    >
      {/* One paragraph per line: MathText lays a line with math out as one wrapping row, where
          a line break would be lost — and a step of a guided example (issue #298) is only
          readable when each equation stands on a line of its own, like in an exercise book. */}
      <View style={{ gap: SPACE.xs }}>
        {paragraphs(text).map((line, i) => {
          const body = (
            <MathText
              text={line}
              accessible={false}
              style={[TYPE.body, { color: mine ? palette.paper : palette.ink }]}
            />
          );
          // A line that is nothing but maths is a line of a calculation: it gets a rule on its
          // left, like a worked line in an exercise book, so the steps stand out from the words.
          return mathLine(line) ? (
            <View
              key={i}
              style={{
                borderLeftWidth: 3,
                borderLeftColor: mine ? palette.paper : palette.primary,
                paddingLeft: SPACE.sm,
              }}
            >
              {body}
            </View>
          ) : (
            <View key={i}>{body}</View>
          );
        })}
      </View>
    </View>
  );
  if (mine) return bubble;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8, maxWidth: '92%' }}>
      <BuddyOrb size={26} state={orb} breathe={alive} />
      {bubble}
    </View>
  );
}
