// P2 — Regenerate from cached text. Doc 06 §P2.

import { SYSTEM_P1 } from './p1.js';

export const SYSTEM_P2 = SYSTEM_P1;
export const PROMPT_VERSION_P2 = 'p2.0';

const STYLE_HINTS: Record<string, string> = {
  simpler:
    'Keep wording short. Prefer factual recall over application. Adjust to a student one grade below {gradeLevel}.',
  harder:
    'Include 2–3 transfer or application questions. Use precise terminology where the source allows.',
  'more-variety':
    'Mix answer kinds: include at least one multiple_choice, one numeric (if applicable), and one long explanation.',
};

export function buildP2UserPrompt(input: {
  locale: string;
  gradeLevel: number;
  subject: string;
  subjectKind: string;
  style: 'simpler' | 'harder' | 'more-variety' | null;
  extractedMarkdown: string;
  existingQuestionStems: string[];
}): string {
  const styleHint = input.style
    ? (STYLE_HINTS[input.style]?.replace('{gradeLevel}', String(input.gradeLevel)) ?? '')
    : '';
  const existing = input.existingQuestionStems.map((s, i) => `${i + 1}. ${s}`).join('\n');
  return `Target language: ${input.locale}
Student grade level: ${input.gradeLevel}
Subject: ${input.subject}
Subject kind: ${input.subjectKind}
Style: ${input.style ?? 'null'}

You are given previously extracted learning material text and the list
of already-existing question stems. Generate as many ADDITIONAL items as
the material supports without duplicating the existing ones.

${styleHint}

EXTRACTED MATERIAL:
${input.extractedMarkdown}

EXISTING QUESTIONS (do not duplicate):
${existing}

Apply all rules from the regular item-generation task. Items should have:
question, expected_answer, acceptable_answers, answer_kind, difficulty,
topic, language, source_excerpt, and the kind-specific fields.

OUTPUT FORMAT
Return strictly valid JSON:
{
  "items": [ /* item objects */ ],
  "problem_templates": [ /* new templates only — must not duplicate existing */ ]
}`;
}
