// Buddy's memory tools: remember, correct and forget what she said about herself.
// Split from tools.ts (#311); the rules every tool keeps are written there.

import type { ActionOf } from './decision.js';
import { normalizeForMatch } from './text.js';
import {
  MAX_ACTIVE_MEMORIES,
  memoryOf,
  refuseDuringConcern,
  refuseForbiddenAbout,
  requireQuote,
  requireSupported,
  resolveEnd,
  type ToolContext,
  type ToolOutcome,
  ToolRejection,
} from './toolKit.js';

export async function runRemember(
  action: ActionOf<'remember'>,
  ctx: ToolContext,
): Promise<ToolOutcome> {
  const a = action.args;
  refuseDuringConcern(ctx);
  refuseForbiddenAbout(a.about);
  requireQuote(ctx, a.quote);
  requireSupported(ctx, a.statement, a.quote);
  let validUntil: Date | null = null;
  if (a.kind === 'constraint') {
    if (!a.until) throw new ToolRejection('a temporary situation (constraint) needs an until');
    validUntil = resolveEnd(ctx, a.until, 'this situation');
  }
  const existing = await ctx.db.query<{ id: string; statement: string; valid_until: Date | null }>(
    `select id, statement, valid_until from buddy_memories
      where learner_id = $1 and status = 'active' and (valid_until is null or valid_until > $2)`,
    [ctx.learnerId, ctx.now],
  );
  const same = existing.find(
    (m) => normalizeForMatch(m.statement) === normalizeForMatch(a.statement),
  );
  if (same && validUntil && same.valid_until?.getTime() !== validUntil.getTime()) {
    // Known already, with another end: the new end is kept (it replaces the old row, which
    // undo restores) instead of being dropped while the card says "noted"
    // (remember-dedupe-misreports).
    await ctx.db.query(
      `update buddy_memories set status = 'superseded', closed_at = $3, version = version + 1
        where id = $1 and learner_id = $2 and status = 'active'`,
      [same.id, ctx.learnerId, ctx.now],
    );
    const row = await ctx.db.one<{ id: string }>(
      `insert into buddy_memories (learner_id, kind, statement, source, source_message_id, quote,
                                   valid_until, supersedes_id, created_at)
       values ($1, $2, $3, 'learner_stated', $4, $5, $6, $7, $8) returning id`,
      [
        ctx.learnerId,
        a.kind,
        same.statement,
        ctx.triggerMessageId,
        a.quote,
        validUntil,
        same.id,
        ctx.now,
      ],
    );
    return {
      summary: {
        tool: 'remember',
        memory_id: row.id,
        statement: same.statement,
        kind: a.kind,
        valid_until: validUntil.toISOString(),
      },
      undo: { type: 'restore_memory', old_id: same.id, new_id: row.id },
    };
  }
  if (same) {
    return {
      summary: {
        tool: 'remember',
        memory_id: same.id,
        statement: same.statement,
        kind: a.kind,
        valid_until: null,
      },
      undo: null,
    };
  }
  if (existing.length >= MAX_ACTIVE_MEMORIES) {
    throw new ToolRejection('memory is full — ask the learner which old item to forget');
  }
  const row = await ctx.db.one<{ id: string }>(
    `insert into buddy_memories (learner_id, kind, statement, source, source_message_id, quote, valid_until,
                                 created_at)
     values ($1, $2, $3, 'learner_stated', $4, $5, $6, $7) returning id`,
    [ctx.learnerId, a.kind, a.statement, ctx.triggerMessageId, a.quote, validUntil, ctx.now],
  );
  return {
    summary: {
      tool: 'remember',
      memory_id: row.id,
      statement: a.statement,
      kind: a.kind,
      valid_until: validUntil ? validUntil.toISOString() : null,
    },
    undo: { type: 'retract_memory', memory_id: row.id },
  };
}

export async function runCorrectMemory(
  action: ActionOf<'correct_memory'>,
  ctx: ToolContext,
): Promise<ToolOutcome> {
  const a = action.args;
  refuseDuringConcern(ctx);
  refuseForbiddenAbout(a.about);
  requireQuote(ctx, a.quote);
  const old = memoryOf(ctx, a.memory);
  requireSupported(ctx, a.statement, a.quote, old.statement);
  // A temporary situation may end at another time now (audit M-54 p2-J-memory-F1).
  if (a.until && old.kind !== 'constraint')
    throw new ToolRejection(`memory ${a.memory} is not a temporary situation; until must be null`);
  const validUntil = a.until ? resolveEnd(ctx, a.until, 'this situation') : old.valid_until;
  const updated = await ctx.db.query(
    `update buddy_memories set status = 'superseded', closed_at = $3, version = version + 1
      where id = $1 and learner_id = $2 and status = 'active' returning id`,
    [old.id, ctx.learnerId, ctx.now],
  );
  if (updated.length !== 1) throw new ToolRejection(`memory ${a.memory} changed meanwhile`);
  const row = await ctx.db.one<{ id: string }>(
    `insert into buddy_memories (learner_id, kind, statement, source, source_message_id, quote,
                                 valid_until, supersedes_id, created_at)
     values ($1, $2, $3, 'learner_stated', $4, $5, $6, $7, $8) returning id`,
    [
      ctx.learnerId,
      old.kind,
      a.statement,
      ctx.triggerMessageId,
      a.quote,
      validUntil,
      old.id,
      ctx.now,
    ],
  );
  return {
    summary: { tool: 'correct_memory', memory_id: row.id, statement: a.statement },
    undo: { type: 'restore_memory', old_id: old.id, new_id: row.id },
  };
}

export async function runForget(
  action: ActionOf<'forget'>,
  ctx: ToolContext,
): Promise<ToolOutcome> {
  const a = action.args;
  requireQuote(ctx, a.quote);
  if (a.all) {
    // Everything at once (issue #114). Not the aliases in STATE — those are only what fit
    // there; the database decides what "everything" is, so nothing survives unseen.
    const gone = await ctx.db.query<{ id: string }>(
      `update buddy_memories set status = 'retracted', closed_at = $2, version = version + 1
        where learner_id = $1 and status = 'active' returning id`,
      [ctx.learnerId, ctx.now],
    );
    if (gone.length === 0) throw new ToolRejection('there is nothing you know about her to forget');
    return {
      summary: { tool: 'forget', memory_id: null, statement: null, forgotten: gone.length },
      undo: { type: 'unretract_memories', memory_ids: gone.map((r) => r.id) },
    };
  }
  if (a.memory === null) throw new ToolRejection('forget needs a memory alias, or all=true');
  const m = memoryOf(ctx, a.memory);
  const updated = await ctx.db.query(
    `update buddy_memories set status = 'retracted', closed_at = $3, version = version + 1
      where id = $1 and learner_id = $2 and status = 'active' returning id`,
    [m.id, ctx.learnerId, ctx.now],
  );
  if (updated.length !== 1) throw new ToolRejection(`memory ${a.memory} changed meanwhile`);
  return {
    summary: { tool: 'forget', memory_id: m.id, statement: m.statement },
    undo: { type: 'unretract_memory', memory_id: m.id },
  };
}
