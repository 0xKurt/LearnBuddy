// Pedagogical move registry — Phase B (B1).
//
// Today the tutor does ONE thing: walk the hint staircase. Wrong → broad
// hint → specific hint → reveal. That's one of ~12 documented expert-tutor
// moves. The agent-loop feeling the user pushed back on lives in that
// "one move" pattern.
//
// This module defines the moves themselves — pure data + pure predicates.
// The selector (lib/strategy/select.ts) picks one per turn from those
// whose preconditions hold. The chosen move's prompt fragment is appended
// to SYSTEM_TUTOR, shaping HOW the model approaches this turn while the
// model still produces all natural-language output.
//
// L1: a move's fragment instructs the model on WHAT MOVE to make. It
// never names the learner in first person. ("Praise the correction
// move", not "I notice you corrected yourself.")
//
// L2: this file is structural tier — edited rarely, by hand. Moves are
// stable, well-named, and chosen by deterministic predicates over the
// runtime signal. No LLM call in this layer.

import type { RuntimeSignal } from '../learner-state/runtime-signal.js';

export type MoveId =
  | 'socratic_question'
  | 'direct_hint_broad'
  | 'direct_hint_specific'
  | 'worked_example'
  | 'predict_then_check'
  | 'self_explanation_prompt'
  | 'recovery_pivot_easier'
  | 'gentle_scaffold'
  | 'gentle_reveal'
  | 'misconception_confrontation'
  | 'confidence_probe'
  | 'wrong_example_probe'
  | 'continue_natural';

/** Active recurring misconception for THIS item's topic. The selector
 *  receives at most ONE of these per turn — the most-seen tag whose
 *  topic matches the current item. Set to null when nothing matches. */
export type ActiveMisconception = {
  concept_tag: string;
  description: string;
  seen_count: number;
} | null;

/** Everything the move predicates need to make a decision. Keep this
 *  shape small and pure — no DB handles, no LLM clients. */
export type SelectorContext = {
  signal: RuntimeSignal;
  /** Hints given on THIS item so far (B2 staircase counter — includes
   *  'skipped' since the A1+A2 work). */
  hintsGivenForItem: number;
  /** Wrong / skipped tutor verdicts on THIS item so far. */
  priorWrongAttemptsOnItem: number;
  /** Trailing-skip count on THIS item (drives gentle_scaffold/reveal). */
  trailingSkipsOnItem: number;
  /** True when no prior tutor turn on this item exists (it's the first
   *  exchange). The model already knows this implicitly from history
   *  but some moves only fire on first turns. */
  isFirstTurnOnItem: boolean;
  itemDifficulty: number;
  itemAnswerKind: string;
  itemTopic: string | null;
  /** Last verdict on THIS item (for socratic_question / self_explanation). */
  lastVerdictOnItem: 'correct' | 'partially_correct' | 'incorrect' | 'skipped' | null;
  /** Most recent move ids picked in this session (oldest first). Lets
   *  the selector apply a recency penalty so the model isn't doing the
   *  same trick three turns in a row. */
  recentMoves: ReadonlyArray<MoveId>;
  /** Phase C follow-up: the highest-seen-count active misconception
   *  for this item's topic (or null when nothing matches). When
   *  non-null AND the learner just got the item wrong, the selector
   *  fires `misconception_confrontation` to address the pattern
   *  directly instead of giving a generic hint. */
  activeMisconception: ActiveMisconception;
};

export type PedagogicalMove = {
  id: MoveId;
  /** Lower = higher priority. The selector picks the lowest-priority
   *  move whose `applies()` returns true and `forbidden()` is false. */
  priority: number;
  applies: (ctx: SelectorContext) => boolean;
  forbidden: (ctx: SelectorContext) => boolean;
  /** Returns the fragment to splice into SYSTEM_TUTOR under a
   *  "— Mode for this turn —" header. `null` means "no shaping — the
   *  model uses its base rules". `continue_natural` is the only move
   *  that returns null. */
  promptFragment: (ctx: SelectorContext) => string | null;
};

function isConceptual(kind: string): boolean {
  return kind === 'short' || kind === 'long';
}

// ──────────────────────────────────────────────────────────────────────
// The moves, in declaration order. Priority is the actual ordering.
// ──────────────────────────────────────────────────────────────────────

