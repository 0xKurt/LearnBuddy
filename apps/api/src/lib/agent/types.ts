// Agent v2 types — one-screen conversational tutor.
//
// The model receives the live thread + current item + minimal session
// state and emits ONE structured JSON object per turn. The shape is
// stable so the server-side bookkeeping (verdicts, advance, hint count)
// is a function of the model's classification, not regex on free text.

import type { Locale } from '@learnbuddy/shared-types';

export type AgentVerdict = 'correct' | 'partially_correct' | 'incorrect' | 'skipped';

export type AgentIntent =
  | 'evaluate'
  | 'hint'
  | 'reveal'
  | 'praise_and_advance'
  | 'introduce_next'
  | 'give_up_scaffold'
  | 'explain'
  | 'redirect'
  | 'break_suggest';

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
  /** Session bookkeeping for tone (fatigue-aware nudges). */
  session: {
    itemsTotal: number;
    itemsRemaining: number;
    minutesElapsed: number;
    testMode: boolean;
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
