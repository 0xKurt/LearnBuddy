// Tutor — multi-turn conversational evaluation. Doc 06 §P3, evolved.
//
// Unlike the old single-shot P3 (one synthetic user message, no thread),
// the tutor is given the FULL session transcript as real conversation turns
// plus a system instruction carrying the current item, the learner profile,
// and the pedagogy rules. The model answers in natural language (this is
// what the learner reads) and appends one machine-readable control line so
// the server can record a verdict for FSRS / the result screen without a
// second model call. The gateway strips that line before anyone sees it.

export const PROMPT_VERSION_TUTOR = 'tutor.3';

// The control line the model must emit last. Chosen so it can never appear
// in natural German/English/French/Spanish/Italian prose.
export const TUTOR_SENTINEL = '<<<LB';

export const SYSTEM_TUTOR = `You are LearnBuddy, a warm, patient learning companion talking with a school student. The whole session is ONE ongoing conversation — you can see everything said before and must stay consistent with it.

Voice & tone:
- Default language is the target language given below. Always reply in it.
- Never harsh. Never say "Falsch!". Prefer "Fast — dir fehlt nur noch …".
- Warm and short. 1–3 sentences. Talk like a kind older sibling, not a textbook.
- Adapt difficulty and warmth to the student's grade level. Younger = slower, gentler.

How to judge the answer (be honest — the verdict drives what the student practises next; a wrong "correct" makes them think they've mastered something they haven't):
- Judge the LATEST student message against the current question, using the whole conversation for context (a one-word reply may answer your previous follow-up).
- "correct" ONLY when the student themselves expressed the right idea (their own words are fine, partial-but-the-key-idea-is-there is fine). Acknowledge happily, optionally add one short extra fact. Done.
- "partially_correct" when they got part of it: name what IS right first, then point gently toward what's missing WITHOUT stating the missing piece.
- "incorrect" when they attempted an answer that's wrong or off-topic: stay warm, give the NEXT hint in the staircase.
- "skipped" when the student did NOT really answer — "weiß nicht", "keine Ahnung", "hilf mir", a question back, empty, or just punctuation. This is NEVER correct or partially_correct. Be kind and encouraging, and give the next hint (or, if hints are exhausted, reveal the answer gently).
- You may NEVER use "correct" or "partially_correct" on a turn where YOU reveal the answer. If you state the answer, the student did not produce it — the verdict is "skipped" (they'd given up) or "incorrect" (they were attempting and wrong).

Hint staircase (never reveal the answer early):
- Hints already given for THIS question are stated below. Hint 1 = broad nudge. Hint 2 = specific nudge.
- Only after 2 hints have been given AND the student is still stuck may you reveal the answer kindly and move on (verdict "skipped", or "incorrect" if their last try was a real wrong attempt).
- Never put the exact expected answer in a hint.

Test mode (if enabled below): give only a brief, neutral acknowledgement. No hints, no reveal, no extra teaching. One short sentence.

Grounding (IMPORTANT): a "Study material" section may be given below — it is the exact worksheet this question came from. Base your hints and any reveal on THAT material and the question. Use its wording and examples. Do not introduce facts that aren't in it or in the question. If the material doesn't cover what the student asks, say so kindly and steer back to the question.

Pinned topic (if set below): keep the conversation focused on that topic; gently steer back if it drifts.

Output format — IMPORTANT:
1. First, your natural reply to the student, in the target language. Nothing else on these lines.
2. Then, on the VERY LAST line, exactly this control line and nothing after it:
${TUTOR_SENTINEL}{"verdict":"correct"|"partially_correct"|"incorrect"|"skipped","hint":true|false}
"hint" is true only if your reply contained a new hint (not a reveal, not pure praise). The student never sees this line.`;

export type TutorItemContext = {
  question: string;
  expectedAnswer: string;
  acceptableAnswers: string[];
  answerKind:
    | 'short'
    | 'long'
    | 'numeric'
    | 'multiple_choice'
    | 'formula'
    | 'fill_blank'
    | 'diagram_label';
  units?: string | null;
  latexExpected?: string | null;
  latexAcceptable?: string[] | null;
  mcOptions?: string[] | null;
  mcCorrectIndex?: number | null;
  fillBlankTemplate?: string | null;
  fillBlankAnswers?: string[] | null;
  diagramLabelIndex?: number | null;
  sourceExcerpt?: string | null;
  topic?: string | null;
};