const gentleScaffold: PedagogicalMove = {
  id: 'gentle_scaffold',
  priority: 5,
  applies: (ctx) => ctx.trailingSkipsOnItem === 1,
  forbidden: () => false,
  promptFragment: () =>
    [
      '— Mode for this turn: gentle_scaffold —',
      'The student has just said "I don\'t know" for the SECOND time on this item.',
      'Do NOT ask another open question. Do NOT give a broad nudge — that already failed twice.',
      'Pick ONE concrete entry point from the Study material — a definition, a single symbol, the simplest sub-step. Ask about THAT specifically.',
      'One sentence. Reduce cognitive load, not add to it. Do NOT reveal the full answer.',
    ].join('\n'),
};

const gentleReveal: PedagogicalMove = {
  id: 'gentle_reveal',
  priority: 5,
  applies: (ctx) => ctx.trailingSkipsOnItem === 2,
  forbidden: () => false,
  promptFragment: () =>
    [
      '— Mode for this turn: gentle_reveal —',
      'The student has given up THREE times in a row on this item. Time to lower the stakes.',
      'Reveal the answer kindly, grounded in the Study material. State it as a fact about the material, not as a judgment.',
      'Then offer two short choices: "ganz langsam durchgehen, oder magst du was anderes probieren?" (adapt to the locale).',
      'Two short sentences total. Warm. Verdict is "skipped" — do NOT say the student was wrong.',
    ].join('\n'),
};

const recoveryPivotEasier: PedagogicalMove = {
  id: 'recovery_pivot_easier',
  priority: 10,
  applies: (ctx) =>
    ctx.signal.consecutive_wrong >= 3 && ctx.signal.fatigue >= 0.5 && ctx.trailingSkipsOnItem === 0, // gentle_* handles give-up streaks
  forbidden: () => false,
  promptFragment: () =>
    [
      '— Mode for this turn: recovery_pivot_easier —',
      'The session has 3+ wrong/skipped in a row AND time-in-session is non-trivial. The student needs a confidence reset, not another hard push.',
      'Acknowledge gently. Externalize the difficulty onto the material ("die Aufgabe ist gemein wenn …"), never onto the student.',
      'Reveal a short hint or the answer — NOT a full explanation. Signal that the NEXT question will be a smaller one.',
      'Two short sentences. End with "magst du eine kleinere Aufgabe?" (or locale equivalent).',
    ].join('\n'),
};

const selfExplanationPrompt: PedagogicalMove = {
  id: 'self_explanation_prompt',
  priority: 25,
  applies: (ctx) =>
    ctx.lastVerdictOnItem === 'correct' &&
    ctx.hintsGivenForItem === 0 &&
    ctx.priorWrongAttemptsOnItem === 0 &&
    isConceptual(ctx.itemAnswerKind) &&
    ctx.signal.ceiling_signal >= 0.4,
  // Don't fire twice in a row — feels like an interrogation.
  forbidden: (ctx) => ctx.recentMoves.slice(-2).includes('self_explanation_prompt'),
  promptFragment: () =>
    [
      '— Mode for this turn: self_explanation_prompt —',
      'The student got this conceptual item right on the FIRST try with no hints. Verify it was understanding, not memorization.',
      'Briefly acknowledge correctness, then ask ONE short follow-up: "kannst du in einem Satz sagen, WARUM das so ist?" (locale-adapted).',
      'If their next reply is substantive reasoning, accept. If it just rephrases the answer, gently probe one level deeper. Do not turn this into a lecture.',
    ].join('\n'),
};

const misconceptionConfrontation: PedagogicalMove = {
  id: 'misconception_confrontation',
  priority: 20,
  applies: (ctx) =>
    ctx.activeMisconception !== null &&
    (ctx.lastVerdictOnItem === 'incorrect' || ctx.lastVerdictOnItem === 'partially_correct') &&
    ctx.trailingSkipsOnItem === 0,
  // Don't fire twice on the same item — once the model has named the
  // pattern, the next turn should let the kid try, not lecture again.
  forbidden: (ctx) => ctx.recentMoves.slice(-2).includes('misconception_confrontation'),
  promptFragment: (ctx) => {
    const m = ctx.activeMisconception!;
    return [
      '— Mode for this turn: misconception_confrontation —',
      `The learner has a RECURRING misconception on this concept: "${m.concept_tag}" — ${m.description} (seen ${m.seen_count}× across sessions).`,
      'Their current wrong answer fits this pattern. Don\'t give a generic hint — name the SHAPE of the mistake gently, using teacher-vernacular like "das ist die Stelle, an der wir schon mal waren" (locale-adapted).',
      'Describe the WORK pattern, never the learner ("you tend to ..." is banned). Externalize: "diese Art von Aufgabe ist tückisch wenn ...".',
      'Then ask ONE concrete question that distinguishes the misconception from the correct rule.',
      '2 short sentences. Warm. Do not state the final answer.',
    ].join('\n');
  },
};

