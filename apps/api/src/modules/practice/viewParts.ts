// The parts of a session's question view that are computed rather than read (`sessionView` in
// `sessionView.ts`): the signed concept image, the learning surface, a structured task's parts.
// Their own file so `service.ts` stays within its size (docs/engineering-guards.md, rule 4).

import { isStructuredKind, SubjectKind, type ItemView } from '@learnbuddy/shared-types/contracts';

import type { StorageGateway } from '../../storage/gateway.js';
import { surfaceOf, taskOf } from './bars.js';
import { codeSurfaceOf, codeTaskOf } from './code.js';
import { storedQuestionFigure } from './items.js';
import { staffSurfaceOf, staffTaskOf, tonesOf } from './staff.js';
import { structuredTaskOf, viewOf } from './structured.js';
import type { ItemRow } from './service.js';
import { tapItemProblem } from './tapCheck.js';

/** How long a signed concept-image URL lives (issue #50). */
const IMAGE_URL_TTL_SECONDS = 1800;
/**
 * A signed URL is handed out again while it has at least this long left (#671): the app shows
 * the picture right away, and a session that stays open re-fetches its view long before.
 */
const IMAGE_URL_KEEP_MS = 10 * 60_000;
/** At most this many signed URLs are kept in the process (oldest first out). */
const IMAGE_URL_CACHE_MAX = 500;

/** Signed URLs this process handed out, by object path, with the instant they expire. */
const signedUrls = new Map<string, { url: string; expires: number }>();

export type ItemImageRow = {
  image_path: string | null;
  image_width: number | null;
  image_height: number | null;
  image_label: string | null;
};

/**
 * Signed URLs for the concept images of a view (#637, #671). Every answer and every poll
 * rebuilds the session view; its pictures were signed again each time, one Storage request per
 * picture. Now a URL that still has ten minutes left is handed out again, and what is missing is
 * signed in ONE Storage request. A Storage outage never breaks loading the session: a picture
 * that could not be signed is simply left out, and the next fetch tries again.
 */
export async function signImageUrls(
  storage: StorageGateway,
  rows: ItemImageRow[],
  /** The app clock (CLAUDE.md rule 7). */
  now: Date,
): Promise<Map<string, string>> {
  const at = now.getTime();
  const paths = [...new Set(rows.map((r) => r.image_path).filter((p): p is string => !!p))];
  const urls = new Map<string, string>();
  const missing: string[] = [];
  for (const path of paths) {
    const kept = signedUrls.get(path);
    if (kept && kept.expires - at > IMAGE_URL_KEEP_MS) urls.set(path, kept.url);
    else missing.push(path);
  }
  if (missing.length === 0) return urls;
  let fresh: Map<string, string>;
  try {
    fresh = await storage.createDownloadUrls(missing, IMAGE_URL_TTL_SECONDS);
  } catch {
    // Left out; the next fetch tries again.
    return urls;
  }
  const expires = at + IMAGE_URL_TTL_SECONDS * 1000;
  for (const [path, url] of fresh) {
    urls.set(path, url);
    signedUrls.delete(path);
    signedUrls.set(path, { url, expires });
  }
  while (signedUrls.size > IMAGE_URL_CACHE_MAX) {
    const oldest = signedUrls.keys().next().value;
    if (oldest === undefined) break;
    signedUrls.delete(oldest);
  }
  return urls;
}

/**
 * The learning surface of a question computed from a reviewed task, or null (issue #162).
 * A column that no longer parses as a task yields no surface: the question is still
 * answerable by typing, and nothing is guessed at.
 */
export function surfaceFor(bar: unknown, staff: unknown, code: unknown): ItemView['surface'] {
  const barTask = taskOf(bar);
  if (barTask) return surfaceOf(barTask);
  // The empty staff she writes a note line on (issue #226). The computed sources can never be
  // there together (migration 0104 `items_one_computed_source`), so the order settles nothing.
  const staffTask = staffTaskOf(staff);
  if (staffTask) return staffSurfaceOf(staffTask);
  // A program's lines to tap, or the field she types code, a query or an output into (#262).
  const codeTask = codeTaskOf(code);
  return codeTask ? codeSurfaceOf(codeTask) : null;
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
  return row.tap === true && tapItemProblem({ ...row, figure: storedQuestionFigure(row) }) === null;
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
    | 'kind'
    | 'answer'
    | 'choices'
    | 'task'
    | 'bar_task'
    | 'staff_task'
    | 'code_task'
    | 'figure'
    | 'tap'
  >,
): boolean {
  const surface = surfaceFor(row.bar_task, row.staff_task, row.code_task);
  return (
    (row.kind === 'multiple_choice' && row.choices !== null) ||
    taskViewFor(row) !== null ||
    // A code field is written into like the bar; only the program's lines are tapped (#262).
    (surface !== null && surface.mode !== 'code_type') ||
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
