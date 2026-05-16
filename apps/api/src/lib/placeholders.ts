// TEMPORARY — placeholder item generator. Doc 06 §P1 (real Vertex vision
// extraction lands in Slice D1). Slice C2 ships these three short-answer
// items so the mobile material screen has real DB rows to render against
// the same `items` table the LLM pipeline will write to.
//
// This function is the *only* place in the production path where the API
// invents content; the rest of the codebase honors CLAUDE.md §rule #5
// ("no hardcoded demo data in production code paths"). Slice D1 deletes
// this file and its single caller in routes/materials.ts.

export type PlaceholderItem = {
  material_id: string;
  learner_id: string;
  question: string;
  expected_answer: string;
  acceptable_answers: string[];
  answer_kind: 'short';
  difficulty: number;
  topic: string | null;
  language: string;
  source_excerpt: string | null;
  generated_by_model: string;
  generated_by_prompt_version: string;
  stimulus_kind: 'none';
  stimulus_data: Record<string, never>;
};

export function generatePlaceholderItems(
  material_id: string,
  learner_id: string,
  locale: string,
): PlaceholderItem[] {
  const base = {
    material_id,
    learner_id,
    acceptable_answers: [],
    answer_kind: 'short' as const,
    difficulty: 2,
    topic: null,
    language: locale,
    source_excerpt: null,
    generated_by_model: 'placeholder-C2',
    generated_by_prompt_version: 'placeholder-C2',
    stimulus_kind: 'none' as const,
    stimulus_data: {} as Record<string, never>,
  };
  return [
    {
      ...base,
      question: 'Wir bereiten dein Material vor.',
      expected_answer: 'OK',
    },
    {
      ...base,
      question: 'Echte Fragen erscheinen, sobald die Auswertung läuft.',
      expected_answer: 'OK',
    },
    {
      ...base,
      question: 'Bis dahin sieht dieser Platzhalter aus wie eine echte Aufgabe.',
      expected_answer: 'OK',
    },
  ];
}
