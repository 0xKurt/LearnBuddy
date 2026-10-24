// Item persistence, shared by extraction and preparation. docs/architecture.md §Practice.
import { checkedPronunciationPlan, type VocabDirection } from '@learnbuddy/shared-types/contracts';
import type { Db } from '../../lib/db.js';
import type { ItemSource, StoredItem } from './items.js';
import { knownVocabulary, sameVocabulary } from './vocabulary.js';

export async function insertItems(
  db: Db,
  src: ItemSource,
  items: ReadonlyArray<StoredItem>,
  direction: VocabDirection | null = null,
  reuseVocabulary = false,
): Promise<string[]> {
  const ids: string[] = [];
  if (reuseVocabulary && items.some((it) => it.kind === 'vocab'))
    await db.query('select 1 from buddy_settings where learner_id = $1 for update', [
      src.learnerId,
    ]);
  const known = reuseVocabulary ? await knownVocabulary(db, src.learnerId) : [];
  const insert = async (it: StoredItem, asked = true) => {
    if (reuseVocabulary && it.kind === 'vocab') {
      const existing = known.find((row) => sameVocabulary(row, it))?.id;
      if (existing) {
        if (asked && !ids.includes(existing)) ids.push(existing);
        return;
      }
    }
    const row = await db.one<{ id: string }>(
      `insert into items (learner_id, material_id, subject_id, kind, prompt, answer, accepted_answers, unit,
                          choices, correct_choice, topic, difficulty, source_excerpt, origin, lang, prompt_lang, figure,
                          hints, worked_solution, tolerance, spelling, bar_task, task,
                          curriculum_point, rubric, listen_task, staff_task, choice_figures, read_passage, tap,
                          task_part, code_task, pronunciation_plan)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33) returning id`,
      [
        src.learnerId,
        src.materialId,
        src.subjectId,
        it.kind,
        it.prompt,
        it.answer,
        it.accepted_answers,
        it.unit,
        it.choices,
        it.correct_choice,
        it.topic,
        it.difficulty,
        it.source_excerpt,
        src.origin,
        it.lang,
        it.prompt_lang,
        it.figure ? JSON.stringify(it.figure) : null,
        it.hints,
        it.worked_solution,
        it.tolerance,
        it.spelling,
        it.bar_task ? JSON.stringify(it.bar_task) : null,
        it.task ? JSON.stringify(it.task) : null,
        it.curriculum_point,
        it.rubric ? JSON.stringify(it.rubric) : null,
        it.listen_task ? JSON.stringify(it.listen_task) : null,
        it.staff_task ? JSON.stringify(it.staff_task) : null,
        it.choice_figures ? JSON.stringify(it.choice_figures) : null,
        it.read_passage ? JSON.stringify(it.read_passage) : null,
        it.tap === true,
        it.task_part ? JSON.stringify(it.task_part) : null,
        it.code_task ? JSON.stringify(it.code_task) : null,
        it.kind === 'speak' && it.lang
          ? jsonPronunciationPlan(it.prompt, it.lang, it.confusions)
          : null,
      ],
    );
    if (reuseVocabulary && it.kind === 'vocab' && it.prompt_lang && it.lang)
      known.push({
        id: row.id,
        prompt: it.prompt,
        answer: it.answer,
        accepted_answers: it.accepted_answers,
        prompt_lang: it.prompt_lang,
        lang: it.lang,
      });
    if (asked) ids.push(row.id);
  };
  const pair = (it: StoredItem) => it.kind === 'vocab' && !!it.lang && !!it.prompt_lang;
  for (const it of items) await insert(it, !(pair(it) && direction === 'produce'));
  // The other direction of each pair comes after all first directions — asked right after
  // its twin, the answer would still be on screen. Generated reverse variants travel with
  // the pair; older extractions without them retain the existing tutor fallback.
  for (const it of items) {
    if (!pair(it)) continue;
    await insert(
      {
        ...it,
        prompt: it.answer,
        answer: it.prompt,
        accepted_answers: it.reverse_answers ?? [],
        prompt_lang: it.lang,
        lang: it.prompt_lang,
        // Hints were written for the first direction.
        hints: [],
        worked_solution: null,
      },
      direction !== 'recognise',
    );
  }
  return ids;
}

function jsonPronunciationPlan(prompt: string, lang: string, confusions: unknown): string | null {
  const plan = checkedPronunciationPlan(prompt, lang, confusions);
  return plan ? JSON.stringify(plan) : null;
}
