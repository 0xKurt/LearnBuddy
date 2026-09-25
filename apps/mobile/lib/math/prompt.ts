// A question or message text as runs to draw: plain words, $…$ math, **bold**
// and — in questions — fill-in blanks ("Ich helfe ___ Mutter.": three or more
// underscores). Bold may wrap math and blanks; blanks and bold markers inside
// $…$ belong to the math and are left alone. Pure logic without React Native
// imports, so it runs in the unit tests.

import { mathSpans, parseMath, type MathAtom } from './parse.js';

export type PromptRun =
  | { type: 'plain'; text: string; bold: boolean }
  | { type: 'math'; atoms: MathAtom[]; bold: boolean }
  /** `index`: 0-based position among the blanks of the text. */
  | { type: 'blank'; index: number; bold: boolean };

export type PromptOptions = {
  /** Read "___" as a blank to fill in (questions); otherwise it stays as written. */
  blanks: boolean;
};

/** The longest answer drawn into a blank; a longer one would break the sentence apart. */
export const MAX_FILLED_LENGTH = 40;

type RawRun =
  | { type: 'plain'; raw: string; bold: boolean }
  | { type: 'math'; raw: string; inner: string; bold: boolean }
  | { type: 'blank'; index: number; bold: boolean };

const BOLD = /\*\*([^*\n]+?)\*\*/g;
const BLANK = /_{3,}/g;
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
  const ranges: { start: number; end: number; bold: boolean }[] = [];
  last = 0;
  for (const m of masked.matchAll(BOLD)) {
    const at = m.index;
    if (at > last) ranges.push({ start: last, end: at, bold: false });
    ranges.push({ start: at + 2, end: at + m[0].length - 2, bold: true });
    last = at + m[0].length;
  }
  if (last < text.length) ranges.push({ start: last, end: text.length, bold: false });

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
    let at = r.start;
    for (const mark of marks) {
      if (mark.start < r.start || mark.end > r.end) continue;
      if (mark.start > at)
        out.push({ type: 'plain', raw: text.slice(at, mark.start), bold: r.bold });
      if (mark.math) {
        out.push({
          type: 'math',
          raw: text.slice(mark.start, mark.end),
          inner: mark.math.inner,
          bold: r.bold,
        });
      } else out.push({ type: 'blank', index: blankIndex++, bold: r.bold });
      at = mark.end;
    }
    if (r.end > at) out.push({ type: 'plain', raw: text.slice(at, r.end), bold: r.bold });
  }
  return out;
}

/** The runs to draw. An escaped \$ in the text shows as $. */
export function parsePrompt(text: string, options: PromptOptions): PromptRun[] {
  return scan(text, options).map((r): PromptRun => {
    switch (r.type) {
      case 'plain':
        return { type: 'plain', text: r.raw.replace(/\\\$/g, '$'), bold: r.bold };
      case 'math':
        return { type: 'math', atoms: parseMath(r.inner), bold: r.bold };
      case 'blank':
        return r;
    }
  });
}

/** How many blanks the text has (outside math). */
export function countBlanks(text: string): number {
  return scan(text, { blanks: true }).filter((r) => r.type === 'blank').length;
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
      if (r.type === 'blank') return ` ${options.filledWord ?? options.blankWord} `;
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
