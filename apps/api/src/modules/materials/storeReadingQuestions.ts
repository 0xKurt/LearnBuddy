// The same subject assignment and item storage for a finished reading and its validated prefixes.
// docs/architecture.md §Material.
import type { z } from 'zod';

import type { Db } from '../../lib/db.js';
import { findOrCreateSubject } from '../learning/state.js';
import { insertItems, samePrompt, type StoredItem } from '../practice/items.js';
import { wholeTasks } from './partTasks.js';
import type { ReadingParse } from './sources.js';
import type { MaterialRow } from './view.js';

export async function storeReadingQuestions(
  tx: Db,
  home: MaterialRow,
  x: z.infer<typeof ReadingParse>,
  items: StoredItem[],
  deduplicate: boolean,
): Promise<{ subjectId: string | null; itemIds: string[] }> {
  const known = deduplicate
    ? await tx.query<{ prompt: string }>(
        `select prompt from items where material_id = $1 and learner_id = $2`,
        [home.id, home.learner_id],
      )
    : [];
  const seen = new Set(known.map((it) => samePrompt(it.prompt)));
  const fresh = wholeTasks(items.filter((it) => !seen.has(samePrompt(it.prompt))));
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
