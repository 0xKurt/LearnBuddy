// The parts of a session's question view that are computed rather than read (`sessionView` in
// `sessionView.ts`): the signed concept image, the learning surface, a structured task's parts.
// Their own file so `service.ts` stays within its size (docs/engineering-guards.md, rule 4).

import { isStructuredKind, SubjectKind, type ItemView } from '@learnbuddy/shared-types/contracts';

import type { StorageGateway } from '../../storage/gateway.js';
import { surfaceOf, taskOf } from './bars.js';
import { storedFigure } from './items.js';
import { staffSurfaceOf, staffTaskOf, tonesOf } from './staff.js';
import { structuredTaskOf, viewOf } from './structured.js';
import type { ItemRow } from './service.js';
import { tapItemProblem } from './tapCheck.js';

/** How long a signed concept-image URL lives; every session fetch signs afresh (issue #50). */
const IMAGE_URL_TTL_SECONDS = 1800;

export type ItemImageRow = {
  image_path: string | null;
  image_width: number | null;
  image_height: number | null;
  image_label: string | null;
};

/**
 * Signed URLs for the concept images of a view, one sign per distinct crop. A Storage
 * outage never breaks loading the session: the image is simply left out (null).
 */
export async function signImageUrls(
  storage: StorageGateway,
  rows: ItemImageRow[],
): Promise<Map<string, string>> {
  const urls = new Map<string, string>();
  for (const path of new Set(rows.map((r) => r.image_path).filter((p): p is string => !!p))) {
    try {
      urls.set(path, await storage.createDownloadUrl(path, IMAGE_URL_TTL_SECONDS));
    } catch {
      // Left out; the next fetch tries again.
    }
  }
  return urls;
}

/**
 * The learning surface of a question computed from a reviewed task, or null (issue #162).
 * A column that no longer parses as a task yields no surface: the question is still
 * answerable by typing, and nothing is guessed at.
 */
export function surfaceFor(bar: unknown, staff: unknown): ItemView['surface'] {
  const barTask = taskOf(bar);
  if (barTask) return surfaceOf(barTask);
  // The empty staff she writes a note line on (issue #226). The two can never both be there
  // (migration 0078 `items_one_computed_source`), so the order here settles nothing.
  const staffTask = staffTaskOf(staff);
  return staffTask ? staffSurfaceOf(staffTask) : null;
}

/** The tones she hears (issue #445), or null; an unreadable column plays nothing. */
export function tonesFor(staff: unknown): ItemView['tones'] {
  const task = staffTaskOf(staff);
  return task ? tonesOf(task) : null;
}

/**
 * What a structured question shows (issues #228–#230): its task without the key, or null for
 * every other question — and for a stored task that no longer reads (nothing is guessed at: the
 * question can still be revealed or taken out, "Frage passt nicht").
 */
export function taskViewFor(row: Pick<ItemRow, 'kind' | 'task'>): ItemView['task_view'] {
  if (!isStructuredKind(row.kind)) return null;
  const task = structuredTaskOf(row.task, row.kind);
  return task ? viewOf(task) : null;
}

/**
 * She answers by tapping a place in the figure (issue #248): read back through the check it was
 * written under, or the question is typed like any other.
 */
export function tapsFigure(row: Pick<ItemRow, 'kind' | 'answer' | 'figure' | 'tap'>): boolean {
  return row.tap === true && tapItemProblem({ ...row, figure: storedFigure(row.figure) }) === null;
}

/**
 * Whether she gives her answer ON THE SCREEN — an option, a board, the fraction bar or the staff, a
 * place in the figure — instead of writing it into the bar (issue #388, report §9 "the bar per
 * form"). The same parts the view sends (`sessionView`), so what a line tells her to do matches the
 * form in front of her. Tapped words (`tap_choices`) are not counted: they are offered only in
 * practice, beside a field she can still type in.
 */
export function answersOnScreen(
  row: Pick<
    ItemRow,
    'kind' | 'answer' | 'choices' | 'task' | 'bar_task' | 'staff_task' | 'figure' | 'tap'
  >,
): boolean {
  return (
    (row.kind === 'multiple_choice' && row.choices !== null) ||
    taskViewFor(row) !== null ||
    surfaceFor(row.bar_task, row.staff_task) !== null ||
    tapsFigure(row)
  );
}

/** A Belegstelle's board (#368): she answers in the reading text itself, so it shows the text. */
export function textIsBoard(view: ItemView['task_view']): boolean {
  return view?.type === 'mark' && view.mode === 'lines';
}

/** `subjects.kind` as the contract names it; a value the contract does not know is no kind. */
export function subjectKindOf(kind: string | null): SubjectKind | null {
  const parsed = SubjectKind.safeParse(kind);
  return parsed.success ? parsed.data : null;
}

/** The crop that goes with the question, or null (contract: ItemImage). */
export function imageOf(row: ItemImageRow, urls: Map<string, string>): ItemView['image'] {
  const url = row.image_path ? urls.get(row.image_path) : undefined;
  if (!url || !row.image_width || !row.image_height) return null;
  return { url, width: row.image_width, height: row.image_height, label: row.image_label ?? '' };
}
