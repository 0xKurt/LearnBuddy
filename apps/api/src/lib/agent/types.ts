// Agent v2 types — one-screen conversational tutor.
//
// The model receives the live thread + current item + minimal session
// state and emits ONE structured JSON object per turn. The shape is
// stable so the server-side bookkeeping (verdicts, advance, hint count)
// is a function of the model's classification, not regex on free text.

import type { Locale } from '@learnbuddy/shared-types';

export type AgentVerdict = 'correct' | 'partially_correct' | 'incorrect' | 'skipped';

/** Tutor moves the model can take. v2 set + four v3 additions:
 *   - affective_repair: the kid said "nervt"/"kann das nicht"/etc.
 *     Name-normalise-smaller-step; resets hint counter for this item.
 *   - stay_for_depth: correct answer + "warum?" or hot streak →
 *     advance=false, dig deeper on the same item.
 *   - metacognitive_close: occasional "Was hat dir geholfen?" probe
 *     after a correct answer (1 in 4 ish; anchors strategy).
 *   - no_opt_out: "weiß nicht" + competence suggests they can do it.
 *     Demand a bauchgefühl/guess before scaffolding.
 *  See docs/tutor-research/06-new-prompt-draft.md. */
export type AgentIntent =
  | 'evaluate'
  | 'hint'
  | 'reveal'
  | 'praise_and_advance'
  | 'introduce_next'
  | 'give_up_scaffold'
  | 'explain'
  | 'redirect'
  | 'break_suggest'
  | 'affective_repair'
  | 'stay_for_depth'
  | 'metacognitive_close'
  | 'no_opt_out';

export type SubjectKind =
  | 'math'
  | 'physics'
  | 'chemistry'
  | 'biology'
  | 'geography'
  | 'history'
  | 'language_native'
  | 'language_foreign'
  | 'religion_ethics'
  | 'art_music'
  | 'general'
  | 'other';

export type AgentItemContext = {
  itemId: string;
  question: string;
  expectedAnswer: string;
  acceptableAnswers: string[];
  answerKind:
    | 'short'
    | 'long'
    | 'numeric'
    | 'multiple_choice'
    | 'formula'
    | 'fill_blank'
    | 'diagram_label';
  topic: string | null;
  difficulty: number;
  /** Drives subject-specific tutoring strategies in the v3 prompt
   *  (cognate bridges for vocab, faded worked examples for math, etc).
   *  Default 'general' when the lookup can't resolve. */
  subjectKind?: SubjectKind;
  mcOptions?: string[] | null;
  mcCorrectIndex?: number | null;
  units?: string | null;
  sourceExcerpt?: string | null;
};

export type AgentThreadMessage = {
  role: 'learner' | 'tutor';
  content: string;
};

export type AgentTurnInput = {
  /** Profile for tone scaling. */
  learner: {
    displayName: string | null;
    gradeLevel: number;
    locale: Locale;
  };
  /** The item the learner is currently working on. The agent will either
   *  evaluate against this OR introduce a transition to the next one
   *  (in which case the server pops the queue and the next call carries
   *  the new item). */
  currentItem: AgentItemContext;
  /** Optional clamped worksheet text — keeps hints grounded. */
  materialContext: string | null;
  /** Hints already given on THIS item (0, 1, or 2). After 2, the model
   *  must reveal on the next wrong answer. */
  hintsGivenForItem: number;
  /** Prior wrong/skipped attempts on this item — used by the model to
   *  decide whether to reveal vs. give one more hint. */
  priorWrongAttemptsOnItem: number;
  /** Full prior thread, oldest-first. Bounded to last ~40 turns by the
   *  caller. */
  history: AgentThreadMessage[];
  /** The new learner message (already transcribed if voice). */
  learnerMessage: string;
  /** Session bookkeeping for tone (fatigue-aware nudges + competence
   *  signal). v3 prompt branches on `correctRateSoFar` /
   *  `currentStreak` to skip warmth-padding for cruising learners and
   *  soften pace for struggling ones. */
  session: {
    itemsTotal: number;
    itemsRemaining: number;
    minutesElapsed: number;
    testMode: boolean;
    /** Fraction in 0..1 of items answered correctly so far this
     *  session. NaN-safe: callers pass 0 when no items completed. */
    correctRateSoFar?: number;
    /** Number of items completed (resolved with advance=true). */
    itemsCompleted?: number;
    /** Streak counter: +N = N correct in a row, -N = N wrong/skipped
     *  in a row. 0 at start or after a mixed run. */
    currentStreak?: number;
    /** Total hints given across the whole session — drives "this kid
     *  has needed a lot of help today" tone. */
    hintsUsedTotal?: number;
  };
};

export type AgentTurnOutput = {
  reply: string;
  verdict: AgentVerdict | null;
  advance: boolean;
  reveal: boolean;
  hintGiven: boolean;
  intent: AgentIntent;
  /** Usage metadata for credit settlement. */
  usage: {
    inputTokens: number;
    outputTokens: number;
    costMicros: number;
    model: string;
    promptVersion: string;
  };
};
