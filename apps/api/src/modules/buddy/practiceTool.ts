// prepare_practice: the questions for a run Buddy plans, chosen by code from her own material.
// Split from tools.ts (#311); the rules every tool keeps are written there.

import { t } from '../../i18n/index.js';
import {
  type HowMany,
  minutesFor,
  type PracticeWish,
  questionCountFor,
  selectPracticeItems,
} from '../practice/selection.js';
import type { ActionOf } from './decision.js';
import {
  activeGoalOf,
  materialOf,
  subjectOf,
  today,
  type ToolContext,
  type ToolOutcome,
  ToolRejection,
} from './toolKit.js';

/**
 * She has questions for this, but none that fit what she asked for (issue #113). The reason
 * says which wish found nothing, so Buddy can say it plainly instead of quietly practising
 * something else — and name the way out (new questions are written, not selected).
 */
function noneFit(wish: PracticeWish): string {
  if (wish.onlyWrong) {
    return 'none of her questions for this went wrong the last time — say so plainly (it is good news) and offer ordinary practice instead (prepare_practice without only_wrong)';
  }
  if (wish.difficulty) {
    return `her own questions for this have no ${wish.difficulty} half — say so and offer to write new ones at that level (offer_learning with difficulty)`;
  }
  if (wish.direction) {
    return 'she has no vocabulary for this in that direction — say so and offer to write it (offer_learning) or ask for a photo of the list (request_material)';
  }
  // Issue #144: she asked for vocabulary in a subject whose sheets are about other things.
  return 'there is no vocabulary here — say plainly that this sheet (or this subject) holds no word list, and offer to ask for a photo of one (request_material) or to write vocabulary with her (offer_learning). Never practise the other questions instead';
}

/**
 * What she is working on, kept as state (issue #160).
 *
 * Written from what a tool was actually TOLD, not from what the model says afterwards: if
 * `prepare_practice` ran with this sheet and this direction, that is what she is working on,
 * and there is nothing to interpret. The sheet comes from her own aliases, so no id is ever
 * written by the model (hard rule 2).
 *
 * `said` is her own words for it, taken from the quote the tool already carries — the line
 * above the conversation should read like her, not like a row.
 */
async function rememberFocus(
  ctx: ToolContext,
  focus: {
    materialId: string | null;
    subjectId: string | null;
    goalId: string | null;
    vocabularyOnly: boolean;
    direction: 'recognise' | 'produce' | null;
    said: string | null;
  },
): Promise<void> {
  await ctx.db.query(
    `insert into buddy_focus (learner_id, material_id, subject_id, goal_id, vocabulary_only,
                              direction, said, updated_at)
     values ($1, $2, $3, $4, $5, $6, $7, $8)
     on conflict (learner_id) do update
       set material_id = excluded.material_id,
           subject_id = excluded.subject_id,
           goal_id = excluded.goal_id,
           vocabulary_only = excluded.vocabulary_only,
           direction = excluded.direction,
           -- Her words only change when there are new ones; a tool run without a quote
           -- must not blank the line she is looking at.
           said = coalesce(excluded.said, buddy_focus.said),
           version = buddy_focus.version + 1,
           updated_at = excluded.updated_at`,
    [
      ctx.learnerId,
      focus.materialId,
      focus.subjectId,
      focus.goalId,
      focus.vocabularyOnly,
      focus.direction,
      focus.said?.slice(0, 200) ?? null,
      ctx.now,
    ],
  );
}

