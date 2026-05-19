// Sessions. Doc 04 §POST /sessions.
//
// Slice E1: server picks due items using FSRS state. v1 selection logic:
//   1. Filter items by subject_id / folder_id / material_id when provided.
//   2. Filter by learner_id and archived_at IS NULL.
//   3. Sort by `item_states.due ASC` (overdue first), then unseen items
//      (no item_state row → treat as "new", after overdue), then future-due.
//   4. Cap at min(max_items, 50).
//
// For test_mode, the same selection is used but sessions.test_mode=true; the
// no-hints / single-shot rule changes (Doc 05 §session) are enforced
// client-side.

import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { streamSSE } from 'hono/streaming';
import { z } from 'zod';
import { SessionPatch, SessionTurnRequest } from '@learnbuddy/shared-types';
import type { ConversationSseEvent } from '@learnbuddy/shared-types';

import { refund, settle, tryDebit } from '../lib/credits.js';
import { getDeps } from '../lib/deps.js';
import { ApiError } from '../lib/errors.js';
import { applyAttempt, type ItemStateRow } from '../lib/fsrs.js';
import { isNonAnswer } from '../lib/give-up.js';
import { loadMaterialContext } from '../lib/material-context.js';
import type { ConversationMessage } from '../lib/llm/gateway.js';
import { requireAuth, requireLearnerContext } from '../middleware/auth.js';
import { rateLimit } from '../middleware/rate-limit.js';

const SessionCreateRequest = z.object({
  subject_id: z.string().uuid().nullable().optional(),
  folder_id: z.string().uuid().nullable().optional(),
  material_id: z.string().uuid().nullable().optional(),
  test_mode: z.boolean().default(false),
  max_items: z.number().int().min(1).max(50).default(20),
});

export const sessionRoutes = new Hono();
sessionRoutes.use('*', requireAuth, requireLearnerContext);

sessionRoutes.post(
  '/',
  rateLimit({ key: 'sessions_create', per_hour: 60 }),
  zValidator('json', SessionCreateRequest),
  async (c) => {
    const { supabase, now } = getDeps(c);
    const learner_id = c.get('learner_id');
    if (!learner_id) throw new ApiError('unauthenticated', 'Missing learner context');
    const input = c.req.valid('json');
    const nowIso = now().toISOString();

    const picked = await pickItems(supabase, {
      learner_id,
      subject_id: input.subject_id ?? null,
      folder_id: input.folder_id ?? null,
      material_id: input.material_id ?? null,
      max_items: input.max_items,
      now: nowIso,
    });

    if (picked.length === 0) {
      throw new ApiError('not_found', 'No items in scope. Add material first or widen the filter.');
    }

    const sess = await supabase
      .from('sessions')
      .insert({
        learner_id,
        subject_id: input.subject_id ?? null,
        test_mode: input.test_mode,
        started_at: nowIso,
        attempts_count: 0,
        correct_count: 0,
        // Persist the exact chosen set so a resume returns the SAME
        // questions instead of letting FSRS re-pick under the learner.
        picked_item_ids: picked.map((p) => p.id as string),
      })
      .select('*')
      .single();
    if (sess.error || !sess.data) {
      throw new ApiError('internal', 'Failed to create session', {
        cause: sess.error?.message ?? 'no row',
      });
    }

    return c.json({
      session_id: (sess.data as { id: string }).id,
      items: picked,
    });
  },
);

type PickInput = {
  learner_id: string;
  subject_id: string | null;
  folder_id: string | null;
  material_id: string | null;
  max_items: number;
  now: string;
};

