// The two readers of the curriculum table (`points.ts`): one picks what applies to a learner,
// one renders it as state for a prompt. Issue #214.
//
// Everything a state decides goes through here, so there is exactly one place to read to know
// what the Bundesland does — and exactly one place where the cautious default lives.
//
// THE DEFAULT PATH IS THE UNKNOWN ONE. `null` (every profile from before issue #199), `other`
// (a school outside Germany) and any of the ten Bundesländer whose curriculum was not read for
// a place all take the same branch: no state rule is applied, the state is not named, and the
// prompt is told to judge more cautiously instead of confidently. That is the state every
// learner is in today, so it is the path that must be right.
//
// What code enforces on top of the prompt (CLAUDE.md rule 1):
//   - `offCurriculum` drops a question from a practice TEST that her state does not teach;
//   - `cautiousAt` makes a model "wrong" a "partly right" when no rule applies
//     (`enforceTutorInvariants`).

import type { CurriculumRegion } from '@learnbuddy/shared-types/contracts';

import {
  CURRICULUM,
  CurriculumPointId,
  STATE_NAMES,
  type Ruling,
  type StateCode,
} from './points.js';

export { CURRICULUM, CurriculumPointId, STATE_NAMES };

/**
 * The one sentence every prompt that WRITES questions gets about the tag, next to the other
 * rule strings (`practice/items.ts`). Kept here with the table, so the field, the table and
 * the sentence that explains it cannot drift apart.
 */
export const CURRICULUM_RULES = `curriculum_point: only when a CURRICULUM block is given and the question is about one of the places it lists — then that place's key (the word in brackets), so the app knows which state's rule to apply when the answer is judged. Never a key the block does not list, and null for every other question.`;

/** How a state's ruling relates to this learner's year. */
type Applies =
  /** Her state teaches it, at her year. */
  | 'yes'
  /** Her state teaches it, but not yet (or no longer) at her year. */
  | 'not_at_her_year'
  /** Her state's curriculum does not have it at all. */
  | 'not_in_her_curriculum';

export type AppliedRuling = {
  point: CurriculumPointId;
  state: StateCode;
  ruling: Ruling;
  applies: Applies;
};

/**
 * The place a stored question is at, read from the column (migration 0074). Forgiving on
 * purpose: the column carries no CHECK, so a key the table no longer knows reads as "no
 * place" — the cautious default, never a wrong rule.
 */
