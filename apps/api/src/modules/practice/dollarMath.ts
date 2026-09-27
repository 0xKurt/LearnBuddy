// LaTeX the model forgot to put between dollar signs (docs/architecture.md §Practice). A pure
// math field (answer, choice) becomes math as a whole; in a sentence only the math runs are
// wrapped, so the words around them stay words (audit M-43 p2-dollarmath-wraps-whole-prompt:
// "Kürze den Bruch \frac{6}{8} so weit wie möglich." was stored as one italic glued formula).

/** A LaTeX command or a braced super-/subscript: the text is meant as math. */
const LATEX = /\\(frac|dfrac|sqrt|cdot|times|div|pi|le|leq|ge|geq|ne|neq|approx|pm)\b|[\^_]\{/;
/** Tokens that join math runs: numbers and operators ("\frac{1}{2} + \frac{1}{3}", "3 \cdot 4 = 12"). */
const JOINER = /^(?:[0-9]+(?:[.,][0-9]+)?|[-+=<>*/:·×÷−≤≥≠≈()])$/;
const TRAILING = /[.,;:!?]+$/;

/** The rule for whole fields, unchanged since the answer keys depend on it. */
const FIELD_LATEX = /\\(frac|sqrt|cdot|times|div|pi|le|ge|ne|approx)\b|\^\{/;

/** A whole field that is math (answer, accepted answer, choice). */
export function dollarMathField(text: string): string {
  if (text.includes('$') || !FIELD_LATEX.test(text)) return text;
  return `$${text}$`;
}

/** A sentence: each maximal run of LaTeX (with the numbers and operators between) wrapped. */
export function dollarMathRuns(text: string): string {
  if (text.includes('$') || !LATEX.test(text)) return text;
  // Words and the whitespace between them, kept so the sentence is rebuilt exactly.
  const parts = text.split(/(\s+)/);
  const words = parts.filter((_, i) => i % 2 === 0);
  const core = words.map((w) => w.replace(TRAILING, ''));
  const isLatex = core.map((w) => LATEX.test(w));
  const inRun = [...isLatex];
  // Grow each run over neighbouring numbers and operators.
  for (let i = 0; i < words.length; i++) {
    if (!isLatex[i]) continue;
    for (let j = i - 1; j >= 0 && !inRun[j] && JOINER.test(words[j]!); j--) inRun[j] = true;
    for (let j = i + 1; j < words.length && !inRun[j]; j++) {
      // A joiner with trailing punctuation ends the run ("= 12?").
      if (!JOINER.test(core[j]!)) break;
      inRun[j] = true;
      if (core[j] !== words[j]) break;
    }
  }
  // An operator at either end of a run belongs to the sentence, not the formula.
  const isOp = (i: number) => /^[-+=<>*/:·×÷−≤≥≠≈]$/.test(core[i]!);
  for (let i = 0; i < words.length; i++) {
    if (!inRun[i] || isLatex[i]) continue;
    const startsRun = i === 0 || !inRun[i - 1];
    const endsRun = i === words.length - 1 || !inRun[i + 1];
    if ((startsRun || endsRun) && isOp(i)) inRun[i] = false;
  }
  let out = '';
  for (let i = 0; i < words.length; i++) {
    const space = i > 0 ? parts[2 * i - 1]! : '';
    const opens = inRun[i] && (i === 0 || !inRun[i - 1]);
    const closes = inRun[i] && (i === words.length - 1 || !inRun[i + 1]);
    const word = words[i]!;
    const tail = closes ? word.slice(core[i]!.length) : '';
    const body = closes ? core[i]! : word;
    out += `${space}${opens ? '$' : ''}${body}${closes ? `$${tail}` : ''}`;
  }
  return out;
}