async function pickItems(
  supabase: ReturnType<typeof getDeps>['supabase'],
  i: PickInput,
): Promise<Array<Record<string, unknown>>> {
  // Try the server-side RPC first; falls back to the JS path when the
  // function is missing (e.g. against the fake-supabase or a dev DB that
  // hasn't applied migration 0012 yet).
  const supaWithRpc = supabase as unknown as {
    rpc?: (
      name: string,
      params: Record<string, unknown>,
    ) => Promise<{ data: Array<{ item_id: string }> | null; error: { message: string } | null }>;
  };
  if (typeof supaWithRpc.rpc === 'function') {
    const ids = await supaWithRpc.rpc('lb_pick_session_items', {
      p_learner_id: i.learner_id,
      p_subject_id: i.subject_id,
      p_folder_id: i.folder_id,
      p_material_id: i.material_id,
      p_max_items: i.max_items,
      p_now: i.now,
    });
    if (!ids.error && ids.data) {
      const itemIds = ids.data.map((r) => r.item_id);
      if (itemIds.length === 0) return [];
      const items = await supabase.from('items').select('*').in('id', itemIds);
      if (items.error) {
        throw new ApiError('internal', 'Failed to load items', { cause: items.error.message });
      }
      // Preserve the RPC's ordering.
      const byId = new Map(
        ((items.data ?? []) as Array<Record<string, unknown>>).map((it) => [it.id as string, it]),
      );
      return itemIds.map((id) => byId.get(id)).filter((it): it is Record<string, unknown> => !!it);
    }
  }
  // ── Fallback path ────────────────────────────────────────────────────────
  let q = supabase.from('items').select('*').eq('learner_id', i.learner_id).is('archived_at', null);
  if (i.material_id) q = q.eq('material_id', i.material_id);
  const items = await q;
  if (items.error) {
    throw new ApiError('internal', 'Failed to load items', { cause: items.error.message });
  }
  let pool = (items.data ?? []) as Array<Record<string, unknown>>;

  if (i.subject_id || i.folder_id) {
    const mat = await supabase
      .from('materials')
      .select('id, subject_id, folder_id')
      .eq('learner_id', i.learner_id)
      .is('archived_at', null);
    const materials = (mat.data ?? []) as Array<{
      id: string;
      subject_id: string;
      folder_id: string | null;
    }>;
    const allow = new Set(
      materials
        .filter((m) => {
          if (i.subject_id && m.subject_id !== i.subject_id) return false;
          if (i.folder_id && m.folder_id !== i.folder_id) return false;
          return true;
        })
        .map((m) => m.id),
    );
    pool = pool.filter((it) => allow.has(it.material_id as string));
  }

  const states = await supabase.from('item_states').select('*').eq('learner_id', i.learner_id);
  const stateByItem = new Map<string, { due: string | null }>();
  for (const s of (states.data ?? []) as Array<{ item_id: string; due: string }>) {
    stateByItem.set(s.item_id, { due: s.due });
  }
  pool.sort((a, b) => {
    const aDue = stateByItem.get(a.id as string)?.due ?? null;
    const bDue = stateByItem.get(b.id as string)?.due ?? null;
    const aOverdue = aDue && aDue < i.now;
    const bOverdue = bDue && bDue < i.now;
    const aBucket = aOverdue ? 0 : aDue === null ? 1 : 2;
    const bBucket = bOverdue ? 0 : bDue === null ? 1 : 2;
    if (aBucket !== bBucket) return aBucket - bBucket;
    const aKey = aDue ?? '0';
    const bKey = bDue ?? '0';
    return aKey < bKey ? -1 : aKey > bKey ? 1 : 0;
  });
  return pool.slice(0, i.max_items);
}

sessionRoutes.patch('/:id/finish', async (c) => {
  const { supabase, now } = getDeps(c);
  const learner_id = c.get('learner_id');
  if (!learner_id) throw new ApiError('unauthenticated', 'Missing learner context');
  const session_id = c.req.param('id');

  const upd = await supabase
    .from('sessions')
    .update({ ended_at: now().toISOString() })
    .eq('id', session_id)
    .eq('learner_id', learner_id)
    .select('*')
    .maybeSingle();
  if (upd.error) {
    throw new ApiError('internal', 'Failed to finish session', { cause: upd.error.message });
  }
  if (!upd.data) throw new ApiError('not_found', 'Session not found');
  return c.json(upd.data);
});

// GET /sessions/:id — full snapshot for deterministic resume.
// Doc 05 §session ("Quit mid-session … state is preserved").
// Returns the SAME items chosen at start plus the entire conversation
// thread so the client can rebuild the screen exactly where it left off.
sessionRoutes.get('/:id', async (c) => {
  const { supabase } = getDeps(c);
  const learner_id = c.get('learner_id');
  if (!learner_id) throw new ApiError('unauthenticated', 'Missing learner context');
  const session_id = c.req.param('id');

  const sessRow = await supabase
    .from('sessions')
    .select('*')
    .eq('id', session_id)
    .eq('learner_id', learner_id)
    .maybeSingle();
  if (sessRow.error) {
    throw new ApiError('internal', 'Failed to load session', { cause: sessRow.error.message });
  }
  if (!sessRow.data) throw new ApiError('not_found', 'Session not found');
  return c.json(await buildSnapshot(supabase, sessRow.data as SessionRow));
});