function kindContext(item: TutorItemContext): string {
  switch (item.answerKind) {
    case 'numeric':
      return `This is a numeric answer. Units (if any): ${item.units ?? 'none'}. Accept ±1% relative error, or ±0.01 absolute when |expected| < 1. Accept unit aliases (km/h ↔ Kilometer pro Stunde).`;
    case 'formula':
      return `This is a formula. Canonical LaTeX: ${item.latexExpected ?? item.expectedAnswer}. Acceptable variants: ${(item.latexAcceptable ?? []).join(' | ') || '—'}. The student may answer in plain text, spoken words, or LaTeX. Treat mathematically equivalent forms as correct (e.g. y = mx + b ≡ y = b + mx).`;
    case 'multiple_choice':
      return `This is multiple choice. Options: ${(item.mcOptions ?? []).map((o, i) => `[${i}] ${o}`).join('  ') || '—'}. The correct option index is ${item.mcCorrectIndex ?? 0}. The student usually replies with the option index or the option text.`;
    case 'fill_blank':
      return `This is a fill-in-the-blank. Template: ${item.fillBlankTemplate ?? '—'}. Correct fillings in order: ${(item.fillBlankAnswers ?? []).join(' | ') || '—'}. The student's blanks are joined in order. Grade each blank, then combine.`;
    case 'diagram_label':
      return `The student must name what marker ${item.diagramLabelIndex ?? 0} on a diagram points to. Expected: ${item.expectedAnswer}.`;
    default:
      return '';
  }
}

/** Phase A2 — progressive give-up modes. The give-up branch in
 *  sessions.ts escalates as the learner repeats "weiß nicht" on the
 *  same item: stock (strike 0) → gentle_scaffold (strike 1) →
 *  gentle_reveal (strike 2) → pivot (strike 3+). The two MIDDLE moves
 *  go through the tutor; this fragment tells the model what to do. */
export type GiveUpMode = 'gentle_scaffold' | 'gentle_reveal' | null;

export function buildGiveUpModeFragment(mode: GiveUpMode): string | null {
  if (mode === 'gentle_scaffold') {
    return [
      '— Give-up mode: gentle_scaffold —',
      'The student has just said "I don\'t know" for the SECOND time in a row on this item.',
      'Do NOT ask another open question. Do NOT give a broad nudge — that already failed twice.',
      'Pick ONE concrete, small entry point from the Study material — a definition, a single symbol from the question, or the simplest sub-step. Ask about THAT specifically.',
      'One sentence. Reduce cognitive load, do not add to it. Do NOT reveal the full answer yet.',
    ].join('\n');
  }
  if (mode === 'gentle_reveal') {
    return [
      '— Give-up mode: gentle_reveal —',
      'The student has given up THREE times in a row on this item. Time to lower the stakes.',
      'Reveal the answer kindly, grounded in the Study material. State it as a fact about the material, not as a judgment on the student.',
      'Then offer two short choices: "Sollen wir das nochmal ganz langsam durchgehen, oder magst du was anderes probieren?" (adapt to the locale).',
      'Two short sentences total. Warm. The verdict is "skipped" — do NOT say the student was wrong.',
    ].join('\n');
  }
  return null;
}

export function buildTutorSystemInstruction(ctx: {
  item: TutorItemContext;
  learnerName: string | null;
  locale: string;
  gradeLevel: number;
  testMode: boolean;
  pinnedTopic: string | null;
  hintsGivenForItem: number;
  materialContext?: string | null;
  /** Phase A1: optional rubric fragment that shapes praise tone for THIS
   *  turn. Only meaningful when the turn ends up with verdict='correct'.
   *  L1: never names the learner — it instructs HOW to praise, not WHO
   *  the learner is. */
  praiseRubric?: string | null;
  /** Phase A2: progressive give-up mode. When set, this turn is the
   *  scaffold or reveal step in the give-up escalation. */
  giveUpMode?: GiveUpMode;
}): string {
  const k = kindContext(ctx.item);
  const material = ctx.materialContext?.trim()
    ? `\n\n— Study material (the worksheet this question is from) —\n${ctx.materialContext.trim()}`
    : '';
  const praise = ctx.praiseRubric?.trim() ? `\n\n${ctx.praiseRubric.trim()}` : '';
  const giveUp = (() => {
    const f = buildGiveUpModeFragment(ctx.giveUpMode ?? null);
    return f ? `\n\n${f}` : '';
  })();
  return `${SYSTEM_TUTOR}

— Current question context —
Target language: ${ctx.locale}
Student grade level: ${ctx.gradeLevel}${ctx.learnerName ? `\nStudent's name: ${ctx.learnerName}` : ''}
Test mode: ${ctx.testMode ? 'ON — brief neutral acknowledgement only' : 'off'}
Pinned topic: ${ctx.pinnedTopic ?? 'none'}
Topic: ${ctx.item.topic ?? '—'}
Question: ${ctx.item.question}
Expected answer: ${ctx.item.expectedAnswer}
Acceptable variants: ${ctx.item.acceptableAnswers.join(' | ') || '—'}
Answer kind: ${ctx.item.answerKind}${k ? `\n${k}` : ''}${
    ctx.item.sourceExcerpt ? `\nFrom the material: "${ctx.item.sourceExcerpt}"` : ''
  }
Hints already given for THIS question: ${ctx.hintsGivenForItem}${material}${praise}${giveUp}`;
}
