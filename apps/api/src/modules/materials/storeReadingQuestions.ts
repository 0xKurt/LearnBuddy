// The same subject assignment and item storage for a finished reading and its validated prefixes.
// docs/architecture.md §Material.
import { createHash } from 'node:crypto';
import type { z } from 'zod';

import type { Db } from '../../lib/db.js';
import { stableJson } from '../../lib/stableJson.js';
import { findOrCreateSubject } from '../learning/state.js';
import { insertItems, type StoredItem } from '../practice/items.js';
import { wholeTasks } from './partTasks.js';
import type { ReadingParse } from './sources.js';
import type { MaterialRow } from './view.js';

/** Content that defines the question and its key, excluding hints and classification metadata. */
function questionHash(it: StoredItem): string {
  const fields = [
    'kind',
    'prompt',
    'answer',
    'accepted_answers',
    'unit',
    'choices',
    'correct_choice',
    'lang',
    'prompt_lang',
    'figure',
    'choice_figures',
    'tolerance',
    'spelling',
    'rubric',
    'task',
    'read_passage',
    'listen_task',
    'bar_task',
    'staff_task',
    'code_task',
  ] as const;
  const part = it.task_part;
  return createHash('sha256')
    .update(
      stableJson([
        ...fields.map((key) => it[key] ?? null),
        it.tap === true,
        // Group UUIDs are assigned afresh on every validation, including cumulative prefixes.
        part ? { part: part.part, of: part.of, stem: part.stem, from: part.from } : null,
      ]),
    )
    .digest('hex');
}

/**
 * Cumulative prefixes use their parsed positions, including repeated identical questions.
 * Match one stored row to one position by content, so a retry may reorder the same questions.
 */
function unstoredPositions(items: StoredItem[], known: StoredItem[]): StoredItem[] {
  const positions = new Map<string, number[]>();
  items.forEach((it, index) => {
    const hash = questionHash(it);
    positions.set(hash, [...(positions.get(hash) ?? []), index]);
  });
  const stored = new Set<number>();
  for (const it of known) {
    const index = positions.get(questionHash(it))?.shift();
    if (index !== undefined) stored.add(index);
  }
  return items.filter((_, index) => !stored.has(index));
}

export async function storeReadingQuestions(
  tx: Db,
  home: MaterialRow,
  x: z.infer<typeof ReadingParse>,
  items: StoredItem[],
  deduplicate: boolean,
): Promise<{ subjectId: string | null; itemIds: string[] }> {
  const known = deduplicate
    ? await tx.query<StoredItem>(`select * from items where material_id = $1 and learner_id = $2`, [
        home.id,
        home.learner_id,
      ])
    : [];
  const fresh = wholeTasks(unstoredPositions(items, known));
  let subjectId = home.subject_id;
  if (!subjectId && x.subject) {
    subjectId = (await findOrCreateSubject(tx, home.learner_id, x.subject.name, x.subject.kind)).id;
  }
  // A second subject on the sheet: its questions go there (found by their topics).
  const second =
    x.other_subject && x.other_subject.topics.length
      ? await findOrCreateSubject(tx, home.learner_id, x.other_subject.name, x.other_subject.kind)
      : null;
  const secondTopics = new Set((x.other_subject?.topics ?? []).map((t) => t.trim().toLowerCase()));
  const homework = home.purpose === 'homework';
  const bySubject = new Map<string | null, typeof items>();
  for (const item of fresh) {
    const own =
      second && second.id !== subjectId && secondTopics.has((item.topic ?? '').trim().toLowerCase())
        ? second.id
        : subjectId;
    bySubject.set(own, [...(bySubject.get(own) ?? []), item]);
  }
  const itemIds: string[] = [];
  for (const [sid, group] of bySubject) {
    itemIds.push(
      ...(await insertItems(
        tx,
        {
          learnerId: home.learner_id,
          materialId: home.id,
          subjectId: sid,
          origin: homework ? 'homework' : 'material',
        },
        group,
      )),
    );
  }
  return { subjectId, itemIds };
}
