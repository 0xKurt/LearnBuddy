// The forms and figures a run needs, read from the questions it is made from (F5-1, #657).
//
// "More of this" (`from_session_id`) and a test from her read sheets (`goal_id`) are written from
// questions that exist already: what they use is a fact in the database, not a guess. So the run
// goes out with exactly that set and no choosing call (`chooseForms`' `known`) — a second model
// call that sent the whole system prompt to name what code can read off the rows (rule 1). Only
// when every source question can be read this way: one whose form this file does not know lets
// the choice be made as before, never quietly fewer forms.
// docs/architecture.md §Schema budget.

import { isStructuredKind } from '@learnbuddy/shared-types/contracts';

import type { Db } from '../../lib/db.js';

/** What a run may use: task forms beyond plain questions, and figure types. */
export type KnownForms = { forms: string[]; figures: string[] };

/** A stored question, as far as its form and figures are concerned. */
export type SourceRow = {
  kind: string;
  figure: unknown;
  choice_figures: unknown;
  bar_task: unknown;
  staff_task: unknown;
  code_task: unknown;
  task_part: unknown;
  parts_task: unknown;
  read_passage: unknown;
};

/** Kinds that are plain questions: no choice of a form needed for them. */
const PLAIN = new Set([
  'short',
  'long',
  'numeric',
  'multiple_choice',
  'formula',
  'vocab',
  'speak',
  'spelling_dictation',
  'essay',
]);

/** The separate task lists of an answer, and the column a stored question of each carries. */
const BLOCK_OF: ReadonlyArray<[keyof SourceRow, string]> = [
  ['bar_task', 'bars'],
  ['staff_task', 'staffs'],
  ['code_task', 'codes'],
  ['task_part', 'part_tasks'],
  ['parts_task', 'part_tasks'],
  ['read_passage', 'reading'],
];

const typeOf = (f: unknown): string | null =>
  typeof f === 'object' && f !== null && typeof (f as { type?: unknown }).type === 'string'
    ? (f as { type: string }).type
    : null;

/**
 * The forms and figure types these questions use, or null when one of them is of a form this
 * file cannot name (then the choice is made by the model, as before). No rows: null too — there
 * is nothing to read a choice from.
 */
export function formsOfItems(rows: readonly SourceRow[]): KnownForms | null {
  if (rows.length === 0) return null;
  const forms = new Set<string>();
  const figures = new Set<string>();
  for (const r of rows) {
    if (isStructuredKind(r.kind)) forms.add(r.kind);
    else if (!PLAIN.has(r.kind)) return null;
    for (const [column, block] of BLOCK_OF) if (r[column] !== null) forms.add(block);
    const own = typeOf(r.figure);
    if (own) figures.add(own);
    if (Array.isArray(r.choice_figures))
      for (const f of r.choice_figures) {
        const t = typeOf(f);
        if (t) figures.add(t);
      }
  }
  return { forms: [...forms], figures: [...figures] };
}

const COLUMNS = `i.kind, i.figure, i.choice_figures, i.bar_task, i.staff_task, i.code_task,
                 i.task_part, i.parts_task, i.read_passage`;

/** The questions of the run she wants more of. */
export async function formsOfSession(
  db: Db,
  learnerId: string,
  sessionId: string,
): Promise<KnownForms | null> {
  const rows = await db.query<SourceRow>(
    `select ${COLUMNS} from session_items si join items i on i.id = si.item_id
      where si.session_id = $1 and i.learner_id = $2`,
    [sessionId, learnerId],
  );
  return formsOfItems(rows);
}

/** The questions read from the sheets of the test a run is for (the same sheets `sheetsOf` reads). */
export async function formsOfSheets(
  db: Db,
  learnerId: string,
  goalId: string,
): Promise<KnownForms | null> {
  const rows = await db.query<SourceRow>(
    `select ${COLUMNS} from materials m
       join items i on i.material_id = m.id and i.learner_id = m.learner_id
      where m.learner_id = $1 and m.goal_id = $2 and m.status = 'ready'
        and m.archived_at is null and m.purpose = 'study' and i.archived_at is null`,
    [learnerId, goalId],
  );
  return formsOfItems(rows);
}