// PATCH /sessions/:id — sustained-session controls (Doc 01 §Studying).
//   { pinned_topic: "…" | null }  → lock onto / release a topic
//   { keep_going: true }          → refill the queue with more due items
sessionRoutes.patch('/:id', zValidator('json', SessionPatch), async (c) => {
  const { supabase, now } = getDeps(c);
  const learner_id = c.get('learner_id');
  if (!learner_id) throw new ApiError('unauthenticated', 'Missing learner context');
  const session_id = c.req.param('id');
  const input = c.req.valid('json');

  const sessRow = await supabase
    .from('sessions')
    .select('*')
    .eq('id', session_id)
    .eq('learner_id', learner_id)
    .maybeSingle();
  if (sessRow.error) {
    throw new ApiError('internal', 'Failed to load session', { cause: sessRow.error.message });
  }
  if (!sessRow.data) throw new ApiError('not_found', 'Session not found');
  const session = sessRow.data as SessionRow;
  if (session.ended_at != null) {
    throw new ApiError('validation_failed', 'Session has already ended');
  }

  const patch: Record<string, unknown> = {};
  if (input.pinned_topic !== undefined) {
    patch.pinned_topic = input.pinned_topic;
  }

  if (input.keep_going) {
    const already = new Set(session.picked_item_ids ?? []);
    const pinned = input.pinned_topic ?? session.pinned_topic ?? null;
    const more = await pickItems(supabase, {
      learner_id,
      subject_id: session.subject_id ?? null,
      folder_id: null,
      material_id: null,
      max_items: 50,
      now: now().toISOString(),
    });
    const fresh = more
      .filter((it) => !already.has(it.id as string))
      .filter((it) => !pinned || (it.topic as string | null) === pinned)
      .slice(0, 20);
    patch.picked_item_ids = [...(session.picked_item_ids ?? []), ...fresh.map((f) => f.id)];
  }

  if (Object.keys(patch).length > 0) {
    const upd = await supabase
      .from('sessions')
      .update(patch)
      .eq('id', session_id)
      .eq('learner_id', learner_id)
      .select('*')
      .maybeSingle();
    if (upd.error || !upd.data) {
      throw new ApiError('internal', 'Failed to update session', {
        cause: upd.error?.message ?? 'no row',
      });
    }
    return c.json(await buildSnapshot(supabase, upd.data as SessionRow));
  }
  return c.json(await buildSnapshot(supabase, session));
});

type SessionRow = {
  id: string;
  test_mode: boolean;
  ended_at: string | null;
  subject_id: string | null;
  pinned_topic: string | null;
  picked_item_ids: string[] | null;
};

async function buildSnapshot(
  supabase: ReturnType<typeof getDeps>['supabase'],
  session: SessionRow,
): Promise<{
  session_id: string;
  test_mode: boolean;
  pinned_topic: string | null;
  active: boolean;
  items: Array<Record<string, unknown>>;
  turns: TurnRow[];
}> {
  const ids = session.picked_item_ids ?? [];
  let items: Array<Record<string, unknown>> = [];
  if (ids.length > 0) {
    const res = await supabase.from('items').select('*').in('id', ids);
    const byId = new Map(
      ((res.data ?? []) as Array<Record<string, unknown>>).map((it) => [it.id as string, it]),
    );
    items = ids
      .map((id) => byId.get(id))
      .filter((it): it is Record<string, unknown> => Boolean(it));
  }
  const turns = await loadTurns(supabase, session.id);
  return {
    session_id: session.id,
    test_mode: Boolean(session.test_mode),
    pinned_topic: session.pinned_topic ?? null,
    active: session.ended_at == null,
    items,
    turns,
  };
}

