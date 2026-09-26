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
