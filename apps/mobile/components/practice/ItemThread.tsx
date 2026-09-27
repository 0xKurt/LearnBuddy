// The short conversation about one question: the learner's answers on the
// right in violet, Buddy's replies on the left as white bubbles with the small
// orb beside them (the same bubbles as the Buddy thread, Conversation.tsx).
// Only the latest answer carries its judgement, always in words and never as
// "falsch", on a soft pastel chip (right = mint, almost = butter, not yet =
// neutral); a turn that was not an attempt (a question, "no idea") gets none.
// What arrives while the screen is open moves a little (Buddy's reply rises in, a right
// answer is celebrated softly, a "not yet" nudges her answer; Verdict.tsx); what was
// there when the question opened just stands.

import type { PracticeTurnView } from '@learnbuddy/shared-types/contracts';
import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { LB } from '../../lib/theme/colors.js';
import { SHADOW } from '../../lib/theme/shadow.js';
import { TYPE } from '../../lib/theme/type.js';
import { BuddyOrb } from '../lb/BuddyOrb.js';
import { Rise } from '../lb/Motion.js';
import { MathText } from '../math/MathText.js';
import { useSpokenMath } from '../math/useSpokenMath.js';
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
  /** The answer being sent right now, shown until the server has it. */
  pending: string | null;
  /** A running test: no verdicts until the end. */
  hideVerdicts?: boolean;
};

export function ItemThread({ turns, pending, hideVerdicts = false }: Props) {
  const { t } = useTranslation('practice');
  // What was there when the screen opened stands still; what arrives now moves.
  const initial = useRef<ReadonlySet<string> | null>(null);
  if (initial.current === null) initial.current = new Set(turns.map((turn) => turn.id));
  const known = initial.current;
  if (turns.length === 0 && pending === null) return null;

  let latestAnswerId: string | null = null;
  for (const turn of turns) if (turn.role === 'learner') latestAnswerId = turn.id;

  return (
    <View style={{ gap: 12 }}>
      {turns.map((turn) => {
        const mine = turn.role === 'learner';
        const fresh = !known.has(turn.id);
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
          <Thinking label={t('thread.thinking')} />
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
}: {
  mine: boolean;
  text: string;
  speaker: string;
  faded?: boolean;
}) {
  const spoken = useSpokenMath(text);
  const bubble = (
    <View
      accessible
      accessibilityLabel={`${speaker}: ${spoken}`}
      style={[
        {
          flexShrink: 1,
          backgroundColor: mine ? LB.primary : LB.paper,
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
        style={[TYPE.body, { color: mine ? '#fff' : LB.ink }]}
      />
    </View>
  );
  if (mine) return bubble;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8, maxWidth: '92%' }}>
      <BuddyOrb size={26} />
      {bubble}
    </View>
  );
}