// GET /sessions/:id/summary — Doc 04 §sessions + Doc 05 §result.
//
// Renders the post-session "Heute geübt — fein gemacht" screen. We never
// surface a "missed days" count (Doc 01 §tone) — secure / unsure are framed
// positively. Per Doc 05, we *may* list which topics felt sicher vs. unsicher.
sessionRoutes.get('/:id/summary', async (c) => {
  const { supabase } = getDeps(c);
  const learner_id = c.get('learner_id');
  if (!learner_id) throw new ApiError('unauthenticated', 'Missing learner context');
  const session_id = c.req.param('id');

  const sess = await supabase
    .from('sessions')
    .select('*')
    .eq('id', session_id)
    .eq('learner_id', learner_id)
    .maybeSingle();
  if (sess.error) {
    throw new ApiError('internal', 'Failed to load session', { cause: sess.error.message });
  }
  if (!sess.data) throw new ApiError('not_found', 'Session not found');

  const attempts = await supabase
    .from('attempts')
    .select('item_id, verdict, duration_ms')
    .eq('session_id', session_id);
  if (attempts.error) {
    throw new ApiError('internal', 'Failed to load attempts', { cause: attempts.error.message });
  }
  const rows = (attempts.data ?? []) as Array<{
    item_id: string;
    verdict: 'correct' | 'partially_correct' | 'incorrect' | 'skipped';
    duration_ms: number | null;
  }>;

  // Per-topic tally so the chips on result.tsx can render real names instead
  // of the placeholder German strings.
  const itemIds = [...new Set(rows.map((r) => r.item_id))];
  type ItemTopicRow = { id: string; topic: string | null };
  const topicByItem = new Map<string, string>();
  if (itemIds.length > 0) {
    const items = await supabase.from('items').select('id, topic').in('id', itemIds);
    if (!items.error) {
      for (const it of (items.data ?? []) as ItemTopicRow[]) {
        if (it.topic) topicByItem.set(it.id, it.topic);
      }
    }
  }

  type TopicTally = { secure: number; unsure: number };
  const byTopic = new Map<string, TopicTally>();
  let secureNow = 0;
  let stillUnsure = 0;
  let totalDuration = 0;
  for (const r of rows) {
    if (r.verdict === 'correct' || r.verdict === 'partially_correct') secureNow++;
    if (r.verdict === 'incorrect' || r.verdict === 'skipped') stillUnsure++;
    totalDuration += r.duration_ms ?? 0;
    const topic = topicByItem.get(r.item_id);
    if (topic) {
      const t = byTopic.get(topic) ?? { secure: 0, unsure: 0 };
      if (r.verdict === 'correct' || r.verdict === 'partially_correct') t.secure++;
      if (r.verdict === 'incorrect' || r.verdict === 'skipped') t.unsure++;
      byTopic.set(topic, t);
    }
  }

  const topics = Array.from(byTopic.entries())
    .map(([name, t]) => ({
      name,
      // "secure" if ≥ 2× as many correct as wrong; "unsure" otherwise. Soft
      // threshold to keep the green chip count generous (Doc 01 tone).
      tone: t.secure >= Math.max(1, t.unsure * 2) ? ('secure' as const) : ('unsure' as const),
    }))
    .sort((a, b) => (a.tone === b.tone ? 0 : a.tone === 'secure' ? -1 : 1));

  const session = sess.data as Record<string, unknown>;
  return c.json({
    session_id,
    started_at: session.started_at,
    ended_at: session.ended_at,
    attempts_count: rows.length,
    secure_now: secureNow,
    still_unsure: stillUnsure,
    total_duration_ms: totalDuration,
    topics,
  });
});

// POST /sessions/:id/turn — one conversational turn (streaming SSE).
// Doc 06 §P3 / Doc 05 §session / Doc 01 §Studying ("Üben ist ein Gespräch").
//
// This is THE conversational endpoint. It loads the whole session thread,
// transcribes voice if needed, replays the full transcript to the tutor so
// every reply has complete context, streams the tutor's answer token by
// token, persists both turns, and accounts credits (idempotent on
// client_turn_id so a flaky retry replays instead of double-charging).
const ATTEMPT_ESTIMATE = 1; // Doc 08 §estimated-costs-per-action
// Cap on prior turns replayed to the model per turn (~12 Q/A exchanges).
const MAX_HISTORY_MESSAGES = 24;

type TurnRow = {
  id: string;
  turn_index: number;
  role: 'learner' | 'tutor' | 'system';
  kind: 'question' | 'answer' | 'hint' | 'feedback' | 'reveal' | 'note';
  content: string;
  verdict: 'correct' | 'partially_correct' | 'incorrect' | 'skipped' | null;
  item_id: string | null;
};

