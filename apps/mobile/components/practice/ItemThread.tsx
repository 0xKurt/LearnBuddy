// The short conversation about one question: the learner's answers on the
// right in violet, Buddy's replies on the left as white bubbles with the small
// orb beside them (the same bubbles as the Buddy thread, Conversation.tsx).
// Only the latest answer carries its judgement, always in words and never as
// "falsch", on a soft pastel chip (right = mint, almost = butter, not yet =
// neutral); a turn that was not an attempt (a question, "no idea") gets none.

import type { PracticeTurnView } from '@learnbuddy/shared-types/contracts';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Text, View } from 'react-native';

import { LB } from '../../lib/theme/colors.js';
import { SHADOW } from '../../lib/theme/shadow.js';
import { TYPE } from '../../lib/theme/type.js';
import { BuddyOrb } from '../buddy/BuddyOrb.js';
import { Icon } from '../lb/Icon.js';
import { MathText } from '../math/MathText.js';
import { useSpokenMath } from '../math/useSpokenMath.js';

type VerdictKey = 'correct' | 'partially_correct' | 'incorrect' | 'unchecked';

// Soft pastel chips with dark text; the word carries the meaning (a small check for "right").
const VERDICT_BG: Record<VerdictKey, string> = {
  correct: LB.mint,
  partially_correct: LB.butter,
  incorrect: LB.canvas,
  unchecked: LB.canvas,
};
const VERDICT_TEXT: Record<VerdictKey, string> = {
  correct: LB.successText,
  partially_correct: LB.warningText,
  incorrect: LB.ink2,
  unchecked: LB.ink2,
};

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
  if (turns.length === 0 && pending === null) return null;

  let latestAnswerId: string | null = null;
  for (const turn of turns) if (turn.role === 'learner') latestAnswerId = turn.id;

  return (
    <View style={{ gap: 12 }}>
      {turns.map((turn) => {
        const mine = turn.role === 'learner';
        // While a new answer is on its way, the previous judgement no longer applies.
        const verdict =
          mine && turn.id === latestAnswerId && pending === null && !hideVerdicts
            ? verdictKey(turn.verdict)
            : null;
        return (
          <View key={turn.id} style={{ alignItems: mine ? 'flex-end' : 'flex-start', gap: 6 }}>
            <Bubble
              mine={mine}
              text={turn.text}
              speaker={mine ? t('thread.you') : t('thread.buddy')}
            />
            {verdict ? <VerdictTag verdict={verdict} label={t(`verdict.${verdict}`)} /> : null}
          </View>
        );
      })}
      {pending !== null ? (
        <>
          <View style={{ alignItems: 'flex-end' }}>
            <Bubble mine faded text={pending} speaker={t('thread.you')} />
          </View>
          <View
            accessibilityLiveRegion="polite"
            style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}
          >
            <BuddyOrb size={26} />
            <ActivityIndicator size="small" color={LB.ink3} />
            <Text style={[TYPE.small, { color: LB.ink2, flexShrink: 1 }]}>
              {t('thread.thinking')}
            </Text>
          </View>
        </>
      ) : null}
    </View>
  );
}

function VerdictTag({ verdict, label }: { verdict: VerdictKey; label: string }) {
  return (
    <View
      accessibilityRole="text"
      accessibilityLabel={label}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        backgroundColor: VERDICT_BG[verdict],
        borderRadius: 999,
        paddingLeft: verdict === 'correct' ? 10 : 14,
        paddingRight: 14,
        paddingVertical: 5,
      }}
    >
      {verdict === 'correct' ? (
        <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <Icon name="check" size={15} color={VERDICT_TEXT[verdict]} />
        </View>
      ) : null}
      <Text
        style={{
          color: VERDICT_TEXT[verdict],
          fontSize: 14,
          lineHeight: 19,
          fontWeight: '600',
          letterSpacing: 0.1,
        }}
      >
        {label}
      </Text>
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
  if (mine) return <View style={{ maxWidth: '86%' }}>{bubble}</View>;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8, maxWidth: '92%' }}>
      <BuddyOrb size={26} />
      {bubble}
    </View>
  );
}
