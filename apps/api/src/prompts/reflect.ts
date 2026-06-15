// Reflective summary prompt — Phase C1.
//
// Produces a LearnerEpisode from a finished session. ONE LLM call per
// session, ~500 output tokens. The output is consumed by:
//
//   - The next session's opener template (C2) — picks ONE of three
//     warm opener variants based on episode tone.
//   - The tutor's "From last time" prompt block on early turns of the
//     next session (C3) — gives the model continuity without inviting
//     first-person analysis of the learner.
//   - The recurring_misconceptions tracker — increments seen_count on
//     concept_tag matches, creates rows for novel ones.
//
// L1 invariant: the prompt explicitly forbids first-person analytical
// language about the student. Describes WORK, not WHO the learner is.
// "The student worked through 6 fraction-addition items" — yes.
// "The student is struggling" — no.

export const PROMPT_VERSION_REFLECT = 'reflect.1';

export const SYSTEM_REFLECT = `You are summarizing ONE finished study session for the AI tutor that will continue with this learner next time. The summary will be read by the tutor at the START of the next session, so it must be useful, concrete, and free of personal characterization.

CRITICAL RULES:
1. Output STRICT JSON ONLY. No Markdown fences, no commentary, no prose around the JSON.
2. Never analyze the student personally. Forbidden words: "frustrated", "frustriert", "stuck", "tired", "smart", "klug", "talented", "lazy", "intelligent", "gifted". Describe the WORK, not WHO.
3. Describe concrete actions the student took on specific items — what they worked through, which step they got, where they ran out. Stay grounded in what actually happened in the transcript; do not generalise into character traits.
4. \`hypothesized_misconceptions\` — only include when you are CONFIDENT (>0.6). Use \`snake_case\` concept_tags shaped like \`area.specific_error_pattern\` that name the specific error you observed. One-sentence description of the pattern, no judgment.
5. \`one_sentence_arc\` is the most important field. ≤140 chars. The TUTOR will read this first; it must convey what to pick up on.
6. Empty arrays are valid. Do NOT invent things to fill the JSON.

OUTPUT SCHEMA:

{
  "one_sentence_arc": string,
  "concepts_touched": string[],
  "high_points": string[],
  "low_points": string[],
  "hypothesized_misconceptions": [
    { "concept_tag": string, "description": string, "confidence": number }
  ],
  "open_questions": string[]
}`;

export type ReflectInput = {
  /** Conversation transcript, oldest-first. Already redacted of system
   *  control lines (the LB sentinel). Each turn is one line. */
  transcript: ReadonlyArray<{
    role: 'learner' | 'tutor';
    verdict?: 'correct' | 'partially_correct' | 'incorrect' | 'skipped' | null;
    item_topic?: string | null;
    content: string;
  }>;
  /** Optional total session duration in minutes. The reflective output
   *  doesn't use this directly but it's stored on learner_episodes. */
  durationMinutes: number;
};

export function buildReflectUserPrompt(input: ReflectInput): string {
  const lines: string[] = [];
  lines.push(`Session duration: ${input.durationMinutes} minutes`);
  lines.push(`Total turns: ${input.transcript.length}`);
  lines.push('');
  lines.push('TRANSCRIPT:');
  for (const t of input.transcript) {
    const topic = t.item_topic ? ` [topic: ${t.item_topic}]` : '';
    const verdict = t.verdict ? ` [verdict: ${t.verdict}]` : '';
    // Truncate long content to keep input compact. The whole point of
    // this summarization is to compress; don't waste tokens on verbose
    // transcripts.
    const content = t.content.length > 300 ? `${t.content.slice(0, 300)}…` : t.content;
    lines.push(`${t.role}${topic}${verdict}: ${content}`);
  }
  return lines.join('\n');
}
