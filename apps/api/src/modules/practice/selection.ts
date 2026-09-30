// Chooses the questions for a practice set. Deterministic, shared by Buddy's
// prepare_practice tool, its fallbacks, and manual practice from the library.
//
// Order: questions due for review (FSRS) → never practised → the rest by due
// date. Focus topics narrow the pool when they match enough questions.
//
// Three things the learner can ask for narrow it further (issue #113). The model sets them
// as tool arguments, the code decides what they mean — never a word list:
//   only wrong  — only questions whose last try needed help or was not known, never one that
//                 has not been asked yet. Read off the last attempt (`session_items`), the
//                 same place `find_questions` reports from, so what Buddy says about a
//                 question and what he selects agree — and so a practice test counts, which
//                 feeds no FSRS state at all;
//   difficulty  — the easier or the harder half of her own material for this scope,
//                 measured against the median of `items.difficulty` in that very pool;
//   direction   — one direction of a vocabulary pair, read off her own app language.
// A wish that matches only three questions gives three; one that matches none gives none. The
// set is never quietly filled up with questions she did not ask for (CLAUDE.md rule 5 — the
// card would then claim to be what it is not), and the caller says plainly when nothing fits.

import type { DifficultyWish, VocabDirection } from '@learnbuddy/shared-types/contracts';

import type { Db } from '../../lib/db.js';

export type PracticeScope = {
  goalId?: string | null;
  subjectId?: string | null;
  materialId?: string | null;
};

export type PracticeWish = {
  /** Only what did not sit the last time it was asked. */
  onlyWrong?: boolean;
  difficulty?: DifficultyWish | null;
  /** Vocabulary only; needs `ownLanguage` to tell the two sides apart. */
  direction?: VocabDirection | null;
  /**
   * Only vocabulary, without asking for a direction (issue #144). "Frag mich die Vokabeln
   * ab" used to reach the pool as nothing but the subject, so a second sheet of the same
   * subject — a page about giving directions next to a word list — was practised instead.
   */
  vocabularyOnly?: boolean;
  /** The learner's app language (ISO 639-1), for the direction. */
  ownLanguage?: string | null;
};

export const QUESTIONS_PER_MINUTE = 1.2;

/**
 * How many questions a set holds: a number, or everything there is (issues #145, #49).
 *
 * There is no ceiling on "all". I first put one at 60 and the owner was having none of it:
 * "wenn mein kind scheiss 50 vokabeln lernen muss, dann muss sie die scheiss 50 vokabeln
 * lernen … das kunstlich deckeln ist der falsche weg" (30.09.). He is right — a number I
 * invent is a decision about her homework that I have no standing to make, and it is
 * exactly the kind of silent cut that made #49.
 *
 * The 15 in `questionCountFor` stays, because it is not a cap on her material: it bounds
 * what a MINUTE ESTIMATE may produce, and that estimate is a guess about how long she wants
 * to sit, made when she said nothing about the size at all.
 */
export type HowMany = number | 'all';

export function questionCountFor(minutes: number): number {
  return Math.min(15, Math.max(3, Math.round(minutes * QUESTIONS_PER_MINUTE)));
}

type Candidate = { id: string; topic: string | null; due: Date | null };