sessionRoutes.post(
  '/:id/turn',
  rateLimit({ key: 'session_turn', per_hour: 1200 }),
  zValidator('json', SessionTurnRequest),
  async (c) => {
    const { supabase, llm, now } = getDeps(c);
    const { account_id } = c.get('auth');
    const learner_id = c.get('learner_id');
    const session_id = c.req.param('id');
    const input = c.req.valid('json');

    return streamSSE(c, async (stream) => {
      const push = (e: ConversationSseEvent): Promise<void> =>
        stream.writeSSE({ data: JSON.stringify(e) });

      if (!learner_id) {
        await push({ type: 'error', code: 'unauthenticated', message: 'Missing learner context' });
        return;
      }
      if (!input.item_id) {
        await push({ type: 'error', code: 'validation_failed', message: 'item_id is required' });
        return;
      }

      // 1. Session must exist, be owned, and still be open.
      const sessRow = await supabase
        .from('sessions')
        .select('*')
        .eq('id', session_id)
        .eq('learner_id', learner_id)
        .maybeSingle();
      if (sessRow.error || !sessRow.data) {
        await push({ type: 'error', code: 'not_found', message: 'Session not found' });
        return;
      }
      const session = sessRow.data as Record<string, unknown>;
      if (session.ended_at != null) {
        await push({ type: 'error', code: 'session_ended', message: 'This session has ended' });
        return;
      }

      // 2. Idempotency — a retried send replays the original reply.
      const dup = await supabase
        .from('conversation_turns')
        .select('*')
        .eq('session_id', session_id)
        .eq('client_turn_id', input.client_turn_id)
        .eq('role', 'learner')
        .maybeSingle();
      if (!dup.error && dup.data) {
        const learnerTurn = dup.data as TurnRow;
        const all = await loadTurns(supabase, session_id);
        const tutor = all.find(
          (t) => t.role === 'tutor' && t.turn_index === learnerTurn.turn_index + 1,
        );
        if (tutor) {
          // Tutor turns are always persisted with a non-null verdict
          // (persistTurn callers below pass one explicitly). If we ever see
          // a null here something's wrong upstream — surface it loudly
          // instead of silently picking a default that masks bad data.
          if (!tutor.verdict) {
            await push({
              type: 'error',
              code: 'internal',
              message: `replay: tutor turn ${tutor.id} has no verdict`,
            });
            return;
          }
          await push({ type: 'token', text: tutor.content });
          await push({ type: 'verdict', verdict: tutor.verdict });
          await push({ type: 'feedback', text: tutor.content });
          await push({
            type: 'done',
            credits_used: 0,
            verdict: tutor.verdict,
            learner_turn_id: learnerTurn.id,
            tutor_turn_id: tutor.id,
            session_active: true,
          });
          return;
        }
      }

      // 3. Load the item (ownership-checked).
      const itemRow = await supabase
        .from('items')
        .select('*')
        .eq('id', input.item_id)
        .is('archived_at', null)
        .maybeSingle();
      if (itemRow.error || !itemRow.data) {
        await push({ type: 'error', code: 'not_found', message: 'Item not found' });
        return;
      }
      const item = itemRow.data as Record<string, unknown> & { learner_id: string };
      if (item.learner_id !== learner_id) {
        await push({ type: 'error', code: 'not_found', message: 'Item not found' });
        return;
      }

      // 4. Resolve the learner's message (transcribe voice if needed).
      let learnerText = (input.text ?? '').trim();
      let transcribeCostMicros = 0;
      if (!learnerText && input.audio_base64) {
        try {
          const tr = await llm.transcribeAudio({
            audioBase64: input.audio_base64,
            mimeType: input.audio_mime ?? 'audio/m4a',
            locale: (item.language as 'de') ?? 'de',
          });
          learnerText = tr.text.trim();
          transcribeCostMicros = tr.usage.cost_usd_micros;
          // Reject noise-floor transcriptions: a single letter or a single
          // bare punctuation mark almost always means Vertex transcribed
          // breath/silence, not a real attempt. Surface as a recoverable
          // error so the learner can re-record (free) instead of having
          // gibberish recorded as their answer.
          if (learnerText.length < 2) {
            await push({
              type: 'error',
              code: 'transcription_failed',
              message: 'Recording was too short or unclear — please try again',
            });
            return;
          }
          await push({ type: 'transcript', text: learnerText });
        } catch {
          await push({
            type: 'error',
            code: 'transcription_failed',
            message: 'Could not understand the recording',
          });
          return;
        }
      }
      if (!learnerText) {
        await push({ type: 'error', code: 'empty_answer', message: 'No answer provided' });
        return;
      }

      // 5. Build the thread + hint accounting from prior turns.
      const turns = await loadTurns(supabase, session_id);
      const nextIndex = turns.reduce((mx, t) => Math.max(mx, t.turn_index), -1) + 1;
      const convoTurns = turns.filter(
        (t) =>
          (t.role === 'learner' && t.kind === 'answer') ||
          (t.role === 'tutor' && (t.kind === 'feedback' || t.kind === 'hint')),
      );
      // Bound the transcript so a long "keep going" marathon doesn't grow
      // input tokens/cost unbounded — BUT never drop the current item's own
      // exchange (its hint staircase must stay coherent however long the
      // session is). Keep: every current-item message + a recent window of
      // the rest, preserving chronological order. Older other-item turns are
      // still persisted server-side and resurface via FSRS, not via context.
      const windowStart = Math.max(0, convoTurns.length - MAX_HISTORY_MESSAGES);
      const history: ConversationMessage[] = convoTurns
        .filter((t, i) => i >= windowStart || t.item_id === input.item_id)
        .map((t) => ({
          role: t.role === 'learner' ? ('learner' as const) : ('tutor' as const),
          content: t.content,
        }));
      // Count every prior tutor turn on this item that wasn't a "Genau!" — a
      // give-up ('skipped') still consumes a hint slot, otherwise a "weiss
      // nicht" cycle resets the staircase and the tutor can hand out 4+ hints
      // per item instead of the documented 2.
      const hintsGivenForItem = turns.filter(
        (t) =>
          t.role === 'tutor' &&
          t.item_id === input.item_id &&
          (t.verdict === 'incorrect' ||
            t.verdict === 'partially_correct' ||
            t.verdict === 'skipped'),
      ).length;

      const learnerRow = await supabase
        .from('learners')
        .select('grade_level, ui_locale, display_name')
        .eq('id', learner_id)
        .maybeSingle();
      const lp =
        (learnerRow.data as {
          grade_level: number | null;
          ui_locale: string | null;
          display_name: string | null;
        } | null) ?? null;
      const gradeLevel = lp?.grade_level ?? 7;
      const locale = (lp?.ui_locale ?? 'de') as 'de' | 'en' | 'fr' | 'es' | 'it';
      const testMode = Boolean(session.test_mode);

      const persistTurn = async (row: {
        turn_index: number;
        role: 'learner' | 'tutor';
        kind: 'answer' | 'feedback';
        content: string;
        verdict: 'correct' | 'partially_correct' | 'incorrect' | 'skipped' | null;
        client_turn_id: string | null;
      }): Promise<string> => {
        const ins = await supabase
          .from('conversation_turns')
          .insert({
            session_id,
            learner_id,
            item_id: input.item_id,
            turn_index: row.turn_index,
            role: row.role,
            kind: row.kind,
            content: row.content,
            verdict: row.verdict,
            mode: input.mode,
            client_turn_id: row.client_turn_id,
            created_at: now().toISOString(),
          })
          .select('id')
          .single();
        return (ins.data as { id: string } | null)?.id ?? '';
      };

      const recordAttempt = async (
        verdict: 'correct' | 'partially_correct' | 'incorrect' | 'skipped',
        evaluatedBy: 'local' | 'llm',
        feedback: string,
        usageModel: string | null,
        usageVersion: string | null,
      ): Promise<void> => {
        const reviewedAt = now();
        await supabase.from('attempts').insert({
          learner_id,
          item_id: input.item_id,
          session_id,
          mode: input.mode,
          kid_answer: learnerText,
          verdict,
          evaluated_by: evaluatedBy,
          evaluation_model: usageModel,
          evaluation_prompt_version: usageVersion,
          feedback,
          hints_used: hintsGivenForItem,
          duration_ms: input.duration_ms,
          test_mode: testMode,
        });
        const prevAttempts = Number(session.attempts_count ?? 0);
        const prevCorrect = Number(session.correct_count ?? 0);
        await supabase
          .from('sessions')
          .update({
            attempts_count: prevAttempts + 1,
            correct_count: prevCorrect + (verdict === 'correct' ? 1 : 0),
            last_turn_at: reviewedAt.toISOString(),
          })
          .eq('id', session_id);

        // Spaced repetition is the whole point of a learning app, yet the
        // online practice path never updated it — every answer (right OR
        // wrong) left item_states untouched, so "what to practise next" was
        // meaningless. Test-mode is excluded (it's an exam simulation, not
        // a study rep). Mirrors the offline batch drain in attempts.ts.
        if (!testMode) {
          const prevState = await supabase
            .from('item_states')
            .select('*')
            .eq('learner_id', learner_id)
            .eq('item_id', input.item_id)
            .maybeSingle();
          const prev = (prevState.data as ItemStateRow | null) ?? null;
          const next = applyAttempt(prev, verdict, reviewedAt);
          const ups = await supabase
            .from('item_states')
            .upsert({ item_id: input.item_id, learner_id, ...next }, { onConflict: 'item_id' });
          if (ups.error) {
            console.error(`[sessions] item_states upsert failed: ${ups.error.message}`);
          }
        }
      };

      // 5.5. Give-up path: the learner said "weiss nicht" / "idk" / hit send
      //      on whitespace. We DON'T need the tutor model to tell us that
      //      isn't an attempt — debiting and waiting on Gemini would burn
      //      credits for an answer we're about to override to 'skipped'
      //      anyway. Reply with a stock encouragement, count it as a hint
      //      slot via the staircase, and move on. 0 credits.
      if (isNonAnswer(learnerText)) {
        const skipReply = pickGiveUpReply(locale);
        const learnerTurnId = await persistTurn({
          turn_index: nextIndex,
          role: 'learner',
          kind: 'answer',
          content: learnerText,
          verdict: null,
          client_turn_id: input.client_turn_id,
        });
        const tutorTurnId = await persistTurn({
          turn_index: nextIndex + 1,
          role: 'tutor',
          kind: 'feedback',
          content: skipReply,
          verdict: 'skipped',
          client_turn_id: null,
        });
        await recordAttempt('skipped', 'local', skipReply, null, null);
        await push({ type: 'token', text: skipReply });
        await push({ type: 'verdict', verdict: 'skipped' });
        await push({ type: 'feedback', text: skipReply });
        await push({
          type: 'done',
          credits_used: 0,
          verdict: 'skipped',
          learner_turn_id: learnerTurnId,
          tutor_turn_id: tutorTurnId,
          session_active: true,
        });
        return;
      }

      // 6. Fast path: client is confident it's correct → no model, no charge.
      //    Guarded so a give-up ("weiss nicht") can never take the no-model
      //    "correct" path even if a client mislabels it.
      if (input.client_local_verdict === 'correct' && !isNonAnswer(learnerText)) {
        const praise = pickPraise(locale);
        const learnerTurnId = await persistTurn({
          turn_index: nextIndex,
          role: 'learner',
          kind: 'answer',
          content: learnerText,
          verdict: 'correct',
          client_turn_id: input.client_turn_id,
        });
        const tutorTurnId = await persistTurn({
          turn_index: nextIndex + 1,
          role: 'tutor',
          kind: 'feedback',
          content: praise,
          verdict: 'correct',
          client_turn_id: null,
        });
        await recordAttempt('correct', 'local', praise, null, null);
        await push({ type: 'token', text: praise });
        await push({ type: 'verdict', verdict: 'correct' });
        await push({ type: 'feedback', text: praise });
        await push({
          type: 'done',
          credits_used: 0,
          verdict: 'correct',
          learner_turn_id: learnerTurnId,
          tutor_turn_id: tutorTurnId,
          session_active: true,
        });
        return;
      }

      // 7. Tutor path — debit, stream, persist, settle.
      const debit = {
        estimate: ATTEMPT_ESTIMATE,
        reason: 'evaluation',
        learner_id,
        reference_id: input.item_id,
      };
      try {
        await tryDebit(supabase, account_id, debit);
      } catch (err) {
        const code = err instanceof ApiError ? err.code : 'internal';
        const message = err instanceof Error ? err.message : 'Could not start this turn';
        await push({ type: 'error', code, message });
        return;
      }

      // Ground the tutor in the actual worksheet, not a 200-char excerpt.
      const materialContext = await loadMaterialContext(
        supabase,
        (item.material_id as string | null) ?? null,
      );

      let result;
      try {
        result = await llm.converseTurn(
          {
            item: {
              question: String(item.question),
              expectedAnswer: String(item.expected_answer),
              acceptableAnswers: (item.acceptable_answers as string[] | null) ?? [],
              answerKind: item.answer_kind as 'short',
              units: (item.units as string | null) ?? null,
              latexExpected: (item.latex_expected as string | null) ?? null,
              latexAcceptable: (item.latex_acceptable as string[] | null) ?? null,
              mcOptions: (item.mc_options as string[] | null) ?? null,
              mcCorrectIndex: (item.mc_correct_index as number | null) ?? null,
              fillBlankTemplate: (item.fill_blank_template as string | null) ?? null,
              fillBlankAnswers: (item.fill_blank_answers as string[] | null) ?? null,
              diagramLabelIndex: (item.diagram_label_index as number | null) ?? null,
              sourceExcerpt: (item.source_excerpt as string | null) ?? null,
              topic: (item.topic as string | null) ?? null,
            },
            history,
            learnerMessage: learnerText,
            learnerName: lp?.display_name ?? null,
            locale,
            gradeLevel,
            testMode,
            pinnedTopic: (session.pinned_topic as string | null) ?? null,
            hintsGivenForItem,
            materialContext,
          },
          (delta) => {
            void push({ type: 'token', text: delta });
          },
        );
      } catch (err) {
        await refund(supabase, account_id, debit);
        await push({
          type: 'error',
          code: 'evaluation_failed',
          message: err instanceof Error ? err.message : 'The tutor could not answer',
        });
        return;
      }

      const totalMicros = result.usage.cost_usd_micros + transcribeCostMicros;
      const actualCredits = Math.max(1, Math.round(totalMicros / 100));
      await settle(supabase, account_id, debit, actualCredits, {
        ...result.usage,
        cost_usd_micros: totalMicros,
      });

      // Deterministic safety net over the model's self-reported verdict: if
      // the learner didn't actually answer (give-up / help-request / empty),
      // it is `skipped` — NEVER correct or partially_correct — no matter what
      // the model claimed. This is the fix for "Weiss nicht" → "Genau!".
      const finalVerdict = isNonAnswer(learnerText) ? 'skipped' : result.verdict;

      const learnerTurnId = await persistTurn({
        turn_index: nextIndex,
        role: 'learner',
        kind: 'answer',
        content: learnerText,
        verdict: null,
        client_turn_id: input.client_turn_id,
      });
      const tutorTurnId = await persistTurn({
        turn_index: nextIndex + 1,
        role: 'tutor',
        kind: 'feedback',
        content: result.reply,
        verdict: finalVerdict,
        client_turn_id: null,
      });
      await recordAttempt(
        finalVerdict,
        'llm',
        result.reply,
        result.usage.model,
        result.usage.prompt_version,
      );

      await push({ type: 'verdict', verdict: finalVerdict });
      await push({ type: 'feedback', text: result.reply });
      await push({
        type: 'done',
        credits_used: actualCredits,
        verdict: finalVerdict,
        learner_turn_id: learnerTurnId,
        tutor_turn_id: tutorTurnId,
        session_active: true,
      });
    });
  },
);