// Phase D — fake-understanding catchers.
//
// confidence_probe and self_explanation_prompt look superficially the same
// (both ask "WARUM?"). The distinction is the LEARNER STATE that triggers
// them:
//   - self_explanation_prompt: high ceiling_signal — kid looks bored.
//     "Tell me more, I think you can go deeper."
//   - confidence_probe: ANY first-try-correct on conceptual, no ceiling
//     signal needed. Default-on, with variety penalty to avoid
//     interrogation. "Got it right — but did you get it right for the
//     right reason?"
// They never double-fire: self_explanation has higher priority (25 vs 27)
// and is forbidden after confidence_probe.

const confidenceProbe: PedagogicalMove = {
  id: 'confidence_probe',
  priority: 27,
  applies: (ctx) =>
    ctx.lastVerdictOnItem === 'correct' &&
    ctx.hintsGivenForItem === 0 &&
    ctx.priorWrongAttemptsOnItem === 0 &&
    isConceptual(ctx.itemAnswerKind) &&
    ctx.signal.ceiling_signal < 0.4,
  // Don't interrogate. Don't follow self_explanation either — same probe
  // shape from a different angle would feel doubled-up.
  forbidden: (ctx) => {
    const recent = ctx.recentMoves.slice(-2);
    return recent.includes('confidence_probe') || recent.includes('self_explanation_prompt');
  },
  promptFragment: () =>
    [
      '— Mode for this turn: confidence_probe —',
      'The learner just got a conceptual item right on the first try. This MIGHT be real understanding, or it might be pattern-matching on surface form. Probe to find out — gently.',
      'One short acknowledgement, then ONE question: "kannst du in einem Satz sagen, WIESO das stimmt?" (locale-adapted).',
      'Do NOT phrase this as a test. "Lass mich prüfen, ob du es wirklich verstanden hast" is BANNED — it sounds adversarial. Frame as genuine curiosity about their reasoning.',
      'Maximum 2 short sentences. Then wait.',
    ].join('\n'),
};

const wrongExampleProbe: PedagogicalMove = {
  id: 'wrong_example_probe',
  // Priority 26 — above confidence_probe (27) so a streak triggers the
  // sharper probe first. Below self_explanation_prompt (25) so the
  // ceiling-aware path still wins for bored-genius cases.
  priority: 26,
  applies: (ctx) =>
    ctx.lastVerdictOnItem === 'correct' &&
    ctx.hintsGivenForItem === 0 &&
    ctx.priorWrongAttemptsOnItem === 0 &&
    isConceptual(ctx.itemAnswerKind) &&
    // A streak signals "looks confident" — pattern-matchers either get
    // exposed or earn a real check.
    ctx.signal.consecutive_correct >= 2,
  // Rare move — ONCE per session. The fact that it appeared anywhere in
  // recentMoves blocks it. (recentMoves is session-scoped.)
  forbidden: (ctx) => ctx.recentMoves.includes('wrong_example_probe'),
  promptFragment: () =>
    [
      '— Mode for this turn: wrong_example_probe —',
      'The learner is on a correct streak on conceptual items. Pose a near-miss: "wenn jemand X gesagt hätte, wäre das richtig?" — where X is a plausible-looking wrong answer that a pattern-matcher would accept.',
      'X should differ from the correct rule in ONE conceptual dimension: a swapped operation, a dropped sign, an ignored constraint, a related-but-wrong formula.',
      'One sentence, framed as a real question (not a riddle). Wait for the reasoning. Do NOT confirm or deny in this turn.',
    ].join('\n'),
};

