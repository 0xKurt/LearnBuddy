// Which item kinds an item FIELD means anything for — the one place these rules stand, because two
// things read them and must never disagree (issue #281, D2):
//
//   - `usableItems` / `usableRubric` throw the field away on every other kind (Rule 0: the value
//     cannot be checked or used there, so it is not kept);
//   - the generator's profiles (`generate.ts`, `setSchemaForModel`) leave the field out of the
//     schema the model is shown when the run allows none of these kinds — a field that code would
//     discard anyway is only tokens and decoder states.
//
// No imports on purpose: `items.ts`, `rubric.ts` and `generate.ts` all read it.

/** A free-text answer's required elements (issue #211): only a long answer has any. */
export const RUBRIC_KINDS = ['long'] as const;

/** The ± a rounded or measured number may be off (only a number has one). */
export const TOLERANCE_KINDS = ['numeric'] as const;

/** Strict or gentle spelling: only where a typed word is compared as text. */
export const SPELLING_KINDS = ['short', 'long', 'vocab'] as const;

/** A picture per option (#231): only a multiple choice has options to draw. */
export const CHOICE_FIGURE_KINDS = ['multiple_choice'] as const;

/** Whether `kind` is one of `kinds` — typed for the plain strings the item kinds are. */
export function kindIn(kinds: readonly string[], kind: string): boolean {
  return kinds.includes(kind);
}