export async function runPreparePractice(
  action: ActionOf<'prepare_practice'>,
  ctx: ToolContext,
): Promise<ToolOutcome> {
  const a = action.args;
  const goal = await activeGoalOf(ctx, a.goal);
  const subjectId = subjectOf(ctx, a.subject);
  // What she said beats what the minutes guess (issue #145): a named number, or all there
  // is, with no ceiling of my invention on top — "wenn mein kind scheiss 50 vokabeln lernen
  // muss, dann muss sie die scheiss 50 vokabeln lernen" (owner, 30.09.). The minutes are
  // the fallback for when she said nothing about the size at all.
  const count: HowMany =
    a.all_of_them === true ? 'all' : (a.question_count ?? questionCountFor(a.minutes));
  // The one sheet she pointed at (issue #144). Resolved from her own aliases, so a sheet
  // that is not hers cannot be reached by guessing an id (hard rule 2).
  const material = a.sheet ? materialOf(ctx, a.sheet) : null;
  // What she is working on, when this answer says nothing about it (issue #160). "Weiter"
  // after a pause is the whole point: the scope she agreed to is still the scope, and it
  // does not have to be read back out of the chat. Anything she DOES name wins — naming a
  // sheet or a subject is how she changes it.
  const kept =
    !material && !subjectId && !goal
      ? await ctx.db.maybeOne<{
          material_id: string | null;
          subject_id: string | null;
          goal_id: string | null;
          vocabulary_only: boolean;
          direction: 'recognise' | 'produce' | null;
        }>(
          `select f.material_id, f.subject_id, f.goal_id, f.vocabulary_only, f.direction
             from buddy_focus f
             left join materials m on m.id = f.material_id
             left join buddy_goals g on g.id = f.goal_id
            where f.learner_id = $1
              -- A sheet she deleted or a goal she closed is no scope to carry on with.
              and (f.material_id is null or m.archived_at is null)
              and (f.goal_id is null or g.status = 'active')`,
          [ctx.learnerId],
        )
      : null;
  const scope = {
    goalId: goal?.id ?? kept?.goal_id ?? null,
    subjectId: subjectId ?? kept?.subject_id ?? null,
    materialId: material?.id ?? kept?.material_id ?? null,
  };
  // What she asked for beyond the topic (issue #113). Code decides what it means; the set is
  // never filled up with questions she did not ask for.
  const wish: PracticeWish = {
    onlyWrong: a.only_wrong === true,
    difficulty: a.difficulty ?? null,
    direction: a.direction ?? kept?.direction ?? null,
    // A direction already means vocabulary; asking for vocabulary without one is the case
    // that used to fall through to the whole subject (issue #144).
    vocabularyOnly: a.vocabulary_only === true || (kept?.vocabulary_only ?? false),
    ownLanguage: ctx.locale,
  };
  const narrowed =
    wish.onlyWrong === true ||
    wish.difficulty !== null ||
    wish.direction !== null ||
    wish.vocabularyOnly === true ||
    material !== null;
  const itemIds = await selectPracticeItems(
    ctx.db,
    ctx.learnerId,
    scope,
    a.focus_topics,
    count,
    ctx.now,
    wish,
  );
  // One rule for all three wishes: what fits is prepared, however few — a short set she asked
  // for beats a full one she did not (the selection already hands back fewer than `count` when
  // she simply has fewer questions). Only when nothing at all fits does Buddy have to say so.
  if (itemIds.length === 0) {
    if (narrowed) {
      // Is there anything at all here, or only nothing that fits what she asked for? The
      // answer decides what Buddy can honestly offer instead.
      const anything = await selectPracticeItems(
        ctx.db,
        ctx.learnerId,
        scope,
        a.focus_topics,
        count,
        ctx.now,
      );
      if (anything.length > 0) throw new ToolRejection(noneFit(wish));
    }
    throw new ToolRejection(
      'there are no questions for this yet — ask for a photo of the material (request_material) instead',
    );
  }
  // A background check never replaces practice she asked for in the chat (audit M-55): the
  // card she expects stays.
  if (ctx.mode === 'check') {
    const hers = await ctx.db.maybeOne(
      `select 1 from buddy_steps st
        where st.learner_id = $1 and st.kind = 'practice' and st.state = 'prepared'
          and st.goal_id is not distinct from $2 and (st.payload ->> 'subject_id') is not distinct from $3
          and exists (select 1 from buddy_actions a join buddy_decisions d on d.id = a.decision_id
                       where a.learner_id = $1 and d.mode = 'turn' and a.status = 'applied'
                         and a.tool = 'prepare_practice' and a.result ->> 'step_id' = st.id::text)`,
      [ctx.learnerId, goal?.id ?? null, subjectId],
    );
    if (hers) {
      throw new ToolRejection(
        'the learner already has practice she asked for prepared for this; leave it (no prepare_practice)',
      );
    }
  }
  // A newer preparation replaces an unstarted older one for the same scope — never one she
  // agreed to (its reminder prepared it; p2-prepare-practice-cancels-reminder-prepared-step).
  await ctx.db.query(
    `update buddy_steps set state = 'cancelled', version = version + 1, finished_at = $4
      where learner_id = $1 and kind = 'practice' and state = 'prepared' and not agreed
        and goal_id is not distinct from $2 and (payload ->> 'subject_id') is not distinct from $3`,
    [ctx.learnerId, goal?.id ?? null, subjectId, ctx.now],
  );
  const minutes = minutesFor(itemIds.length);
  const title = goal
    ? goal.title
    : subjectId
      ? [...ctx.aliases.subjects.values()].find((s) => s.id === subjectId)!.name
      : t(ctx.locale, 'practice.untitled');
  const step = await ctx.db.one<{ id: string }>(
    `insert into buddy_steps (learner_id, goal_id, kind, title, state, planned_date, payload, prepared_at)
     values ($1, $2, 'practice', $3, 'prepared', $4, $5, $6) returning id`,
    [
      ctx.learnerId,
      goal?.id ?? null,
      title,
      today(ctx),
      {
        item_ids: itemIds,
        est_minutes: minutes,
        focus_topics: a.focus_topics,
        subject_id: subjectId,
        // What she asked for, kept with the set it produced (issue #113).
        only_wrong: wish.onlyWrong,
        difficulty: wish.difficulty,
        direction: wish.direction,
      },
      ctx.now,
    ],
  );
  ctx.created.stepId = step.id;
  // The answer's one thing to tap (issue #196): an offer beside it would be a second button
  // for the same wish.
  ctx.created.preparedStepId = step.id;
  // What she is working on now (issue #160): written from what this tool was told, so the
  // next turn does not have to read it back out of the chat — which is where it went wrong.
  await rememberFocus(ctx, {
    materialId: scope.materialId,
    subjectId: scope.subjectId,
    goalId: scope.goalId,
    vocabularyOnly: wish.vocabularyOnly === true,
    direction: wish.direction ?? null,
    said: ctx.learnerWords?.at(-1) ?? null,
  });
  return {
    summary: {
      tool: 'prepare_practice',
      step_id: step.id,
      title,
      question_count: itemIds.length,
      est_minutes: minutes,
    },
    undo: { type: 'cancel_step', step_id: step.id },
  };
}
