// The short conversation about one question: the learner's answers on the
// right, Buddy's replies on the left (the same bubbles as the Buddy thread).
// Only the latest answer carries its judgement, always in words and never as
// "falsch"; a turn that was not an attempt (a question, "no idea") gets none.

import type { PracticeTurnView } from '@learnbuddy/shared-types/contracts';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Text, View } from 'react-native';

import { LB } from '../../lib/theme/colors.js';
import { TYPE } from '../../lib/theme/type.js';
import { MathText } from '../math/MathText.js';
import { useSpokenMath } from '../math/useSpokenMath.js';

type VerdictKey = 'correct' | 'partially_correct' | 'incorrect' | 'unchecked';

// Soft pastel backgrounds with dark text (readable at 16 px); the word carries the meaning.
const VERDICT_BG: Record<VerdictKey, string> = {
  correct: LB.mint,
  partially_correct: LB.butter,
  incorrect: LB.bg,
  unchecked: LB.bg,
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
    <View style={{ gap: 10 }}>
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
            <ActivityIndicator size="small" color={LB.ink3} />
            <Text style={[TYPE.body, { color: LB.ink2 }]}>{t('thread.thinking')}</Text>
          </View>
        </>
      ) : null}
    </View>
  );
}

function VerdictTag({ verdict, label }: { verdict: VerdictKey; label: string }) {
  const neutral = verdict === 'incorrect' || verdict === 'unchecked';
  return (
    <View
      accessibilityRole="text"
      accessibilityLabel={label}
      style={{
        backgroundColor: VERDICT_BG[verdict],
        borderColor: LB.hairline,
        borderWidth: neutral ? 1 : 0,
        borderRadius: 999,
        paddingHorizontal: 12,
        paddingVertical: 3,
      }}
    >
      <Text style={[TYPE.body, { fontWeight: '600', color: neutral ? LB.ink2 : LB.ink }]}>
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
  return (
    <View
      accessible
      accessibilityLabel={`${speaker}: ${spoken}`}
      style={{
        maxWidth: '86%',
        backgroundColor: mine ? LB.ink : LB.paper,
        borderColor: LB.hairline,
        borderWidth: mine ? 0 : 1,
        borderRadius: 18,
        borderBottomRightRadius: mine ? 6 : 18,
        borderBottomLeftRadius: mine ? 18 : 6,
        paddingHorizontal: 14,
        paddingVertical: 10,
        opacity: faded ? 0.7 : 1,
      }}
    >
      <MathText
        text={text}
        accessible={false}
        style={[TYPE.body, { color: mine ? LB.paper : LB.ink }]}
      />
    </View>
  );
}
