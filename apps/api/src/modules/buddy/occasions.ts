// What a domain adds to Buddy's proactivity (issue #107, docs/architecture.md §Proactivity):
//
//   occasions — wake-ups that code decides alone, without the model (in LearnBuddy: the offers
//               to review, review.ts). The background check hands each its due wake-ups, in
//               registration order, right after the agreed reminders (check.ts);
//   practice  — the questions a practice step is filled with when no model plans it: the
//               fallback before a test and an agreed practice reminder (checkFallback.ts,
//               checkReminder.ts). Without one, such a step stays a plain reminder.
//
// The domain registers both at start-up (modules/learning/register.ts); the core never names it.

import type { Deps } from '../../deps.js';
import type { Db } from '../../lib/db.js';
import type { LearnerRow } from '../identity/model.js';
import type { JobRow } from '../scheduler/jobs.js';

type Occasion = {
  /** The `reason` of the buddy_check wake-ups it handles. */
  reasons: ReadonlySet<string>;
  run: (deps: Deps, learner: LearnerRow, jobs: readonly JobRow[]) => Promise<void>;
};

/** About ten minutes of her own questions for a step, and how long they take. */
type PracticeFiller = (
  db: Db,
  learnerId: string,
  scope: { goalId: string | null; subjectId: string | null },
  focusTopics: string[],
  now: Date,
) => Promise<{ itemIds: string[]; minutes: number }>;

const registered: Occasion[] = [];
let filler: PracticeFiller | null = null;

/** A reason has exactly one occasion: a second one throws. */
export function registerOccasions(...more: Occasion[]): void {
  for (const o of more) {
    const taken = [...o.reasons].filter((r) => registered.some((x) => x.reasons.has(r)));
    if (taken.length > 0) throw new Error(`occasion registered twice: ${taken.join(', ')}`);
    registered.push(o);
  }
}

/** The occasions in registration order. */
export function occasions(): readonly Occasion[] {
  return registered;
}

export function registerPracticeFiller(fill: PracticeFiller): void {
  if (filler) throw new Error('practice filler registered twice');
  filler = fill;
}

/** Whether a domain fills practice steps (the start-up test asks). */
export function fillsPractice(): boolean {
  return filler !== null;
}

/** Questions for a practice step without a model; none when no domain fills practice. */
export function fillPractice(
  ...args: Parameters<PracticeFiller>
): Promise<{ itemIds: string[]; minutes: number }> {
  return filler ? filler(...args) : Promise.resolve({ itemIds: [], minutes: 0 });
}
