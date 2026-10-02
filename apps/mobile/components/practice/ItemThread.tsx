// The short conversation about one question: the learner's answers on the
// right in violet, Buddy's replies on the left as white bubbles with the small
// orb beside them (the same bubbles as the Buddy thread, Conversation.tsx).
// Only the latest answer carries its judgement, always in words and never as
// "falsch", on a soft pastel chip (right = mint, almost = butter, not yet =
// neutral); a turn that was not an attempt (a question, "no idea") gets none.
// What arrives while the screen is open moves a little (Buddy's reply rises in, a right
// answer is celebrated softly, a "not yet" nudges her answer; Verdict.tsx); what was
// there when the question opened just stands.
// An explanation or a text with key points (issues #236, #258) gets no chip at all: its answer is
// the list under Buddy's reply (RubricNote) — which points are in her words — and a "Richtig" or
// "Noch nicht ganz" on top of that would be exactly the right/wrong the issues rule out.

import type { PracticeTurnView } from '@learnbuddy/shared-types/contracts';
import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { moonForReply, type MoonState } from '../../lib/buddy/moon.js';
import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { SHADOW } from '../../lib/theme/shadow.js';
import { TYPE } from '../../lib/theme/type.js';
import { BuddyOrb } from '../lb/BuddyOrb.js';
import { Rise } from '../lb/Motion.js';
import { MathText } from '../math/MathText.js';
import { useSpokenMath } from '../math/useSpokenMath.js';
import { RubricNote } from './RubricNote.js';
import { PronunciationNote } from './SpeakPanel.js';
import { Thinking } from './Thinking.js';
import { Nudge, VerdictTag, type VerdictKey } from './Verdict.js';

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
  /**
   * Whether her own answers stand in the thread (default). Not for a structured answer while its
   * question is open (issues #228–#230): her arrangement stands on the board itself, which is the
   * state, and Buddy's reply
   * says the verdict in words ("2 von 4 Paaren stimmen schon"). Echoed, four pairs became a
   * four-line bubble that the room above the board (`STRUCTURED_REPLY_ROOM`) could only show as a
   * cut-off strip under the question card (#229, shot 39e).
   */
  echoAnswers?: boolean;
};

export function ItemThread({
  turns,
  pending,
  hideVerdicts = false,
  thinkingLabel,
  pronunciation = false,
  echoAnswers = true,
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
        // Not echoed: neither the bubble nor its tag — the reply below says it in words.
        if (mine && !echoAnswers) return null;
        const fresh = !known.has(turn.id);
        // Buddy's reply to a right answer that arrives now: his moon celebrates (happy).
        const before = index > 0 ? turns[index - 1] : undefined;
        const afterCorrect =
          !hideVerdicts && before?.role === 'learner' && before.verdict === 'correct';
        // Answered point by point: the list under the reply says it, not a chip (#236, #258).
        const listed = mine && (turns[index + 1]?.rubric ?? null) !== null;
        // While a new answer is on its way, the previous judgement no longer applies.
        const verdict =
          mine && turn.id === latestAnswerId && pending === null && !hideVerdicts && !listed
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
            {pronunciation && !mine && turn.pronunciation ? (
              <PronunciationNote feedback={turn.pronunciation} />
            ) : null}
            {!mine && turn.rubric && !hideVerdicts ? <RubricNote feedback={turn.rubric} /> : null}
          </Rise>
        );
      })}
      {pending !== null ? (
        <>
          {echoAnswers ? (
            <Rise style={{ alignItems: 'flex-end' }}>
              <View style={{ maxWidth: '86%' }}>
                <Bubble mine faded text={pending} speaker={t('thread.you')} />
              </View>
            </Rise>
          ) : null}
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
      <MathText
        text={text}
        accessible={false}
        style={[TYPE.body, { color: mine ? palette.paper : palette.ink }]}
      />
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
