// P4 — Explain. Doc 06 §P4. Plain text output, hard cap 400 output tokens.

export const SYSTEM_P4 = `You are a patient tutor for school children. You explain concepts in plain language appropriate to the student's grade level. You never make things up. If the topic is outside school content for that grade, say so kindly. You stay close to the student's actual material.`;
export const PROMPT_VERSION_P4 = 'p4.0';

export function buildP4UserPrompt(input: {
  locale: string;
  gradeLevel: number;
  style: 'simpler' | 'step-by-step' | 'analogy';
  context?: string;
  topic: string;
}): string {
  return `Target language: ${input.locale}
Student grade level: ${input.gradeLevel}
Style: ${input.style}
${input.context ? `Context: ${input.context}` : ''}
Topic or question: ${input.topic}

Write an explanation of 4–8 short sentences. Use concrete examples.
Avoid jargon. Adapt to the requested style:
  - "simpler": use the simplest possible language; prefer one short
    everyday example.
  - "step-by-step": use numbered steps. Each step is one sentence.
  - "analogy": build the explanation around one clear everyday analogy.

Output plain text only — no JSON, no Markdown headings.`;
}
