// Which item kinds an item FIELD means anything for — the one place these rules stand, because two
// things read them and must never disagree (issue #281, D2):
//
//   - `usableItems` / `usableRubric` throw the field away on every other kind (Rule 0: the value
//     cannot be checked or used there, so it is not kept);
//   - the generator's profiles (`setProfiles.ts`, `setSchemaForModel`) and the listening question
//     (`listen.ts`) leave the field out of the schema the model is shown when none of their kinds
//     keeps it (`unusedItemFields`) — a field code would discard is only tokens and decoder states.
//
// No imports on purpose: `items.ts`, `rubric.ts` and `setProfiles.ts` all read it.

/** A free-text answer's required elements (issue #211): only a long answer has any. */
export const RUBRIC_KINDS = ['long'] as const;

/**
 * A free text: no single right answer, so no solution is claimed or shown, a miss measures nothing
 * (issue #197), and it is no question for a practice test. A long answer, and a long text with
 * feedback per key point (`essay`, issue #258), whose key points code builds (`essay.ts`).
 */
export const FREE_TEXT_KINDS = ['long', 'essay'] as const;

/** The ± a rounded or measured number may be off (only a number has one). */
export const TOLERANCE_KINDS = ['numeric'] as const;

/** Strict or gentle spelling: only where a typed word is compared as text. */
export const SPELLING_KINDS = ['short', 'long', 'vocab'] as const;

/** A picture per option (#231): only a multiple choice has options to draw. */
export const CHOICE_FIGURE_KINDS = ['multiple_choice'] as const;

/**
 * A drawing beside the question, and what is read off it (`read`, a chart's reading): never on a
 * word to translate or a sentence to say aloud (#375) — a word or a pronunciation needs no drawing.
 */
export const FIGURE_KINDS = ['short', 'long', 'numeric', 'multiple_choice', 'formula'] as const;

/**
 * Answered by tapping a place in the figure (issue #248, `tapCheck.ts`): a number on a number line,
 * a point, a column or a time — a number or a short text, never an option or a free text.
 */
export const TAP_KINDS = ['short', 'numeric'] as const;

/** Whether `kind` is one of `kinds` — typed for the plain strings the item kinds are. */
export function kindIn(kinds: readonly string[], kind: string): boolean {
  return kinds.includes(kind);
}

/**
 * The fields none of `kinds` keeps, as a zod `omit` mask: what a schema whose items can only be
 * these kinds leaves out (a run's profile, `setProfiles.ts`; a listening question, `listen.ts`).
 */
export function unusedItemFields(kinds: readonly string[]): {
  rubric?: true;
  tolerance?: true;
  spelling?: true;
  choice_figures?: true;
  figure?: true;
  read?: true;
  tap?: true;
} {
  const none = (some: readonly string[]) => !kinds.some((k) => kindIn(some, k));
  return {
    ...(none(RUBRIC_KINDS) ? { rubric: true } : {}),
    ...(none(TOLERANCE_KINDS) ? { tolerance: true } : {}),
    ...(none(SPELLING_KINDS) ? { spelling: true } : {}),
    ...(none(CHOICE_FIGURE_KINDS) ? { choice_figures: true } : {}),
    ...(none(FIGURE_KINDS) ? { figure: true, read: true } : {}),
    ...(none(TAP_KINDS) ? { tap: true } : {}),
  };
}
