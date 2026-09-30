import { writeFileSync } from 'node:fs';
import {
  ExtractionParse,
  ExtractionResult,
} from '/Users/kurt/git/LearnBuddy/apps/api/src/modules/materials/extract.ts';
import { summarize } from '/Users/kurt/git/LearnBuddy/apps/api/src/modules/practice/summary.ts';
import { ruleCheck } from '/Users/kurt/git/LearnBuddy/apps/api/src/modules/practice/evaluate.ts';

const pairs = Array.from({ length: 50 }, (_, i) => ({
  kind: 'vocab',
  prompt: `word ${i + 1}`,
  answer: `Wort ${i + 1}`,
  accepted_answers: [],
  unit: null,
  choices: null,
  correct_choice: null,
  topic: 'Liste',
  difficulty: 2,
  prompt_lang: 'en',
  lang: 'de',
  source_excerpt: null,
}));
const raw = {
  is_learning_material: true,
  readable: true,
  pages: [{ page: 1, read: 'all', problem: null }],
  title: '50 Wortpaare',
  subject: null,
  extracted_text: 'Synthetic list of fifty pairs, all readable.',
  items: pairs,
  other_subject: null,
};
const parsed = ExtractionParse.safeParse(raw);
const summary = summarize([{ topic: 'Brüche', status: 'correct', first_try_correct: true }]);
const wrongKey = {
  kind: 'numeric' as const,
  answer: '8',
  accepted_answers: [],
  unit: null,
  choices: null,
  correct_choice: null,
  tolerance: null,
  spelling: null,
  subject_kind: 'math',
};
const result = {
  extraction: {
    supplied_pairs: pairs.length,
    model_schema_accepts_fifty: ExtractionResult.safeParse(raw).success,
    parser_success: parsed.success,
    retained_pairs: parsed.success ? parsed.data.items.length : null,
    page_report: parsed.success ? parsed.data.pages : null,
  },
  one_correct_question: summary,
  unverified_solution_key: {
    task: '6 + 4',
    supplied_key: '8',
    mathematically_correct_student_answer: '10',
    rule_verdict: ruleCheck(wrongKey, { text: '10', choice: null }),
  },
};
writeFileSync(
  '/private/tmp/learnbuddy-learning-repro-results.json',
  JSON.stringify(result, null, 2),
);
console.log(JSON.stringify(result, null, 2));
