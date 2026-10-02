// A written calculation path in the answer field (issue #221).
//
// The API checks a path line by line (apps/api/src/modules/practice/steps.ts, issue #209): it
// splits the answer at "\n" (a "\r\n" works too) and reports the first step that no longer
// follows. The field therefore only has to keep her line breaks as she typed them — this file
// decides what the return key does and which line the preview draws.
//
// The quick path stays quick: a one-line answer goes out with the return key, as before. The
// first line break — from the "neue Zeile" key, a pasted path, or Shift+Enter in the browser —
// turns the field into a path, and from then on the return key starts the next line and
// "Prüfen" checks the whole text. Deleting the break makes it a one-liner again.
// Pure logic without React Native imports, so it runs in the unit tests.

import type { ItemKind } from '@learnbuddy/shared-types/contracts';

/** The one separator the field writes and steps.ts splits at. */
export const LINE_BREAK = '\n';

/** True once the answer holds more than one line: a path, not a single answer. */
export function isPath(value: string): boolean {
  return value.includes(LINE_BREAK);
}

/** How many lines the field shows (an empty field is one line). */
export function lineCount(value: string): number {
  return value.split(LINE_BREAK).length;
}

/**
 * Whether the return key sends the answer. A long answer is a text and always needs new lines;
 * every other kind sends a one-liner at once and starts a new line inside a path.
 */
export function returnSubmits(kind: ItemKind, value: string): boolean {
  return kind !== 'long' && !isPath(value);
}

/**
 * The line the live preview draws: the one with the cursor in it. Drawing the whole path would
 * stack a second copy of it under the field and push the question off a small phone; the lines
 * above stand in the field anyway. On a fresh, still empty line the preview keeps the nearest
 * line above, so it does not vanish and reappear with every new line. Without a known cursor it
 * is the last line she wrote.
 */
export function previewLine(value: string, caret: number | null): string {
  const lines = value.split(LINE_BREAK);
  let at = lines.length - 1;
  if (caret !== null) {
    const before = value.slice(0, Math.max(0, Math.min(caret, value.length)));
    at = before.split(LINE_BREAK).length - 1;
  }
  for (let i = at; i >= 0; i--) {
    const line = lines[i] ?? '';
    if (line.trim() !== '') return line;
  }
  return '';
}
