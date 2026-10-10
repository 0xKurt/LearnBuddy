// The short conversation about one question: the learner's answers on the
// right in violet, Buddy's replies on the left as white bubbles with the small
// orb beside them (the same bubbles as the Buddy thread, Conversation.tsx).
// Only the latest answer carries its judgement, always in words and never as
// "falsch", on a soft pastel chip (right = mint, almost = butter, not yet =
// neutral); a turn that was not an attempt (a question, "no idea") gets none.
// What arrives while the screen is open moves a little (Buddy's reply rises in, a right
// answer is celebrated softly, a "not yet" nudges her answer; Verdict.tsx); what was
// there when the question opened just stands.
// Her question to the tutor (issue #402) stands here like any of her turns, on every form, and an
// answer Buddy offers to keep for later carries the chip "Merk ich mir für nachher" under it — the
// help chips' pattern (`HelpChips`); once tapped it says "Gemerkt".
// A long text (issue #258) stands as one line per version ("Fassung 1 · 412 Wörter") — the text
// itself is in the field — and Buddy's reply to it holds the feedback per key point
// (`EssayFeedback`) inside the same bubble.

import type { PracticeTurnView } from '@learnbuddy/shared-types/contracts';
import { useRef, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import { moonForReply, type MoonState } from '../../lib/buddy/moon.js';
import { useStackTops } from '../../lib/practice/useStackTops.js';
import { versionsOf, wordCount } from '../../lib/practice/essay.js';
import { BUBBLE, TAIL } from '../../lib/theme/bubble.js';
import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { SHADOW } from '../../lib/theme/shadow.js';
import { SPACE } from '../../lib/theme/space.js';
import { TYPE } from '../../lib/theme/type.js';
import { BuddyOrb } from '../lb/BuddyOrb.js';
import { Btn } from '../lb/Btn.js';
import { Chip } from '../lb/Chip.js';
import { Rise } from '../lb/Motion.js';
import { MathText } from '../math/MathText.js';
import { keepSpaces } from './CodeBlock.js';
import { useSpokenMath } from '../math/useSpokenMath.js';
import { EssayFeedback } from './EssayFeedback.js';
import { PronunciationNote } from './SpeakPanel.js';
import { Thinking } from './Thinking.js';
import { Nudge, VerdictTag, type VerdictKey } from './Verdict.js';

/** Buddy's orb beside his bubble; what hangs under a reply starts where the bubble does. */
const ORB = 26;
/** The step between turns. */
const GAP = SPACE.md;

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
  /**
   * `pending` is her question to the tutor (issue #402), not an answer: it stands in the thread on
   * every form, and Buddy thinks about a question.
   */
  asking?: boolean;
  /** „Merk ich mir für nachher" tapped on a reply that offers it (`later: 'offered'`, #402). */
  later?: { onKeep: (turnId: string) => void; disabled: boolean };
  /** A running test: no verdicts until the end. */
  hideVerdicts?: boolean;
  /** What Buddy is doing while `pending` is on its way (default: looking at her answer). */
  thinkingLabel?: string;
  /**
   * Whether her own answers stand in the thread (default). Her words that are no answer — a
   * question, "Tipp, bitte" — always do. Not for a structured answer while its
   * question is open (issues #228–#230): her arrangement stands on the board itself, which is the
   * state, and Buddy's reply
   * says the verdict in words ("2 von 4 Paaren stimmen schon"). Echoed, four pairs became a
   * four-line bubble that the room above the board (`STRUCTURED_REPLY_ROOM`) could only show as a
   * cut-off strip under the question card (#229, shot 39e).
   */
  echoAnswers?: boolean;
  /**
   * Where each turn starts in the thread, by turn id (y in this component's own coordinates).
   * The screen uses it to show only WHOLE turns when the conversation does not fit (issue #286):
   * a bubble half under the question card is clutter, not context.
   */
  onTurnTops?: (tops: Readonly<Record<string, number>>) => void;
  /** A long text (issue #258): her versions as one line each, not as the whole text. */
  essay?: boolean;
  /**
   * Her answers are code or a program's output (issue #262): they stand in monospace with every
   * space kept, as she typed them — the indentation of her function IS her answer.
   */
  code?: boolean;
};

