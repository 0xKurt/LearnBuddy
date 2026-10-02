// What the return key does in the answer field, and where a worked path may be typed (issue #221).
//
// #209 checks a MULTI-LINE calculation path server-side for `numeric`, `formula` and `short`
// (`apps/api/src/modules/practice/steps.ts`): each transition is checked for equivalence and the
// first line that no longer follows is named. The field in front of it allowed line breaks only
// for `long` — so on the phone the return key sent the FIRST line as the whole answer and the
// path never reached the check at all.
//
// Two rules, and the second one is the whole point:
//
//   1. A path is possible exactly where #209 checks one. Not a kind more: in a vocabulary answer
//      or a multiple choice a line break means nothing, and a key that inserts one would only be
//      a way to break the answer.
//   2. The return key SENDS while the answer is one line, and makes a new line once it is more
//      than one. A one-liner stays fast (that is the owner's condition in #221: "Enter allein
//      bleibt für Einzeiler Senden"), and a path cannot be cut off half-way — once there is a
//      second line, the only thing that sends is "Prüfen".
//
// The first line break therefore cannot come from the return key; it comes from the ↵ key in the
// math row (`components/math/MathKeys.tsx`), which is the one control this adds.
//
// This lives here rather than inline in the component because the component layer renders
// through react-native-web, where a TextInput's `submitBehavior` is not in the DOM and cannot be
// asserted — the same reason `lib/theme/modeSwitch.ts` sits where it does.

import type { ItemKind } from '@learnbuddy/shared-types/contracts';

/**
 * The kinds whose answer may carry a worked path. Must stay in step with the condition in
 * `apps/api/src/modules/practice/evaluate.ts` that calls `checkPath` (issue #209).
 */
const PATH_KINDS: readonly ItemKind[] = ['numeric', 'formula', 'short'];

/** Whether a worked path is checked for this kind — and so whether the ↵ key is offered. */
export function pathPossible(kind: ItemKind): boolean {
  return PATH_KINDS.includes(kind);
}

/** Whether the answer in the field already spans more than one line. */
export function hasPath(kind: ItemKind, value: string): boolean {
  return pathPossible(kind) && value.includes('\n');
}

/**
 * What the return key does: send the answer, or add a line. `long` is prose and always takes the
 * line (that rule is older than this one and unchanged).
 */
export function returnKey(kind: ItemKind, value: string): 'send' | 'newline' {
  if (kind === 'long') return 'newline';
  return hasPath(kind, value) ? 'newline' : 'send';
}

/**
 * The line the math preview should draw. With a path the whole text is not one expression, and
 * the line that matters is the one she is arriving at — the same line `lastLine` in `steps.ts`
 * reads for the result. Empty trailing lines are skipped, so the preview does not blank out the
 * moment she adds a line.
 */
export function previewLine(kind: ItemKind, value: string): string {
  if (!hasPath(kind, value)) return value;
  const lines = value.split('\n').filter((l) => l.trim().length > 0);
  return lines[lines.length - 1] ?? '';
}