export function pointOf(value: string | null): CurriculumPointId | null {
  if (value === null) return null;
  const parsed = CurriculumPointId.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/** Is this a Bundesland we can look up at all? `other` and `null` are not. */
function stateOf(region: CurriculumRegion | null): StateCode | null {
  return region === null || region === 'other' ? null : region;
}

function inRange(grade: number | null, range: readonly [number, number]): boolean {
  return grade === null ? true : grade >= range[0] && grade <= range[1];
}

/**
 * The places that can come up for a learner in this school year, in table order. Without a
 * year nothing is returned: telling a year-6 learner's prompt about Abitur places would be a
 * guess, and the years are what the curricula are written in.
 */
export function pointsAt(grade: number | null): CurriculumPointId[] {
  if (grade === null) return [];
  return CurriculumPointId.options.filter((p) => inRange(grade, CURRICULUM[p].grades));
}

/**
 * What her state says at one place — or `null` when no state rule may be applied: she is not
 * at a German school, the Bundesland was never set, or nobody has read that state's curriculum
 * for this place. All three are the same answer on purpose (issue #214): an unresearched state
 * is not "no difference", and inventing one would be exactly the confident error this table
 * exists to prevent.
 */
export function rulingAt(
  point: CurriculumPointId,
  region: CurriculumRegion | null,
  grade: number | null,
): AppliedRuling | null {
  const state = stateOf(region);
  if (!state) return null;
  const ruling = CURRICULUM[point].states[state];
  if (!ruling) return null;
  const applies: Applies = !ruling.taught
    ? 'not_in_her_curriculum'
    : inRange(grade, ruling.grades ?? CURRICULUM[point].grades)
      ? 'yes'
      : 'not_at_her_year';
  return { point, state, ruling, applies };
}

/**
 * No state rule applies at this place: the judgement must stay cautious rather than be
 * confidently wrong. The same answer for `null`, `other` and an unresearched state.
 */
export function cautiousAt(
  point: CurriculumPointId,
  region: CurriculumRegion | null,
  grade: number | null,
): boolean {
  return rulingAt(point, region, grade) === null;
}

/**
 * Is this question outside her curriculum — a place her state does not teach, or not at her
 * year? Code, not a hint: a practice TEST is meant to look like the test her class writes, and
 * a question on material her state never taught cannot be on it. Only ever true when a ruling
 * was actually read: ignorance never drops a question (that is the asymmetry issue #214 asks
 * for — silent is better than confidently wrong, and dropping on a guess would be the latter).
 */
export function offCurriculum(
  point: CurriculumPointId | null,
  region: CurriculumRegion | null,
  grade: number | null,
): boolean {
  if (!point) return false;
  const applied = rulingAt(point, region, grade);
  return applied !== null && applied.applies !== 'yes';
}

/** The place as the prompt names it: a teacher's word, the key to tag with, the subject. */
function head(point: CurriculumPointId): string {
  const p = CURRICULUM[point];
  return `${p.name} [${point}] · ${p.subject} · ${p.about}.`;
}

/** Said once in the header of the block where it holds for everything, never per line. */
const NO_RULE_AT_ALL =
  "CURRICULUM: her Bundesland is not known, so NO state's rule applies at any of the places below — and at these places the expected answer differs from one state to the next. Stay with what holds everywhere, write keys that accept any wording a German curriculum uses, never call an answer wrong for its wording, and never guess a state.";
/** For the one place in an otherwise known state that nobody has researched. */
const NO_RULE_HERE = 'No curriculum was read for her state here: apply no state rule.';

const APPLIES_TEXT: { [A in Applies]: (r: Ruling, name: string) => string } = {
  yes: (r) => r.expects,
  not_at_her_year: (r, name) =>
    `NOT AT HER YEAR YET in ${name}: ${r.expects} Do not ask for it unless her own material has it, and never treat not knowing it as a gap.`,
  not_in_her_curriculum: (r, name) =>
    `NOT IN HER CURRICULUM in ${name}: ${r.expects} Do not ask for it unless her own material has it.`,
};

function pointLine(
  point: CurriculumPointId,
  region: CurriculumRegion | null,
  grade: number | null,
  /** Whether her state was read for any place at all; only then is a per-place note needed. */
  stateIsKnown: boolean,
): string {
  const applied = rulingAt(point, region, grade);
  const shared = CURRICULUM[point].shared;
  const what = applied
    ? ` ${APPLIES_TEXT[applied.applies](applied.ruling, STATE_NAMES[applied.state])}`
    : stateIsKnown
      ? ` ${NO_RULE_HERE}`
      : '';
  return `- ${head(point)}${what}${shared ? ` Whatever the state: ${shared}` : ''}`;
}

/**
 * The curriculum as state for a prompt that WRITES questions (generation from a topic,
 * reading a photographed sheet). Null when there is nothing to say: no school year known, or
 * no place can come up at her year.
 *
 * The state is named only when at least one of her places was actually read for it. A learner
 * in a state nobody researched reads exactly what a learner with no state reads — naming the
 * Bundesland and then giving no rule would be an invitation to invent one.
 */
export function curriculumBlock(input: {
  region: CurriculumRegion | null;
  grade: number | null;
}): string | null {
  const points = pointsAt(input.grade);
  if (points.length === 0) return null;
  const state = stateOf(input.region);
  const read = points.some((p) => rulingAt(p, input.region, input.grade) !== null);
  const stateIsKnown = state !== null && read;
  const header = stateIsKnown
    ? `CURRICULUM (Bundesland: ${STATE_NAMES[state]}). The curriculum is a matter for the states, and at the places below her state decides what counts as a complete answer. Follow exactly what stands there; never add, widen or guess a rule for a state.`
    : NO_RULE_AT_ALL;
  const tag =
    'Tag every question that is about one of these places with curriculum_point (the key in brackets), and leave it null for every other question.';
  return [
    `${header} ${tag}`,
    ...points.map((p) => pointLine(p, input.region, input.grade, stateIsKnown)),
  ].join('\n');
}

/**
 * The curriculum as state for the prompt that JUDGES one answer. The question carries the
 * place the model tagged it with when it was written, so this is one line, not the list.
 *
 * Null when the question is at none of the twelve places — which is almost every question, and
 * then nothing is added to the prompt at all.
 */
export function curriculumLine(input: {
  point: CurriculumPointId | null;
  region: CurriculumRegion | null;
  grade: number | null;
}): string | null {
  const { point } = input;
  if (!point) return null;
  const p = CURRICULUM[point];
  const applied = rulingAt(point, input.region, input.grade);
  if (!applied) {
    return `CURRICULUM (${p.subject} · ${p.name}): her Bundesland is not known, so no state's rule applies here — and at this place the expected answer differs from state to state (${p.about}). Accept a right answer in any wording a German curriculum uses, say what is missing instead of calling it wrong, and never guess a state. If you are not certain her answer is wrong, it is partially_correct, not incorrect.${p.shared ? ` Whatever the state: ${p.shared}` : ''}`;
  }
  const name = STATE_NAMES[applied.state];
  const what = APPLIES_TEXT[applied.applies](applied.ruling, name);
  return `CURRICULUM (Bundesland: ${name} · ${p.subject} · ${p.name}): ${what} This is her own state's curriculum and it decides what counts as a complete answer here. Never add a rule beyond this line.${p.shared ? ` Whatever the state: ${p.shared}` : ''}`;
}
