// A question or message text as runs to draw: plain words, $…$ math, **bold**,
// *italic* (or _italic_) and — in questions — fill-in blanks ("Ich helfe ___ Mutter.": three or more
// underscores). Bold may wrap math and blanks; bold markers inside $…$ belong to
// the math. A blank inside math ("$\frac{3}{4} = \frac{___}{8}$", or \square) is
// a blank atom of the math (parse.ts): counted, filled and read like any other.
// Pure logic without React Native imports, so it runs in the unit tests.

import { mathSpans, parseMath, type MathAtom } from './parse.js';
import { bindUnits } from './quantity.js';

/** Italic is only set when true, so runs without it compare as before. */
type Slant = { italic?: true };

export type PromptRun =
  | ({ type: 'plain'; text: string; bold: boolean } & Slant)
  | ({ type: 'math'; atoms: MathAtom[]; bold: boolean } & Slant)
  /** `index`: 0-based position among the blanks of the text. */
  | ({ type: 'blank'; index: number; bold: boolean } & Slant);

export type PromptOptions = {
  /** Read "___" as a blank to fill in (questions); otherwise it stays as written. */
  blanks: boolean;
};

/** The longest answer drawn into a blank; a longer one would break the sentence apart. */
export const MAX_FILLED_LENGTH = 40;

type RawRun =
  | ({ type: 'plain'; raw: string; bold: boolean } & Slant)
  | ({ type: 'math'; raw: string; inner: string; bold: boolean } & Slant)
  | ({ type: 'blank'; index: number; bold: boolean } & Slant);

/** **bold**, which may hold *italic* inside it. */
const BOLD = /\*\*((?:[^*\n]|\*(?!\*))+?)\*\*/g;
/**
 * *italic* or _italic_: the marker hugs a word on both sides and stands outside a word, so
 * "2 * 3 * 4", "2*3*4", "x_1" and blanks ("___") stay as written.
 */
const ITALIC =
  /(?<![*\w])\*(?![\s*])([^*\n]+?)(?<![\s*])\*(?![*\w])|(?<![\w_])_(?![\s_])([^_\n]+?)(?<![\s_])_(?![\w_])/g;
const BLANK = /_{3,}/g;
/** A blank written inside math (parse.ts turns each into a { type: 'blank' } atom). */
const MATH_BLANK = /_{3,}|\\(?:square|Box)(?![a-zA-Z])/g;

function mathBlanks(inner: string): number {
  return [...inner.matchAll(MATH_BLANK)].length;
}
/** Stands in for math while bold and blanks are searched (never "*" or "_"). */
const MASK = '';

function scan(text: string, options: PromptOptions): RawRun[] {
  const spans = mathSpans(text);
  let masked = '';
  let last = 0;
  for (const s of spans) {
    masked += text.slice(last, s.start) + MASK.repeat(s.end - s.start);
    last = s.end;
  }
  masked += text.slice(last);

  // The text in ranges, each bold or not; the ** markers themselves drop out.
  const boldRanges: { start: number; end: number; bold: boolean }[] = [];
  last = 0;
  for (const m of masked.matchAll(BOLD)) {
    const at = m.index;
    if (at > last) boldRanges.push({ start: last, end: at, bold: false });
    boldRanges.push({ start: at + 2, end: at + m[0].length - 2, bold: true });
    last = at + m[0].length;
  }
  if (last < text.length) boldRanges.push({ start: last, end: text.length, bold: false });
  // Within each range, italic parts; their single markers drop out as well.
  const ranges: { start: number; end: number; bold: boolean; italic: boolean }[] = [];
  for (const r of boldRanges) {
    let at = r.start;
    for (const m of masked.slice(r.start, r.end).matchAll(ITALIC)) {
      const from = r.start + m.index;
      if (from > at) ranges.push({ start: at, end: from, bold: r.bold, italic: false });
      ranges.push({ start: from + 1, end: from + m[0].length - 1, bold: r.bold, italic: true });
      at = from + m[0].length;
    }
    if (r.end > at) ranges.push({ start: at, end: r.end, bold: r.bold, italic: false });
  }

  const blanks = options.blanks
    ? [...masked.matchAll(BLANK)].map((m) => ({ start: m.index, end: m.index + m[0].length }))
    : [];
  // Math and blanks in text order; both lie wholly inside one range.
  const marks = [
    ...spans.map((s) => ({ start: s.start, end: s.end, math: s })),
    ...blanks.map((b) => ({ start: b.start, end: b.end, math: null })),
  ].sort((a, b) => a.start - b.start);

  const out: RawRun[] = [];
  let blankIndex = 0;
  for (const r of ranges) {
    const slant: Slant = r.italic ? { italic: true } : {};
    let at = r.start;
    for (const mark of marks) {
      if (mark.start < r.start || mark.end > r.end) continue;
      if (mark.start > at)
        out.push({ type: 'plain', raw: text.slice(at, mark.start), bold: r.bold, ...slant });
      if (mark.math) {
        out.push({
          type: 'math',
          raw: text.slice(mark.start, mark.end),
          inner: mark.math.inner,
          bold: r.bold,
          ...slant,
        });
        if (options.blanks) blankIndex += mathBlanks(mark.math.inner);
      } else out.push({ type: 'blank', index: blankIndex++, bold: r.bold, ...slant });
      at = mark.end;
    }
    if (r.end > at) out.push({ type: 'plain', raw: text.slice(at, r.end), bold: r.bold, ...slant });
  }
  return out;
}

