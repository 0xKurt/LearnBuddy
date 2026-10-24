// The solution boundary shared by chat, prepared hints and practice replies (#918).
import type { ItemRow } from './service.js';
import { secretsOf, structuredTaskOf } from './structured.js';

export type SecretItem = Pick<
  ItemRow,
  'kind' | 'prompt' | 'answer' | 'accepted_answers' | 'unit' | 'choices' | 'correct_choice' | 'task'
>;

/** Everything a reply must keep back, and the context the learner can already see. */
export function secretsFor(item: SecretItem): { secrets: string[]; visible: string } {
  const task = structuredTaskOf(item.task, item.kind);
  if (task) return secretsOf(task, item.prompt);
  return {
    secrets: [...new Set([shownSolution(item), item.answer, ...item.accepted_answers])],
    visible: item.prompt,
  };
}

/** The solution as the learner sees it. */
export function shownSolution(
  i: Pick<ItemRow, 'kind' | 'answer' | 'choices' | 'correct_choice' | 'unit'>,
): string {
  if (i.kind === 'multiple_choice' && i.choices && i.correct_choice !== null) {
    return i.choices[i.correct_choice] ?? i.answer;
  }
  return `${i.answer}${i.unit ? ` ${i.unit}` : ''}`;
}
