// Material tools: a photo asked for, a sheet or a question deleted (with her confirmation) or renamed.
// Split from tools.ts (#311); the rules every tool keeps are written there.

import type { ActionOf } from './decision.js';
import { bumpContext } from './plan.js';
import { normalizeForMatch } from './text.js';
import {
  activeGoalOf,
  materialOf,
  requireQuote,
  today,
  type ToolContext,
  type ToolOutcome,
  ToolRejection,
} from './toolKit.js';

export async function runRequestMaterial(
  action: ActionOf<'request_material'>,
  ctx: ToolContext,
): Promise<ToolOutcome> {
  const a = action.args;
  const goal = await activeGoalOf(ctx, a.goal);
  // The forgotten back belongs to the sheet it was forgotten from (issue #118): without this
  // the page becomes a second sheet, and her questions end up split over two.
  const completes = a.material ? materialOf(ctx, a.material) : null;
  if (completes?.status === 'failed') {
    throw new ToolRejection(
      `sheet ${a.material} could not be read, so a page cannot join it — she photographs it anew`,
    );
  }
  const open = await ctx.db.maybeOne<{
    id: string;
    title: string;
    payload: { completes?: string };
  }>(
    `select id, title, payload from buddy_steps
      where learner_id = $1 and kind = 'capture' and state = 'planned' and goal_id is not distinct from $2
        and payload->>'completes' is not distinct from $3
      limit 1`,
    [ctx.learnerId, goal?.id ?? null, completes?.id ?? null],
  );
  if (open) {
    return {
      summary: {
        tool: 'request_material',
        step_id: open.id,
        title: open.title,
        material_id: open.payload.completes ?? null,
      },
      undo: null,
    };
  }
  const step = await ctx.db.one<{ id: string }>(
    `insert into buddy_steps (learner_id, goal_id, kind, title, state, planned_date, payload)
     values ($1, $2, 'capture', $3, 'planned', $4, $5) returning id`,
    [
      ctx.learnerId,
      goal?.id ?? null,
      a.title,
      today(ctx),
      completes ? { completes: completes.id } : {},
    ],
  );
  return {
    summary: {
      tool: 'request_material',
      step_id: step.id,
      title: a.title,
      material_id: completes?.id ?? null,
    },
    undo: { type: 'cancel_step', step_id: step.id },
  };
}

/**
 * What cannot be taken back takes two turns: Buddy asks in one answer, and only her yes in the
 * next carries the deed. The tools of a decision run before its own row is written, so the
 * newest row is the answer before this one.
 *
 * In code and not in the prompt, because the prompt did not hold it: the live run of buddy.33
 * had the model delete a whole vocabulary sheet on "mit der Vokabelliste bin ich durch" — a
 * sentence that ends a session, not a sheet (issues #111, #120). This is the library's confirm
 * sheet, in the conversation (docs/UX-PRINCIPLES.md §18).
 */
/**
 * How long a proposal to delete something waits for her answer (issue #151). Long enough to
 * read the card and think; short enough that a "Löschen" tapped next week is not answering
 * a question she no longer remembers being asked.
 */
const CONFIRM_WINDOW_MINUTES = 60;

/**
 * The model may only ever PROPOSE a deletion; her tap is the consent (issue #151, external
 * audit F6). What stood here before read one bit of the last applied decision
 * (`output->>'asks_permission'`) and failed in both directions: after a lookup the bit sits
 * nested and a correct "ja, lösch das" was refused, and the bit said only that SOMETHING was
 * asked — an unrelated question authorised the deletion even after "nein, behalte es".
 *
 * Consent is exactly the thing code must own rather than infer (CLAUDE.md rule 1), so it is
 * bound to this operation, this object, once, and not for ever. An older open proposal for
 * the same thing is superseded, so she never has two cards asking the same question.
 */
async function proposeDeletion(
  ctx: ToolContext,
  what: {
    operation: 'delete_material' | 'delete_item';
    materialId: string;
    itemId: string | null;
    title: string | null;
    detail: string | null;
  },
): Promise<ToolOutcome> {
  return ctx.db.tx(async (tx) => {
    await tx.query(
      `update buddy_pending_actions set status = 'superseded', decided_at = $4
        where learner_id = $1 and status = 'open' and operation = $2 and material_id = $3`,
      [ctx.learnerId, what.operation, what.materialId, ctx.now],
    );
    const row = await tx.one<{ id: string }>(
      `insert into buddy_pending_actions
         (learner_id, operation, material_id, item_id, title, detail, asked_at, expires_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8) returning id`,
      [
        ctx.learnerId,
        what.operation,
        what.materialId,
        what.itemId,
        what.title,
        what.detail,
        ctx.now,
        new Date(ctx.now.getTime() + CONFIRM_WINDOW_MINUTES * 60_000),
      ],
    );
    return {
      summary: {
        tool: 'confirm_delete' as const,
        pending_id: row.id,
        what: what.operation === 'delete_material' ? ('material' as const) : ('item' as const),
        title: what.title,
        detail: what.detail,
        status: 'open' as const,
      },
      // Nothing happened yet: there is nothing to take back, and "Behalten" is the way out.
      undo: null,
    };
  });
}