async function loadTurns(
  supabase: ReturnType<typeof getDeps>['supabase'],
  session_id: string,
): Promise<TurnRow[]> {
  const res = await supabase.from('conversation_turns').select('*').eq('session_id', session_id);
  if (res.error) return [];
  const rows = ((res.data ?? []) as TurnRow[]).slice();
  rows.sort((a, b) => a.turn_index - b.turn_index);
  return rows;
}

function pickPraise(locale: 'de' | 'en' | 'fr' | 'es' | 'it'): string {
  const map = {
    de: 'Stimmt — super gemacht!',
    en: "That's right — nicely done!",
    fr: "C'est juste — bravo !",
    es: '¡Correcto, muy bien!',
    it: 'Esatto — bravissimo!',
  } as const;
  return map[locale];
}

/** Stock reply for the "I don't know" path. Tone-soft per docs/01-product
 *  voice rules — never harsh, never "Falsch!". The tutor doesn't see this
 *  message; it's surfaced as the tutor turn so the chat thread reads
 *  coherently and the next call still has full context. */
function pickGiveUpReply(locale: 'de' | 'en' | 'fr' | 'es' | 'it'): string {
  const map = {
    de: 'Kein Problem — denk kurz nach oder sag „Tipp", dann helfen wir Schritt für Schritt.',
    en: "No worries — take a second, or say 'hint' and we'll walk through it.",
    fr: 'Pas de souci — prends ton temps, ou dis « indice » et on avance ensemble.',
    es: 'Tranqui — piénsalo o di "pista" y lo hacemos paso a paso.',
    it: 'Nessun problema — pensaci un attimo o dì "aiuto" e proviamo insieme.',
  } as const;
  return map[locale];
}
