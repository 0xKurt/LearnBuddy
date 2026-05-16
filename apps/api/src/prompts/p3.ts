// P3 — Answer evaluation. Doc 06 §P3.

export const SYSTEM_P3 = `You are a patient learning helper for school children. You evaluate one student answer at a time. You are encouraging, never harsh. You give hints, not full answers, unless explicitly asked.`;
export const PROMPT_VERSION_P3 = 'p3.0';

type Kind =
  | 'short'
  | 'long'
  | 'numeric'
  | 'multiple_choice'
  | 'formula'
  | 'fill_blank'
  | 'diagram_label';

function kindSpecificContext(input: {
  answerKind: Kind;
  units?: string;
  latexExpected?: string;
  latexAcceptable?: string[];
  mcOptions?: string[];
  mcCorrectIndex?: number;
  fillBlankTemplate?: string;
  fillBlankAnswers?: string[];
  diagramLabelIndex?: number;
  expectedAnswer: string;
}): string {
  switch (input.answerKind) {
    case 'numeric':
      return `Expected as a number. Units (if any): ${input.units ?? 'none'}. Tolerate ±1% relative error or ±0.01 absolute when |expected| < 1. Tolerate unit aliases.`;
    case 'formula':
      return `Expected as a mathematical formula in LaTeX: ${input.latexExpected ?? ''}. Acceptable variants: ${(input.latexAcceptable ?? []).join(' | ')}. Treat mathematically equivalent forms as correct.`;
    case 'multiple_choice':
      return `Options were: ${(input.mcOptions ?? []).map((o, i) => `[${i}] ${o}`).join(' | ')}. Correct index: ${input.mcCorrectIndex ?? 0}. Student's answer is the option index they selected.`;
    case 'fill_blank':
      return `Template was: ${input.fillBlankTemplate ?? ''}. Expected blanks in order: ${(input.fillBlankAnswers ?? []).join(' | ')}. Student's answer is the joined attempts in order, separated by " | ". Grade each blank independently and combine.`;
    case 'diagram_label':
      return `The student was asked what number ${input.diagramLabelIndex ?? 0} on a diagram refers to. Expected: ${input.expectedAnswer}.`;
    case 'short':
    case 'long':
    default:
      return '';
  }
}

export function buildP3UserPrompt(input: {
  locale: string;
  gradeLevel: number;
  question: string;
  expectedAnswer: string;
  acceptableAnswers: string[];
  answerKind: Kind;
  units?: string;
  latexExpected?: string;
  latexAcceptable?: string[];
  mcOptions?: string[];
  mcCorrectIndex?: number;
  fillBlankTemplate?: string;
  fillBlankAnswers?: string[];
  diagramLabelIndex?: number;
  kidAnswer: string;
  parsedKidLatex?: string;
  priorHints: string[];
}): string {
  const parsed = input.parsedKidLatex
    ? `Student answer parsed to LaTeX (by client): ${input.parsedKidLatex}.`
    : '';
  return `Target language for feedback: ${input.locale}
Student grade level: ${input.gradeLevel}
Question: ${input.question}
Expected answer: ${input.expectedAnswer}
Acceptable variants: ${input.acceptableAnswers.join(' | ')}
Answer kind: ${input.answerKind}
${kindSpecificContext(input)}
Student's answer (raw text): ${input.kidAnswer}
${parsed}
Hints already given in this attempt: ${input.priorHints.join(' | ')}

Decide:
- verdict: "correct" | "partially_correct" | "incorrect"
  * "correct" if essentially right, even if phrased differently or partial
    as long as the key concept is present.
  * "partially_correct" if the answer captures part of the idea but
    misses important elements.
  * "incorrect" if wrong, off-topic, or empty.

Write feedback (1–2 short sentences) in ${input.locale}, age-appropriate
for grade ${input.gradeLevel}. For correct: brief acknowledgment, optionally
one extra fact. For partial: name what is right, then what is missing
without stating the missing piece. For incorrect: a gentle nudge.

If verdict is "partially_correct" or "incorrect" AND priorHints contains
fewer than 2 entries, write next_hint: ONE concrete hint pointing toward
the missing piece, without containing the expected answer verbatim. If 2
hints have already been given, set next_hint to null and have feedback
reveal the answer kindly.

OUTPUT FORMAT — strictly valid JSON:
{
  "verdict": "correct" | "partially_correct" | "incorrect",
  "feedback": "string",
  "next_hint": "string" | null
}`;
}
