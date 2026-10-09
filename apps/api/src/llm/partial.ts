// Reading a JSON answer while it is still being written (streaming): the text
// of one top-level string field so far, and whether it is finished. Only for
// showing progress; decisions are made on the whole answer, parsed and validated.
//
// With one exception, and it is deliberate: `answerUpTo` cuts the answer after the n-th finished
// element of one array and closes the brackets, so the prefix is itself a complete answer that the
// SAME zod schema validates. A decision IS made on it — a practice run starts on the first
// questions of a set that is still being written (issue #220) — but never on anything half
// written: only text up to a closing brace is used, and what comes out is validated like any
// finished answer.

export type PartialString = { text: string; done: boolean };

const ESCAPES: Record<string, string> = {
  '"': '"',
  '\\': '\\',
  '/': '/',
  b: '\b',
  f: '\f',
  n: '\n',
  r: '\r',
  t: '\t',
};

/**
 * The value of `"key": "…"` in the object's first level, as far as it is written;
 * null while the key has not appeared (or its value is not a string).
 */
export function partialString(raw: string, key: string): PartialString | null {
  const at = valueAt(raw, key, false);
  return at >= 0 && raw[at] === '"' ? readString(raw, at + 1) : null;
}

/**
 * Index of the value of `"key":` in the object's first level (after the colon and any space), or
 * -1 while the key has not been written. With `outerArrayEnds`, a `[` outside every object ends
 * the search: such an answer is not the object an array is read from.
 */
function valueAt(raw: string, key: string, outerArrayEnds: boolean): number {
  let depth = 0;
  let i = 0;
  while (i < raw.length) {
    const c = raw[i];
    if (c === '{' || c === '[') {
      if (c === '[' && depth === 0 && outerArrayEnds) return -1;
      depth++;
    } else if (c === '}' || c === ']') depth--;
    else if (c === '"') {
      const end = stringEnd(raw, i);
      if (end < 0) return -1; // an unfinished key or value that is not ours
      if (depth === 1 && raw.slice(i + 1, end) === key) {
        let j = end + 1;
        while (j < raw.length && /\s/.test(raw[j]!)) j++;
        if (raw[j] === ':') {
          j++;
          while (j < raw.length && /\s/.test(raw[j]!)) j++;
          return j;
        }
      }
      i = end + 1;
      continue;
    }
    i++;
  }
  return -1;
}

/** Index of the quote closing the string opened at `start`, or -1 if not written yet. */
function stringEnd(raw: string, start: number): number {
  for (let i = start + 1; i < raw.length; i++) {
    if (raw[i] === '\\') i++;
    else if (raw[i] === '"') return i;
  }
  return -1;
}

function readString(raw: string, from: number): PartialString {
  let text = '';
  for (let i = from; i < raw.length; i++) {
    const c = raw[i]!;
    if (c === '"') return { text, done: true };
    if (c !== '\\') {
      text += c;
      continue;
    }
    const e = raw[i + 1];
    if (e === undefined) break; // the escape is not complete yet
    if (e === 'u') {
      const hex = raw.slice(i + 2, i + 6);
      if (hex.length < 4) break;
      text += String.fromCharCode(parseInt(hex, 16));
      i += 5;
      continue;
    }
    text += ESCAPES[e] ?? e;
    i++;
  }
  return { text, done: false };
}

/**
 * The elements of `"key": [ … ]` in the object's first level that are **completely**
 * written, as parsed values; `[]` while the array has not started or holds nothing
 * finished yet. Half-written elements are never returned: a word judged "ok" that
 * turns out to be `false` two characters later must not flash green on the phone.
 */
export function partialArray(raw: string, key: string): unknown[] {
  const start = arrayStart(raw, key);
  if (start < 0) return [];
  const out: unknown[] = [];
  for (const { from, to } of finishedElements(raw, start)) {
    try {
      out.push(JSON.parse(raw.slice(from, to + 1)));
    } catch {
      break;
    }
  }
  return out;
}

/**
 * The whole answer as it stands after the n-th **finished** element of `"key": [ … ]`, as a
 * complete JSON value — or null while fewer than n are finished, or when what stands before the
 * array does not parse on its own.
 *
 * Where `partialArray` hands back elements to SHOW, this hands back an answer to ACT on: fields
 * before the array included, which is what makes it validatable with the finished answer's schema.
 * The models write their fields in schema order (measured for `extraction`, 02.10.), so the prefix
 * is the real answer rather than a reconstruction of one.
 *
 * It holds EXACTLY n elements even when more are already there: the caller asked for the first n,
 * and everything after them belongs to the part that is still coming.
 */
export function answerUpTo(raw: string, key: string, n: number): unknown | null {
  if (n < 1) return null;
  const start = arrayStart(raw, key);
  if (start < 0) return null;
  let found = 0;
  for (const { to } of finishedElements(raw, start)) {
    found++;
    if (found < n) continue;
    try {
      return JSON.parse(`${raw.slice(0, to + 1)}]}`);
    } catch {
      // What stands before the array is not valid JSON on its own. Nothing is guessed: the
      // caller tries again with the next chunk, and otherwise gets the finished answer.
      return null;
    }
  }
  // The array is closed, or a string in it is still being written: n elements are not there.
  return null;
}

/**
 * Each object or array element of the array opened just before `start` once it is completely
 * written: where it starts and where it ends. Ends at the array's own `]`, and at a string still
 * being written: nothing after it is final.
 */
function* finishedElements(raw: string, start: number): Generator<{ from: number; to: number }> {
  let depth = 0;
  let from = -1;
  for (let i = start; i < raw.length; i++) {
    const c = raw[i]!;
    if (c === '"') {
      const end = stringEnd(raw, i);
      if (end < 0) return;
      i = end;
      continue;
    }
    if (c === '{' || c === '[') {
      if (depth === 0) from = i;
      depth++;
      continue;
    }
    if (c === '}' || c === ']') {
      depth--;
      if (depth < 0) return; // the array itself is closed
      if (depth === 0 && from >= 0) {
        yield { from, to: i };
        from = -1;
      }
    }
  }
}

/** Index just after `"key": [` at the first level, or -1 while it has not been written. */
function arrayStart(raw: string, key: string): number {
  const at = valueAt(raw, key, true);
  return at >= 0 && raw[at] === '[' ? at + 1 : -1;
}
