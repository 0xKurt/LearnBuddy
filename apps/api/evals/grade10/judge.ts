// The judge of the grade-10 probe, without the model (issues #297, #298): a verdict schema per
// criteria list, asked twice with the criteria in swapped order, and what both readings agree on.
// A criterion the two readings disagree on is not counted either way — it goes to a human, as do a
// fixed share of the rest (#298 plan step 1: „ein Judge mit vertauschter Reihenfolge und
// Stichproben, die ein Mensch prüft"). Pure, so it is proven in `__tests__/judge.test.ts`.
// requires live verification in Claude Code session (tooling of a live eval)

import { z } from 'zod';

type Criteria = Readonly<Record<string, string>>;

/** The verdict object for `criteria`, its fields in the given order, with one sentence why. */
export function verdictSchema(criteria: Criteria, reversed: boolean) {
  const keys = Object.keys(criteria);
  const ordered = reversed ? [...keys].reverse() : keys;
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const key of ordered) shape[key] = z.boolean().describe(criteria[key] ?? key);
  shape.why = z
    .string()
    .max(300)
    .describe('One short German sentence: what is wrong, or why it holds');
  return z.object(shape);
}

/** One reading of the judge: a yes/no per criterion and its sentence. */
export type Reading = Record<string, boolean | string>;

export type Agreement = {
  /** Per criterion: what both readings say, or null where they differ. */
  agreed: Record<string, boolean | null>;
  /** The criteria the two readings differ on: for a human to decide. */
  disputed: string[];
  /** Every criterion agreed and true. */
  clean: boolean;
};

/** What two readings with swapped criteria agree on. */
export function agreement(criteria: Criteria, first: Reading, second: Reading): Agreement {
  const agreed: Record<string, boolean | null> = {};
  const disputed: string[] = [];
  for (const key of Object.keys(criteria)) {
    const a = first[key];
    const b = second[key];
    if (typeof a === 'boolean' && a === b) agreed[key] = a;
    else {
      agreed[key] = null;
      disputed.push(key);
    }
  }
  return {
    agreed,
    disputed,
    clean: disputed.length === 0 && Object.values(agreed).every((v) => v === true),
  };
}

/** The cases a human checks: every disputed one, and every `every`-th of the rest, in order. */
export function forHumans<C extends { id: string; agreement: Agreement }>(
  cases: readonly C[],
  every = 3,
): string[] {
  let n = 0;
  return cases.flatMap((c) => {
    if (c.agreement.disputed.length > 0) return [c.id];
    n += 1;
    return n % every === 0 ? [c.id] : [];
  });
}

/** Per criterion: how many cases both readings found true, and how many were disputed. */
export function tally(criteria: Criteria, results: readonly Agreement[]) {
  return Object.keys(criteria).map((key) => ({
    key,
    yes: results.filter((r) => r.agreed[key] === true).length,
    disputed: results.filter((r) => r.agreed[key] === null).length,
    of: results.length,
  }));
}
