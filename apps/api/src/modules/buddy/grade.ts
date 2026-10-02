// Which school year a learner is probably in, from her age (issue #208, point 1).
//
// Buddy used to ask "In welcher Klasse bist du?" as an OPEN question, in the same turn as a
// start button — so the question stayed in the thread unanswered while she started practising.
// Her age is known from the birth date she gave at registration, so the question can be a
// single tap on a suggestion instead.
//
// This is a SUGGESTION and nothing else. It is never stored, never used to pitch a task, and
// never stated as fact: the server offers it, she confirms it, and only her tap writes
// `learners.grade` (CLAUDE.md rule 5). Three reasons it cannot be more than that:
//
//   - the cut-off date differs by Bundesland (and `curriculum_region` carries no cut-off
//     table — building one would be a claim with sixteen sources behind it);
//   - a child may have started a year early or late, or repeated a year;
//   - it says nothing at all outside a German-style school year.
//
// So: one tap to confirm, and if she says something else, what she says wins.

/** The German school year starts in August; before that, the running year began last August. */
const SCHOOL_YEAR_STARTS_IN = 8;

/**
 * The common cut-off: a child who turns six by the end of June usually starts in August of the
 * same year. Several states use 30 September instead, and some let parents decide — hence
 * "likely", and hence a question rather than a value.
 */
const CUTOFF_MONTH = 6;

/**
 * The school year she is probably in, counted like the German Klasse (1 = first year), or null
 * when the number falls outside what a school year can be. `today` and `birthDate` are plain
 * local dates (YYYY-MM-DD) — the caller resolves the learner's zone (CLAUDE.md rule 7).
 */
export function likelyGrade(birthDate: string, today: string): number | null {
  const [by, bm] = birthDate.split('-').map(Number) as [number, number, number];
  const [ty, tm] = today.split('-').map(Number) as [number, number, number];
  if (!Number.isFinite(by) || !Number.isFinite(bm) || !Number.isFinite(ty)) return null;

  // The year the running school year began.
  const startedIn = tm >= SCHOOL_YEAR_STARTS_IN ? ty : ty - 1;
  // Age at that start, counting only whether the birthday had already passed by the cut-off.
  const ageAtStart = startedIn - by - (bm > CUTOFF_MONTH ? 1 : 0);
  const grade = ageAtStart - 5;
  return grade >= 1 && grade <= 13 ? grade : null;
}
