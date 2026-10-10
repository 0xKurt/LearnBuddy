// Her working, photographed (issue #444, step 3 of #221) — what a reading does to her answer
// field, as plain values, so Node tests prove it. `components/practice/useWorkPhoto.ts` is the
// React part (camera, the check on the phone, the request); every decision it makes lives here.
//
// The copy goes INTO HER FIELD and nowhere else: she reads it against her exercise book, puts it
// right and sends it with "Prüfen" like anything she typed (read is not written, CLAUDE.md rule 5).
// A line the reading could not settle stands there as an EMPTY line, named to her, and "Prüfen"
// waits until she has written it or taken the line out — a path checked with a hole in it would be
// judged on a step she never wrote (`steps.ts` drops empty lines and would compare across it).

import type { WorkReading } from '@learnbuddy/shared-types/contracts';

import type { PhotoProblem } from '../capture/pages.js';
import { LINE_BREAK } from './pathEntry.js';

/** The copy as it goes into her field: one line each, an unread line left empty for her. */
export function fieldFrom(lines: WorkReading['lines']): string {
  return lines.map((l) => l ?? '').join(LINE_BREAK);
}

/** The lines (1-based) of a path that are still empty — the ones she has to write herself. */
export function emptyLines(value: string): number[] {
  const lines = value.split(LINE_BREAK);
  if (lines.length < 2) return [];
  return lines.flatMap((l, i) => (l.trim() === '' ? [i + 1] : []));
}

/** Where the photo flow stands for the question in front of her. */
export type WorkPhotoState =
  | { step: 'idle' }
  /** The phone's check found the photo hard to read: she retakes it or reads it anyway. */
  | { step: 'checking'; problems: readonly PhotoProblem[]; base64: string }
  | { step: 'reading' }
  /** The copy is in her field; `unread`: it had lines she has to write herself. */
  | { step: 'read'; unread: boolean }
  /** No copy: what to say (already in her language). */
  | { step: 'failed'; text: string };

/**
 * What stands above her field once the copy is in it: the lines she still has to write, or —
 * when every line stands — the ask to compare it with her book before she checks. Null when the
 * field no longer holds the copy (she emptied it).
 */
export function copyNote(
  state: WorkPhotoState,
  value: string,
): { key: 'work.read' } | { key: 'work.unread'; lines: number[] } | null {
  if (state.step !== 'read' || value.trim() === '') return null;
  const open = state.unread ? emptyLines(value) : [];
  return open.length > 0 ? { key: 'work.unread', lines: open } : { key: 'work.read' };
}

/** The words for the lines she still has to write ("Zeile 2 …", "Zeilen 2, 4 …"), practice.json. */
export function unreadText(
  t: (key: string, options: { count: number; lines: string }) => string,
  lines: readonly number[],
): string {
  return t('work.unread', { count: lines.length, lines: lines.join(', ') });
}