/**
 * She asked for a sheet to go (issue #111). This is the library's own delete — the same
 * service the button calls, so merged pages, questions, running sessions and the photo and
 * content purge are handled in one place and cannot drift apart.
 *
 * No undo: `archiveMaterial` schedules the photos and the transcript for erasure right away,
 * which is the point when she deletes a private photo. Offering "rückgängig" on a card whose
 * content is already on its way out would be a promise we cannot keep (CLAUDE.md rule 5).
 *
 * Because it cannot be taken back, the confirmation is enforced here and not left to the
 * prompt: the live run of buddy.33 had the model delete a whole vocabulary sheet on "mit der
 * Vokabelliste bin ich durch" — a sentence that ends a session, not a sheet. So Buddy must
 * have asked in his previous answer (asks_permission) before this runs; the first attempt is
 * rejected and repaired into a question, and her "ja" is what carries the second one. That is
 * the library's confirm sheet, in the conversation (docs/UX-PRINCIPLES.md §18).
 */
export async function runDeleteMaterial(
  action: ActionOf<'delete_material'>,
  ctx: ToolContext,
): Promise<ToolOutcome> {
  const a = action.args;
  requireQuote(ctx, a.quote);
  const m = materialOf(ctx, a.material);
  // Proposed, never done: the card carries her answer (issue #151).
  return proposeDeletion(ctx, {
    operation: 'delete_material',
    materialId: m.id,
    itemId: null,
    title: m.title,
    detail: null,
  });
}

export async function runRenameMaterial(
  action: ActionOf<'rename_material'>,
  ctx: ToolContext,
): Promise<ToolOutcome> {
  const a = action.args;
  requireQuote(ctx, a.quote);
  const m = materialOf(ctx, a.material);
  if (m.title === a.title)
    throw new ToolRejection(
      `sheet ${a.material} is already called that — leave this action out and just say so`,
    );
  const r = await ctx.db.query(
    `update materials set title = $3
      where id = $1 and learner_id = $2 and archived_at is null returning id`,
    [m.id, ctx.learnerId, a.title],
  );
  if (r.length === 0) throw new ToolRejection(`sheet ${a.material} is gone`);
  await bumpContext(ctx.db, ctx.learnerId);
  return {
    summary: { tool: 'rename_material', material_id: m.id, title: a.title },
    undo: { type: 'rename_material_back', material_id: m.id, title: m.title },
  };
}

/**
 * One question off a sheet (issue #120). She says which one in words — "die mit den 20 Prozent"
 * is not it, the question as it stands is — and the server finds it among that sheet's own
 * questions. No id from the model (rule 2), and no guessing: if her words fit more than one,
 * the action is refused and Buddy asks which.
 *
 * Like deleting a sheet this cannot be taken back (`archiveMaterialItem` erases the text, the
 * solution and her answers by job), so it takes the same two turns: Buddy must have asked.
 */
export async function runDeleteItem(
  action: ActionOf<'delete_item'>,
  ctx: ToolContext,
): Promise<ToolOutcome> {
  const a = action.args;
  requireQuote(ctx, a.quote);
  const m = materialOf(ctx, a.material);
  const rows = await ctx.db.query<{ id: string; prompt: string }>(
    `select id, prompt from items
      where learner_id = $1 and material_id = $2 and archived_at is null`,
    [ctx.learnerId, m.id],
  );
  if (rows.length === 0) throw new ToolRejection(`sheet ${a.material} has no questions left`);
  const wanted = normalizeForMatch(a.question);
  // Word for word first; only if that finds nothing, the question that contains her words.
  const exact = rows.filter((r) => normalizeForMatch(r.prompt) === wanted);
  const hits =
    exact.length > 0 ? exact : rows.filter((r) => normalizeForMatch(r.prompt).includes(wanted));
  if (hits.length === 0) {
    throw new ToolRejection(
      `no question on sheet ${a.material} reads like that — look them up (find_questions) and use one word for word`,
    );
  }
  if (hits.length > 1) {
    throw new ToolRejection(
      `${hits.length} questions on sheet ${a.material} fit that; nothing is deleted on a guess — name them and ask which`,
    );
  }
  const hit = hits[0]!;
  // Which question is decided here, from her own words and her own sheet (rule 2); whether
  // it goes is decided by her tap (issue #151).
  return proposeDeletion(ctx, {
    operation: 'delete_item',
    materialId: m.id,
    itemId: hit.id,
    title: m.title,
    detail: hit.prompt,
  });
}
