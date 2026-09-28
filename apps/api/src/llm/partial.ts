// Reading a JSON answer while it is still being written (streaming): the text
// of one top-level string field so far, and whether it is finished. Only for
// showing progress; decisions are made on the whole answer, parsed and validated.

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
  let depth = 0;
  let i = 0;
  while (i < raw.length) {
    const c = raw[i];
    if (c === '{' || c === '[') depth++;
    else if (c === '}' || c === ']') depth--;
    else if (c === '"') {
      const end = stringEnd(raw, i);
      if (end < 0) return null; // an unfinished key or value that is not ours
      if (depth === 1 && raw.slice(i + 1, end) === key) {
        let j = end + 1;
        while (j < raw.length && /\s/.test(raw[j]!)) j++;
        if (raw[j] !== ':') {
          i = end + 1;
          continue;
        }
        j++;
        while (j < raw.length && /\s/.test(raw[j]!)) j++;
        if (j >= raw.length) return null;
        if (raw[j] !== '"') return null;
        return readString(raw, j + 1);
      }
      i = end + 1;
      continue;
    }
    i++;
  }
  return null;
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
  let depth = 0;
  let from = -1;
  for (let i = start; i < raw.length; i++) {
    const c = raw[i]!;
    if (c === '"') {
      const end = stringEnd(raw, i);
      if (end < 0) break; // a string that is still being written: nothing after it is final
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
      if (depth < 0) break; // the array itself is closed
      if (depth === 0 && from >= 0) {
        try {
          out.push(JSON.parse(raw.slice(from, i + 1)));
        } catch {
          break;
        }
        from = -1;
      }
      continue;
    }
  }
  return out;
}

/** Index just after `"key": [` at the first level, or -1 while it has not been written. */
function arrayStart(raw: string, key: string): number {
  let depth = 0;
  let i = 0;
  while (i < raw.length) {
    const c = raw[i];
    if (c === '{') depth++;
    else if (c === '}') depth--;
    else if (c === '[') {
      if (depth === 0) return -1;
      depth++;
    } else if (c === ']') depth--;
    else if (c === '"') {
      const end = stringEnd(raw, i);
      if (end < 0) return -1;
      if (depth === 1 && raw.slice(i + 1, end) === key) {
        let j = end + 1;
        while (j < raw.length && /\s/.test(raw[j]!)) j++;
        if (raw[j] !== ':') {
          i = end + 1;
          continue;
        }
        j++;
        while (j < raw.length && /\s/.test(raw[j]!)) j++;
        return raw[j] === '[' ? j + 1 : -1;
      }
      i = end + 1;
      continue;
    }
    i++;
  }
  return -1;
}