export async function selectPracticeItems(
  db: Db,
  learnerId: string,
  scope: PracticeScope,
  focusTopics: string[],
  count: HowMany,
  now: Date,
  wish: PracticeWish = {},
): Promise<string[]> {
  // For a goal: its own material first; if it has none yet, its subject.
  let goalMaterialsOnly = false;
  let subjectId = scope.subjectId ?? null;
  if (scope.goalId) {
    const g = await db.maybeOne<{ subject_id: string | null; has_material: boolean }>(
      `select g.subject_id,
              exists (select 1 from items i join materials m on m.id = i.material_id
                       where m.goal_id = g.id and i.archived_at is null) as has_material
         from buddy_goals g where g.id = $1 and g.learner_id = $2`,
      [scope.goalId, learnerId],
    );
    if (!g) return [];
    goalMaterialsOnly = g.has_material;
    subjectId = subjectId ?? g.subject_id;
  }

  const candidates = await db.query<Candidate>(
    // The wishes narrow the pool before the limit, so nothing she asked for is cut off by
    // 200 rows of something else; the difficulty is measured on what is left (its median).
    `with pool as (
       select i.id, i.topic, i.difficulty, i.created_at, st.due, st.item_id as reviewed
         from items i
         left join materials m on m.id = i.material_id
         left join item_states st on st.item_id = i.id
         left join lateral (
           select si.status, si.first_try_correct from session_items si
            where $6::boolean and si.item_id = i.id and si.status <> 'open' and si.flagged_at is null
            order by si.closed_at desc nulls last limit 1) last on true
        where i.learner_id = $1 and i.archived_at is null and (m.id is null or m.archived_at is null)
          -- Homework is helped with, not drilled; speaking needs a quiet moment the learner chooses.
          and i.origin <> 'homework' and i.kind <> 'speak'
          and ($2::uuid is null or m.goal_id = $2)
          and ($3::uuid is null or i.subject_id = $3)
          and ($4::uuid is null or i.material_id = $4)
          -- Only what did not sit the last time it was asked: right on the first try is not it,
          -- and one never asked is not one she got wrong. The wish stands in the lateral itself,
          -- so the last attempt is only looked up when she asked for this.
          and (not $6::boolean
               or (last.status is not null
                   and not (last.status = 'correct' and coalesce(last.first_try_correct, false))))
          -- Vocabulary and nothing else, whichever side is asked (issue #144).
          and (not $10::boolean or i.kind = 'vocab')
          -- One direction of a vocabulary pair; her own language says which side is foreign.
          and ($7::text is null
               or (i.kind = 'vocab'
                   and (($7 = 'produce' and i.lang is distinct from $8::text)
                        or ($7 = 'recognise' and i.prompt_lang is distinct from $8::text))))
     ), middle as (
       select percentile_cont(0.5) within group (order by difficulty::double precision) as mid
         from pool
     )
     select p.id, p.topic, p.due
       from pool p, middle
      where $9::text is null
         or ($9 = 'easier' and p.difficulty < middle.mid)
         or ($9 = 'harder' and p.difficulty > middle.mid)
      order by
        case when p.due is not null and p.due <= $5 then 0
             when p.reviewed is null then 1
             else 2 end,
        p.due nulls last,
        p.created_at, p.id
      -- No fixed ceiling: a word list with fifty words is fifty questions (#145). The
      -- limit follows what was asked for, with room above it so a focus topic still has
      -- something to sort; "all" takes the lot.
      -- NULL is no limit in Postgres; the cast is what makes the driver send it as one.
      limit $11::bigint`,
    [
      learnerId,
      goalMaterialsOnly ? scope.goalId : null,
      goalMaterialsOnly ? null : subjectId,
      scope.materialId ?? null,
      now,
      wish.onlyWrong === true,
      wish.direction ?? null,
      wish.ownLanguage ?? null,
      wish.difficulty ?? null,
      wish.vocabularyOnly === true,
      count === 'all' ? null : Math.max(200, count),
    ],
  );
  if (candidates.length === 0) return [];

  const wanted = focusTopics.map((t) => t.toLowerCase().trim()).filter(Boolean);
  let pool = candidates;
  if (wanted.length > 0) {
    const focused = candidates.filter((c) => {
      const topic = (c.topic ?? '').toLowerCase();
      return topic !== '' && wanted.some((w) => topic.includes(w) || w.includes(topic));
    });
    // Only narrow when the focus actually matches a meaningful set.
    if (focused.length >= (count === 'all' ? 3 : Math.min(3, count))) {
      const rest = candidates.filter((c) => !focused.includes(c));
      pool = [...focused, ...rest];
    }
  }
  return (count === 'all' ? pool : pool.slice(0, count)).map((c) => c.id);
}
