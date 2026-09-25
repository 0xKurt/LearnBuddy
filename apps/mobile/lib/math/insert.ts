// Inserting a symbol from the math keys into the answer at the cursor.
// Pure logic without React Native imports, so it runs in the unit tests.

export type Selection = { start: number; end: number };

export type Insertion = {
  text: string;
  /** Where the cursor goes, counted from the start of the inserted text (default: after it). */
  caret?: number;
};

/** Replaces the selected text (or inserts at the cursor) and returns the new text and cursor. */
export function insertAtCursor(
  value: string,
  selection: Selection | null,
  insertion: Insertion,
): { value: string; selection: Selection } {
  const len = value.length;
  const start = clamp(Math.min(selection?.start ?? len, selection?.end ?? len), 0, len);
  const end = clamp(Math.max(selection?.start ?? len, selection?.end ?? len), 0, len);
  const next = value.slice(0, start) + insertion.text + value.slice(end);
  const caret = start + clamp(insertion.caret ?? insertion.text.length, 0, insertion.text.length);
  return { value: next, selection: { start: caret, end: caret } };
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}
