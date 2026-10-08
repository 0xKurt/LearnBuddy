// Where MathText may break a line that holds math: the text in groups that never break inside
// (a word, a term like "x²", a gap with the punctuation after it, a number with its unit). Pure
// logic without React Native imports, so it runs in the unit tests.

import { THIN, type MathAtom } from './parse.js';
import type { PromptRun } from './prompt.js';

/** Where plain text may break: spaces, but never a no-break one (U+00A0, U+202F; issue #467). */
const BREAKABLE_SPACE = /([^\S\u00A0\u202F]+)/;

export type Piece =
  | { kind: 'plain'; text: string; bold: boolean; italic?: boolean }
  | { kind: 'atom'; atom: MathAtom; bold: boolean }
  | { kind: 'blank'; bold: boolean };

/**
 * Groups the runs into pieces that never break inside; the line may break between groups: at
 * the breakable spaces of the text (never at a no-break space, issue #467) and after + − = …
 * inside math.
 */
export function breakGroups(runs: PromptRun[]): Piece[][] {
  const groups: Piece[][] = [];
  let cur: Piece[] = [];
  const close = () => {
    if (cur.length > 0) groups.push(cur);
    cur = [];
  };
  for (const run of runs) {
    if (run.type === 'blank') {
      cur.push({ kind: 'blank', bold: run.bold });
      continue;
    }
    if (run.type === 'plain') {
      // The split keeps its separators: every odd part is a breakable space.
      run.text.split(BREAKABLE_SPACE).forEach((part, k) => {
        if (k % 2 === 1) {
          appendPlain(cur, ' ', run.bold, run.italic === true);
          close();
        } else if (part.length > 0) appendPlain(cur, part, run.bold, run.italic === true);
      });
      continue;
    }
    for (const atom of run.atoms) {
      if (atom.type !== 'chars') {
        cur.push({ kind: 'atom', atom, bold: run.bold });
        if (atom.type === 'symbol' && atom.char.endsWith(THIN)) close();
        continue;
      }
      // Break after a spaced operator: "x² − 4x + 3" → "x² − " | "4x + " | "3".
      for (const p of splitAfterOperators(atom.text)) {
        cur.push({ kind: 'atom', atom: { type: 'chars', text: p }, bold: run.bold });
        if (p.endsWith(THIN)) close();
      }
    }
  }
  close();
  return groups;
}

/** "x − 4x + 3" (operators padded with thin spaces) → ["x − ", "4x + ", "3"]. */
function splitAfterOperators(text: string): string[] {
  const out: string[] = [];
  let start = 0;
  for (let i = 1; i < text.length; i++) {
    // A thin space that closes an operator ("␣−␣"): the one after a non-space.
    if (text[i] === THIN && text[i - 1] !== THIN && i >= 2 && text[i - 2] === THIN) {
      out.push(text.slice(start, i + 1));
      start = i + 1;
    }
  }
  if (start < text.length) out.push(text.slice(start));
  return out;
}

function appendPlain(cur: Piece[], text: string, bold: boolean, italic: boolean): void {
  const last = cur[cur.length - 1];
  if (last?.kind === 'plain' && last.bold === bold && (last.italic ?? false) === italic) {
    cur[cur.length - 1] = { kind: 'plain', text: last.text + text, bold, italic };
  } else cur.push({ kind: 'plain', text, bold, italic });
}