/** Whether a run ends in a digit: "$15$" or "**15**" before " km/h". */
function endsInNumber(run: RawRun | undefined): boolean {
  if (run?.type === 'plain') return /\p{N}$/u.test(run.raw);
  return run?.type === 'math' && /\p{N}$/u.test(run.inner.trim());
}

/**
 * The runs to draw. An escaped \$ in the text shows as $; a number and its unit are bound by a
 * no-break space (quantity.ts), also when the number stands in the run before.
 */
export function parsePrompt(text: string, options: PromptOptions): PromptRun[] {
  const raw = scan(text, options);
  return raw.map((r, i): PromptRun => {
    switch (r.type) {
      case 'plain':
        return {
          type: 'plain',
          text: bindUnits(r.raw.replace(/\\\$/g, '$'), { afterNumber: endsInNumber(raw[i - 1]) }),
          bold: r.bold,
          ...(r.italic ? { italic: true as const } : {}),
        };
      case 'math':
        return {
          type: 'math',
          atoms: parseMath(r.inner),
          bold: r.bold,
          ...(r.italic ? { italic: true as const } : {}),
        };
      case 'blank':
        return r;
    }
  });
}

/** How many blanks the text has, in plain text and inside math. */
export function countBlanks(text: string): number {
  return scan(text, { blanks: true }).reduce(
    (n, r) => n + (r.type === 'blank' ? 1 : r.type === 'math' ? mathBlanks(r.inner) : 0),
    0,
  );
}

/**
 * The text for the screen reader: bold markers gone, every blank replaced by
 * `blankWord` ("Lücke") — or by `filledWord` for a blank that has an answer
 * in it. Math stays as $…$ for speak.ts to read out.
 */
export function promptForSpeech(
  text: string,
  options: PromptOptions & { blankWord: string; filledWord?: string | null },
): string {
  return scan(text, options)
    .map((r) => {
      const word = options.filledWord ?? options.blankWord;
      if (r.type === 'blank') return ` ${word} `;
      // Inside math the blank is read as the same word ("3 durch 4 gleich Lücke durch 8").
      if (r.type === 'math' && options.blanks)
        return r.raw.replace(MATH_BLANK, () => `\\text{${word.replace(/[{}]/g, '')}}`);
      return r.raw;
    })
    .join('')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

/**
 * The typed answer to show inside the blank while she writes, or null: only
 * for a text with exactly one blank and a short, single-line answer (with
 * several blanks, one answer can't be placed honestly).
 */
export function fillableAnswer(prompt: string, answer: string | null | undefined): string | null {
  const a = (answer ?? '').trim();
  if (a.length === 0 || a.length > MAX_FILLED_LENGTH || /\n/.test(a)) return null;
  return countBlanks(prompt) === 1 ? a : null;
}
