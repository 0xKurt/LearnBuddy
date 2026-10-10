// What every Informatik question shares (issue #262, docs/architecture.md §Informatik): its texts,
// the fields none of which is the model's, and why a task gives no question. The programs are
// built in `code.ts`, the SQL queries in `codeSql.ts`, her answers checked in `codeCheck.ts`.

import type { CodeTask, Figure } from '@learnbuddy/shared-types/contracts';

import { t, type MessageKey } from '../../i18n/index.js';
import type { ItemDraft } from './items.js';

/** A question whose fields were computed from `code_task`; `insertItems` stores both. */
export type CodeItem = Omit<ItemDraft, 'figure'> & {
  figure: Figure | null;
  code_task: CodeTask;
};

/** The suffixes `practice.code.*` really has, so a typo here fails the typecheck. */
type SuffixOf<T> = T extends `practice.code.${infer S}` ? S : never;
export type CodeMessage = SuffixOf<MessageKey>;

export function codeText(
  locale: string,
  suffix: CodeMessage,
  vars: Record<string, string | number> = {},
): string {
  return t(locale, `practice.code.${suffix}`, vars);
}

/** Why a task gives no question. Each one is a test (`code.test.ts`). */
type CodeReject =
  | 'display'
  | 'did_not_run'
  | 'ran_too_long'
  | 'output_unusable'
  | 'output_disagrees'
  | 'no_error'
  | 'not_a_runtime_error'
  | 'line_disagrees'
  | 'bad_signature'
  | 'bad_test'
  | 'expected_disagrees'
  | 'tests_not_distinct'
  | 'bad_table'
  | 'not_a_query'
  | 'result_unusable'
  | 'result_disagrees';

export type Built = { item: CodeItem } | { reject: CodeReject };

/** The fields every Informatik question shares: none of the model's own. */
export const CODE_COMMON = {
  accepted_answers: [] as string[],
  unit: null,
  choices: null,
  correct_choice: null,
  prompt_lang: null,
  lang: null,
  tolerance: null,
  spelling: null,
  source_excerpt: null,
  read: null,
  // A program has one value against one key — no chart, no curriculum place of the twelve (#214),
  // no writing task with required elements (#211), nothing heard (#210).
  curriculum_point: null,
  rubric: null,
} as const;