export function ItemThread({
  turns,
  pending,
  asking = false,
  later,
  hideVerdicts = false,
  thinkingLabel,
  pronunciation = false,
  echoAnswers = true,
  onTurnTops,
  essay = false,
  code = false,
}: Props) {
  const { t } = useTranslation('practice');
  const versions = essay ? versionsOf(turns) : null;
  /**
   * What her bubble says: her words — or, for a version of a long text, which version it is
   * (`versionsOf`); one Buddy could not read (no verdict, an outage) is "Dein Text". Her question
   * about it (#402) and "Tipp, bitte" stay her words.
   */
  const said = (turn: Pick<PracticeTurnView, 'id' | 'text' | 'verdict'>): string => {
    if (!versions) return turn.text;
    const version = versions.get(turn.id);
    const words = wordCount(turn.text);
    if (version !== undefined) return t('essay.version', { n: version, count: words });
    return turn.verdict === null ? t('essay.text', { count: words }) : turn.text;
  };
  // What was there when the screen opened stands still; what arrives now moves.
  const initial = useRef<ReadonlySet<string> | null>(null);
  if (initial.current === null) initial.current = new Set(turns.map((turn) => turn.id));
  const known = initial.current;
  // Not echoed: neither the bubble nor its tag — the reply below says it in words.
  const shown = turns.filter(
    (turn) => turn.role !== 'learner' || echoAnswers || turn.verdict === 'not_an_attempt',
  );
  // Each turn's top, from the turns' heights (`useStackTops`, issue #403).
  const { onHeight } = useStackTops(
    GAP,
    shown.map((turn) => turn.id),
    onTurnTops && ((pieces) => onTurnTops(Object.fromEntries(pieces.map((p) => [p.key, p.top])))),
  );
  if (turns.length === 0 && pending === null) return null;

  let latestAnswerId: string | null = null;
  let latestReplyId: string | null = null;
  for (const turn of turns) {
    if (turn.role === 'learner') latestAnswerId = turn.id;
    else latestReplyId = turn.id;
  }

  return (
    <View style={{ gap: GAP }}>
      {shown.map((turn) => {
        const mine = turn.role === 'learner';
        const index = turns.indexOf(turn);
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
            text={mine ? said(turn) : turn.text}
            speaker={mine ? t('thread.you') : t('thread.buddy')}
            // Her code as she typed it; her question about it stays her words.
            code={code && mine && turn.verdict !== 'not_an_attempt'}
            orb={moonForReply({ fresh, afterCorrect })}
            // Only the newest reply's orb moves, and none while Buddy is looking again.
            alive={turn.id === latestReplyId && pending === null}
          >
            {!mine && turn.essay ? <EssayFeedback feedback={turn.essay} /> : null}
          </Bubble>
        );
        return (
          <Rise
            key={turn.id}
            testID="thread-turn"
            // Her own answer was on screen already (while it was sent): only Buddy's reply
            // rises in.
            animate={fresh && !mine}
            delay={60}
            // token-exempt: bubble and verdict 6 apart, snug as one turn
            style={{ alignItems: mine ? 'flex-end' : 'flex-start', gap: 6 }}
            onLayout={onHeight(turn.id)}
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
            {/* Under the reply's bubble, not under Buddy's orb. */}
            {turn.later === 'kept' ? (
              <View style={{ marginLeft: ORB + SPACE.sm }}>
                <Chip tone="primary" icon="check">
                  {t('ask.kept')}
                </Chip>
              </View>
            ) : turn.later === 'offered' && later ? (
              <View style={{ marginLeft: ORB + SPACE.sm }}>
                <Btn
                  variant="ghost"
                  size="sm"
                  pill
                  disabled={later.disabled}
                  onPress={() => later.onKeep(turn.id)}
                  accessibilityHint={t('ask.later_hint')}
                >
                  {t('ask.later')}
                </Btn>
              </View>
            ) : null}
          </Rise>
        );
      })}
      {pending !== null ? (
        <>
          {echoAnswers || asking ? (
            <Rise style={{ alignItems: 'flex-end' }}>
              <View style={{ maxWidth: '86%' }}>
                <Bubble
                  mine
                  faded
                  text={asking ? pending : said({ id: '', text: pending, verdict: null })}
                  speaker={t('thread.you')}
                  code={code && !asking}
                />
              </View>
            </Rise>
          ) : null}
          <Thinking
            label={
              thinkingLabel ??
              // Buddy reads her long text — or thinks about her question on it.
              t(asking ? 'thread.thinking_question' : essay ? 'essay.thinking' : 'thread.thinking')
            }
          />
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
  code = false,
  children = null,
}: {
  mine: boolean;
  code?: boolean;
  /** What it says — and, with `children`, what a screen reader hears for them. */
  text: string;
  speaker: string;
  faded?: boolean;
  orb?: MoonState;
  alive?: boolean;
  /** Shown in place of the text (a long text's feedback, issue #258). */
  children?: ReactNode;
}) {
  const { palette } = useTheme();
  const spoken = useSpokenMath(text);
  const bubble = (
    <View
      accessible
      accessibilityLabel={`${speaker}: ${spoken}`}
      style={[
        BUBBLE,
        {
          flexShrink: 1,
          backgroundColor: mine ? palette.primary : palette.paper,
          borderBottomRightRadius: mine ? TAIL : BUBBLE.borderRadius,
          borderBottomLeftRadius: mine ? BUBBLE.borderRadius : TAIL,
          opacity: faded ? 0.7 : 1,
        },
        mine ? null : SHADOW.soft,
      ]}
    >
      {children ??
        (code ? (
          <Text
            accessible={false}
            style={[TYPE.code, { color: mine ? palette.paper : palette.ink }]}
          >
            {keepSpaces(text)}
          </Text>
        ) : (
          <MathText
            text={text}
            accessible={false}
            style={[TYPE.body, { color: mine ? palette.paper : palette.ink }]}
          />
        ))}
    </View>
  );
  if (mine) return bubble;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: SPACE.sm, maxWidth: '92%' }}>
      <BuddyOrb size={ORB} state={orb} breathe={alive} />
      {bubble}
    </View>
  );
}
