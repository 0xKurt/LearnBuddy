// The questions of one material, as the library lists them: what the sheet asks and
// how her latest attempt went, never the solution. Everything that belongs to working on a
// question (choices to tap, the concept image, the bar, a structured task's parts, a recording,
// reading it aloud) stays with the session. Its own file so `service.ts` stays within its size
// (docs/engineering-guards.md, rule 4).

import type { Figure, ItemResult, MaterialItemsView } from '@learnbuddy/shared-types/contracts';

import type { Db } from '../../lib/db.js';
import { storedFigure } from '../practice/items.js';
import { materialView } from './service.js';

type MaterialItemRow = {
  id: string;
  kind: MaterialItemsView['items'][number]['kind'];
  prompt: string;
  choices: string[] | null;
  unit: string | null;
  topic: string | null;
  origin: MaterialItemsView['items'][number]['origin'];
  lang: string | null;
  prompt_lang: string | null;
  figure: Figure | null;
  last_status: 'correct' | 'revealed' | 'skipped' | 'missed' | null;
  last_first_try: boolean | null;
};

function resultOf(r: MaterialItemRow): ItemResult {
  if (r.last_status === null) return 'never_asked';
  if (r.last_status === 'correct') return r.last_first_try ? 'first_try' : 'with_help';
  return 'not_known';
}

/**
 * The learner's questions from one material, with how the latest attempt went.
 * Never the solution (answer, accepted answers, correct choice stay on the server).
 */
export async function materialItems(
  db: Db,
  learnerId: string,
  materialId: string,
): Promise<MaterialItemsView> {
  const material = await materialView(db, learnerId, materialId);
  const rows = await db.query<MaterialItemRow>(
    `select i.id, i.kind, i.prompt, i.choices, i.unit, i.topic, i.origin, i.lang, i.prompt_lang, i.figure,
            last.status as last_status, last.first_try_correct as last_first_try
       from items i
       left join lateral (
         select si.status, si.first_try_correct from session_items si
          where si.item_id = i.id and si.status <> 'open' and si.flagged_at is null
          order by si.closed_at desc nulls last limit 1) last on true
      where i.material_id = $1 and i.learner_id = $2 and i.archived_at is null
      order by i.seq`,
    [materialId, learnerId],
  );
  return {
    material,
    items: rows.map((r) => ({
      id: r.id,
      kind: r.kind,
      prompt: r.prompt,
      choices: r.choices,
      // The sheet lists its questions; tapping belongs to a session, where her own other
      // words are what the choices are made of (issue #147).
      tap_choices: null,
      unit: r.unit,
      topic: r.topic,
      origin: r.origin,
      lang: r.lang,
      prompt_lang: r.prompt_lang,
      figure: storedFigure(r.figure),
      // The concept image is shown where the question is shown full size (sessions);
      // the material list stays a list (issue #50).
      image: null,
      // Same for the fraction bar (issue #162): a surface is something she works WITH on
      // an open question, not a control in a list of what the sheet holds.
      surface: null,
      // And for a structured item's parts (issues #228–#230): the list says what the sheet
      // asks, and arranging it belongs to the session where the answer counts.
      task_view: null,
      // A sheet holds no listening question: a spoken text comes from a listening run, never
      // from a photo (issue #210, `practice/listen.ts`). Nothing to play here either way — the
      // recording belongs to a session, like the crop and the bar above.
      listen: null,
      // Reading a question aloud belongs to the session too (issue #238): the list says what
      // the sheet asks, and the rule that decides it needs the key this list never loads.
      read_aloud: false,
      result: resultOf(r),
    })),
  };
}