const socraticQuestion: PedagogicalMove = {
  id: 'socratic_question',
  priority: 30,
  applies: (ctx) =>
    ctx.lastVerdictOnItem === 'partially_correct' &&
    ctx.hintsGivenForItem === 0 &&
    isConceptual(ctx.itemAnswerKind),
  forbidden: () => false,
  promptFragment: () =>
    [
      '— Mode for this turn: socratic_question —',
      "The student's last attempt had the right intuition but was incomplete. They are close — do NOT give a direct hint that flattens their thinking.",
      'Ask one leading question that builds on what they DID say. Confirm the part that was right, then point them — by question, not by statement — at the missing piece.',
      "One sentence. Phrased as a question. Don't name the missing piece.",
    ].join('\n'),
};

const workedExample: PedagogicalMove = {
  id: 'worked_example',
  priority: 40,
  applies: (ctx) =>
    ctx.hintsGivenForItem >= 2 &&
    ctx.priorWrongAttemptsOnItem >= 2 &&
    ctx.signal.cognitive_load === 'high',
  forbidden: () => false,
  promptFragment: () =>
    [
      '— Mode for this turn: worked_example —',
      'Multiple hints already given and the student is still wrong. They need to SEE the method first, then try the original.',
      'Show a SIMILAR but easier worked example, step by step (max 3 steps). Use the same operation / pattern as the current item.',
      'End with: "jetzt versuch du es nochmal mit der Original-Frage". Do NOT solve the original item for them.',
      '3–5 short sentences. Stay in the locale.',
    ].join('\n'),
};

const directHintBroad: PedagogicalMove = {
  id: 'direct_hint_broad',
  priority: 50,
  applies: (ctx) =>
    ctx.hintsGivenForItem === 0 &&
    ctx.lastVerdictOnItem === 'incorrect' &&
    ctx.trailingSkipsOnItem === 0,
  forbidden: () => false,
  promptFragment: () =>
    [
      '— Mode for this turn: direct_hint_broad —',
      'First hint on this item, after a wrong attempt.',
      'Point at the GENERAL category or approach. NOT the specific step or operation. NOT the answer.',
      'Example shape: "Schau dir an, was zwischen X und Y passiert" — not "rechne X durch Y".',
      'One sentence. Warm.',
    ].join('\n'),
};

const directHintSpecific: PedagogicalMove = {
  id: 'direct_hint_specific',
  priority: 50,
  applies: (ctx) => ctx.hintsGivenForItem === 1 && ctx.trailingSkipsOnItem === 0,
  forbidden: () => false,
  promptFragment: () =>
    [
      '— Mode for this turn: direct_hint_specific —',
      'Second hint on this item — the broad hint did not land.',
      'Name the specific operation / symbol / rule they need. Still do NOT state the final answer.',
      'Example shape: "Hier brauchst du die Produktregel — was sind die zwei Faktoren?" (locale-adapted).',
      'One sentence.',
    ].join('\n'),
};

const predictThenCheck: PedagogicalMove = {
  id: 'predict_then_check',
  priority: 60,
  applies: (ctx) => ctx.isFirstTurnOnItem && ctx.itemDifficulty >= 4 && ctx.hintsGivenForItem === 0,
  forbidden: (ctx) => ctx.recentMoves.slice(-2).includes('predict_then_check'),
  promptFragment: () =>
    [
      '— Mode for this turn: predict_then_check —',
      'This is a hard item, first attempt. Before showing the answer or guiding to a calculation, ask the student to PREDICT one specific thing — sign, order of magnitude, which formula category, expected unit.',
      'One sentence, framed as a quick estimation question.',
    ].join('\n'),
};

/** Fallback move — always applies, lowest priority, no prompt fragment.
 *  When no other move fires, the model uses its base SYSTEM_TUTOR rules
 *  unmodified. This is the SAFETY NET that keeps Phase B additive in
 *  its initial deploy: we add moves, we don't remove the existing rules. */
const continueNatural: PedagogicalMove = {
  id: 'continue_natural',
  priority: 100,
  applies: () => true,
  forbidden: () => false,
  promptFragment: () => null,
};

export const MOVE_REGISTRY: ReadonlyArray<PedagogicalMove> = [
  // Order doesn't matter — selector uses priority. Listed in priority order
  // for human readability.
  gentleScaffold,
  gentleReveal,
  recoveryPivotEasier,
  misconceptionConfrontation,
  selfExplanationPrompt,
  confidenceProbe,
  wrongExampleProbe,
  socraticQuestion,
  workedExample,
  directHintBroad,
  directHintSpecific,
  predictThenCheck,
  continueNatural,
];
