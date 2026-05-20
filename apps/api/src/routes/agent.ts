// Agent v2 route — one-screen conversational tutor.
//
//   POST   /agent/sessions            create a session, return queue + opener
//   POST   /agent/sessions/:id/turn   stream one agent reply (SSE)
//   PATCH  /agent/sessions/:id/finish end the session, fire reflective job
//
// One LLM call per learner message. Structured JSON output decides
// verdict, advance, hint, reveal. Server tracks the item queue and
// pops on `advance=true`. No move registry, no probe assessments — the
// model owns the pedagogy through its JSON.

import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';

import {
  AGENT_PROMPT_VERSION,
  buildAgentSystemInstruction,
  parseAgentJson,
} from '../lib/agent/index.js';
import type { AgentItemContext, AgentThreadMessage } from '../lib/agent/types.js';
import { getDeps } from '../lib/deps.js';
import { ApiError } from '../lib/errors.js';
import type { Locale } from '@learnbuddy/shared-types';
import { requireAuth, requireLearnerContext } from '../middleware/auth.js';
import { rateLimit } from '../middleware/rate-limit.js';

export const agentRoutes = new Hono();
agentRoutes.use('*', requireAuth, requireLearnerContext);

// ── Session start ──────────────────────────────────────────────────────────

const SessionCreateBody = z.object({
  subject_id: z.string().uuid().nullable().optional(),
  folder_id: z.string().uuid().nullable().optional(),
  material_id: z.string().uuid().nullable().optional(),
  test_mode: z.boolean().default(false),
  max_items: z.number().int().min(1).max(50).default(20),
});

agentRoutes.post(
  '/sessions',
  rateLimit({ key: 'agent_sessions_create', per_hour: 60 }),
  zValidator('json', SessionCreateBody),
  async (c) => {
    const { supabase, now } = getDeps(c);
    const learner_id = c.get('learner_id');
    if (!learner_id) throw new ApiError('unauthenticated', 'Missing learner context');
    const body = c.req.valid('json');
    const nowIso = now().toISOString();

    const learnerRow = await supabase
      .from('learners')
      .select('display_name, grade_level, ui_locale')
      .eq('id', learner_id)
      .maybeSingle();
    const learner = (learnerRow.data ?? null) as {
      display_name: string | null;
      grade_level: number | null;
      ui_locale: string | null;
    } | null;
    const locale = ((learner?.ui_locale ?? 'de') as Locale) ?? ('de' as Locale);

    const items = await pickItems(supabase, {
      learner_id,
      subject_id: body.subject_id ?? null,
      folder_id: body.folder_id ?? null,
      material_id: body.material_id ?? null,
      max_items: body.max_items,
      now: nowIso,
    });
    if (items.length === 0) {
      throw new ApiError('not_found', 'No items in scope. Add material first or widen the filter.');
    }

    const insert = await supabase
      .from('sessions')
      .insert({
        learner_id,
        subject_id: body.subject_id ?? null,
        test_mode: body.test_mode,
        started_at: nowIso,
        attempts_count: 0,
        correct_count: 0,
        picked_item_ids: items.map((it) => it.id as string),
      })
      .select('*')
      .single();
    if (insert.error || !insert.data) {
      throw new ApiError('internal', 'Failed to create session', {
        cause: insert.error?.message ?? 'no row',
      });
    }
    const session = insert.data as { id: string };

    // Friendly opener — composed locally, no LLM. The first question is
    // ALSO sent as a tutor turn so the chat already shows the prompt
    // before the learner says anything.
    const firstItem = items[0]!;
    const opener = buildLocalOpener(learner?.display_name ?? null, locale);
    const firstQuestion = String(firstItem.question);

    // Persist the two seed turns: opener (no item_id) + the first question.
    const seedTurns: Array<{
      turn_index: number;
      role: 'tutor';
      kind: 'feedback' | 'question';
      content: string;
      item_id: string | null;
      intent: string;
    }> = [
      {
        turn_index: 0,
        role: 'tutor',
        kind: 'feedback',
        content: opener,
        item_id: null,
        intent: 'introduce_next',
      },
      {
        turn_index: 1,
        role: 'tutor',
        kind: 'question',
        content: firstQuestion,
        item_id: firstItem.id as string,
        intent: 'introduce_next',
      },
    ];
    for (const t of seedTurns) {
      await supabase.from('conversation_turns').insert({
        session_id: session.id,
        learner_id,
        item_id: t.item_id,
        turn_index: t.turn_index,
        role: t.role,
        kind: t.kind,
        content: t.content,
        intent: t.intent,
      });
    }

    return c.json(
      {
        session_id: session.id,
        items,
        opener,
        first_question: firstQuestion,
      },
      201,
    );
  },
);

// ── Turn (SSE stream) ──────────────────────────────────────────────────────

const TurnBody = z.object({
  client_turn_id: z.string().uuid(),
  text: z.string().min(1).max(4000).nullable().optional(),
  audio_base64: z.string().min(1).max(8_000_000).nullable().optional(),
  audio_mime: z.enum(['audio/m4a', 'audio/mp4', 'audio/wav', 'audio/webm']).nullable().optional(),
});

agentRoutes.post(
  '/sessions/:sessionId/turn',
  rateLimit({ key: 'agent_turn', per_hour: 600 }),
  zValidator('json', TurnBody),
  async (c) => {
    const { supabase, llm, now } = getDeps(c);
    const learner_id = c.get('learner_id');
    if (!learner_id) throw new ApiError('unauthenticated', 'Missing learner context');
    const session_id = c.req.param('sessionId');
    const body = c.req.valid('json');

    return streamSSE(c, async (sse) => {
      const send = (data: object): Promise<void> => sse.writeSSE({ data: JSON.stringify(data) });

      try {
        // Load session.
        const sessRes = await supabase
          .from('sessions')
          .select('id, learner_id, test_mode, picked_item_ids, pinned_topic, started_at, ended_at')
          .eq('id', session_id)
          .maybeSingle();
        const session = sessRes.data as {
          id: string;
          learner_id: string;
          test_mode: boolean;
          picked_item_ids: string[] | null;
          pinned_topic: string | null;
          started_at: string;
          ended_at: string | null;
        } | null;
        if (!session) {
          await send({ type: 'error', code: 'not_found', message: 'session not found' });
          return;
        }
        if (session.learner_id !== learner_id) {
          await send({ type: 'error', code: 'forbidden', message: 'wrong learner' });
          return;
        }
        if (session.ended_at) {
          await send({ type: 'error', code: 'session_ended', message: 'session already ended' });
          return;
        }

        // Idempotency — if this client_turn_id already produced a tutor
        // reply, replay it instead of re-charging credits.
        const dupRes = await supabase
          .from('conversation_turns')
          .select('id, turn_index')
          .eq('session_id', session_id)
          .eq('client_turn_id', body.client_turn_id)
          .maybeSingle();
        const dup = dupRes.data as { id: string; turn_index: number } | null;
        if (dup) {
          const replayRes = await supabase
            .from('conversation_turns')
            .select('id, role, content, verdict, advance_after, hint_given, intent')
            .eq('session_id', session_id)
            .gte('turn_index', dup.turn_index)
            .order('turn_index', { ascending: true })
            .limit(2);
          const rows = (replayRes.data ?? []) as Array<{
            id: string;
            role: 'learner' | 'tutor';
            content: string;
            verdict: string | null;
            advance_after: boolean | null;
            hint_given: boolean | null;
            intent: string | null;
          }>;
          const tutor = rows.find((r) => r.role === 'tutor');
          if (tutor) {
            await send({ type: 'reply', text: tutor.content });
            await send({
              type: 'done',
              verdict: tutor.verdict,
              advance: tutor.advance_after === true,
              hint_given: tutor.hint_given === true,
              intent: tutor.intent ?? 'evaluate',
              learner_turn_id: dup.id,
              tutor_turn_id: tutor.id,
              credits_used: 0,
              replayed: true,
            });
          }
          return;
        }

        // Load turns (oldest first).
        const turnsRes = await supabase
          .from('conversation_turns')
          .select(
            'id, item_id, turn_index, role, kind, content, verdict, advance_after, hint_given, created_at',
          )
          .eq('session_id', session_id)
          .order('turn_index', { ascending: true });
        const allTurns = (turnsRes.data ?? []) as Array<{
          id: string;
          item_id: string | null;
          turn_index: number;
          role: 'learner' | 'tutor' | 'system';
          kind: string;
          content: string;
          verdict: 'correct' | 'partially_correct' | 'incorrect' | 'skipped' | null;
          advance_after: boolean | null;
          hint_given: boolean | null;
          created_at: string;
        }>;

        // Resolve current item: the last tutor turn that hasn't yet
        // been followed by an advance_after=true.
        const queue = (session.picked_item_ids ?? []) as string[];
        const currentItemId = resolveCurrentItemId(queue, allTurns);
        if (!currentItemId) {
          // Session has run out of items.
          await send({
            type: 'done',
            verdict: null,
            advance: false,
            hint_given: false,
            intent: 'break_suggest',
            session_complete: true,
            credits_used: 0,
          });
          return;
        }

        const itemRes = await supabase
          .from('items')
          .select('*')
          .eq('id', currentItemId)
          .maybeSingle();
        const item = itemRes.data as Record<string, unknown> | null;
        if (!item) {
          await send({ type: 'error', code: 'not_found', message: 'current item missing' });
          return;
        }

        // Material grounding (clamped).
        let materialContext: string | null = null;
        const materialId = item.material_id as string | null;
        if (materialId) {
          const m = await supabase
            .from('materials')
            .select('extracted_markdown')
            .eq('id', materialId)
            .maybeSingle();
          materialContext =
            (
              (m.data as { extracted_markdown: string | null } | null)?.extracted_markdown ?? ''
            ).slice(0, 4000) || null;
        }

        const learnerRow = await supabase
          .from('learners')
          .select('display_name, grade_level, ui_locale')
          .eq('id', learner_id)
          .maybeSingle();
        const learner = (learnerRow.data ?? null) as {
          display_name: string | null;
          grade_level: number | null;
          ui_locale: string | null;
        } | null;
        const locale = ((learner?.ui_locale ?? 'de') as Locale) ?? ('de' as Locale);

        // Voice transcription if audio supplied.
        let learnerText = (body.text ?? '').trim();
        if (!learnerText && body.audio_base64) {
          const transcript = await llm.transcribeAudio({
            audioBase64: body.audio_base64,
            mimeType: body.audio_mime ?? 'audio/m4a',
            locale,
          });
          learnerText = transcript.text.trim();
          await send({ type: 'transcript', text: learnerText });
        }
        if (!learnerText) {
          await send({ type: 'error', code: 'validation_failed', message: 'empty message' });
          return;
        }

        // Compute hint count + prior wrong attempts on THIS item from the
        // server-recorded tutor turns (the model can lie; we cannot).
        const tutorOnItem = allTurns.filter(
          (t) => t.role === 'tutor' && t.item_id === currentItemId,
        );
        const hintsGivenForItem = tutorOnItem.filter((t) => t.hint_given === true).length;
        const priorWrongAttemptsOnItem = tutorOnItem.filter(
          (t) =>
            t.verdict === 'incorrect' ||
            t.verdict === 'skipped' ||
            t.verdict === 'partially_correct',
        ).length;

        // Persist the learner turn first so it's part of the history the
        // model sees on the next call (and so idempotency works).
        const nextIndex = allTurns.reduce((m, t) => Math.max(m, t.turn_index), -1) + 1;
        const learnerInsert = await supabase
          .from('conversation_turns')
          .insert({
            session_id,
            learner_id,
            item_id: currentItemId,
            turn_index: nextIndex,
            role: 'learner',
            kind: 'answer',
            content: learnerText,
            client_turn_id: body.client_turn_id,
            mode: body.audio_base64 ? 'voice' : 'text',
          })
          .select('id')
          .single();
        const learnerTurnId = (learnerInsert.data as { id: string } | null)?.id ?? null;

        // Build the agent input and call the LLM.
        const itemCtx: AgentItemContext = {
          itemId: currentItemId,
          question: String(item.question ?? ''),
          expectedAnswer: String(item.expected_answer ?? ''),
          acceptableAnswers: (item.acceptable_answers as string[] | null) ?? [],
          answerKind: (item.answer_kind as AgentItemContext['answerKind']) ?? 'short',
          topic: (item.topic as string | null) ?? null,
          difficulty: Number(item.difficulty ?? 2),
          mcOptions: (item.mc_options as string[] | null) ?? null,
          mcCorrectIndex: (item.mc_correct_index as number | null) ?? null,
          units: (item.units as string | null) ?? null,
          sourceExcerpt: (item.source_excerpt as string | null) ?? null,
        };

        // Bound the history to last 40 messages (20 exchanges).
        const HIST_MAX = 40;
        const history: AgentThreadMessage[] = allTurns
          .filter((t) => t.role === 'learner' || t.role === 'tutor')
          .map((t) => ({
            role: t.role === 'tutor' ? ('tutor' as const) : ('learner' as const),
            content: t.content,
          }))
          .slice(-HIST_MAX);

        const itemsAnsweredCount = countAdvancedItems(allTurns);
        const sessionStartedMs = Date.parse(session.started_at);
        const minutesElapsed = Number.isFinite(sessionStartedMs)
          ? Math.max(0, Math.round((now().getTime() - sessionStartedMs) / 60_000))
          : 0;

        const systemInstruction = buildAgentSystemInstruction({
          learner: {
            displayName: learner?.display_name ?? null,
            gradeLevel: learner?.grade_level ?? 7,
            locale,
          },
          currentItem: itemCtx,
          materialContext,
          hintsGivenForItem,
          priorWrongAttemptsOnItem,
          history,
          learnerMessage: learnerText,
          session: {
            itemsTotal: queue.length,
            itemsRemaining: Math.max(0, queue.length - itemsAnsweredCount),
            minutesElapsed,
            testMode: session.test_mode,
          },
        });

        let agentResult;
        try {
          agentResult = await llm.agentTurn({
            systemInstruction,
            history,
            learnerMessage: learnerText,
          });
        } catch (err) {
          await send({
            type: 'error',
            code: 'evaluation_failed',
            message: err instanceof Error ? err.message : String(err),
          });
          return;
        }

        const parsed = parseAgentJson(agentResult.json);
        // Stream the reply as a single chunk for now — strict-JSON
        // streaming would need an incremental parser.
        if (parsed.reply) await send({ type: 'reply', text: parsed.reply });

        // Persist tutor turn.
        const tutorIndex = nextIndex + 1;
        const tutorInsert = await supabase
          .from('conversation_turns')
          .insert({
            session_id,
            learner_id,
            item_id: currentItemId,
            turn_index: tutorIndex,
            role: 'tutor',
            kind: parsed.reveal ? 'reveal' : parsed.hint_given ? 'hint' : 'feedback',
            content: parsed.reply,
            verdict: parsed.verdict,
            intent: parsed.intent,
            hint_given: parsed.hint_given,
            advance_after: parsed.advance,
          })
          .select('id')
          .single();
        const tutorTurnId = (tutorInsert.data as { id: string } | null)?.id ?? null;

        // If the model decided to advance, optionally prepend the NEXT
        // question text as its own tutor turn for clean transcript
        // segmentation. The model already included the transition in
        // `reply`, so we don't persist a duplicate question — the next
        // /turn call will resolve the new currentItemId via the queue.

        await send({
          type: 'done',
          verdict: parsed.verdict,
          advance: parsed.advance,
          reveal: parsed.reveal,
          hint_given: parsed.hint_given,
          intent: parsed.intent,
          learner_turn_id: learnerTurnId,
          tutor_turn_id: tutorTurnId,
          credits_used: Math.max(1, Math.round(agentResult.usage.cost_usd_micros / 100)),
          prompt_version: agentResult.usage.prompt_version,
          model: agentResult.usage.model,
          replayed: false,
        });
      } catch (err) {
        try {
          await send({
            type: 'error',
            code: 'internal',
            message: err instanceof Error ? err.message : String(err),
          });
        } catch {
          /* stream may already be closed */
        }
      }
    });
  },
);

// ── Finish ────────────────────────────────────────────────────────────────

agentRoutes.patch('/sessions/:sessionId/finish', async (c) => {
  const { supabase, now } = getDeps(c);
  const learner_id = c.get('learner_id');
  if (!learner_id) throw new ApiError('unauthenticated', 'Missing learner context');
  const session_id = c.req.param('sessionId');
  const upd = await supabase
    .from('sessions')
    .update({ ended_at: now().toISOString() })
    .eq('id', session_id)
    .eq('learner_id', learner_id)
    .select('id, ended_at')
    .single();
  if (upd.error) {
    throw new ApiError('internal', 'Failed to end session', { cause: upd.error.message });
  }
  // Reflective summary deferred — same fire-and-forget hook can be added
  // later. Keeping this commit's surface area tight.
  return c.json({ session_id, ended: true, prompt_version: AGENT_PROMPT_VERSION });
});

// ── Helpers ──────────────────────────────────────────────────────────────

function buildLocalOpener(name: string | null, locale: Locale): string {
  const n = name?.trim() ?? '';
  const greet =
    locale === 'en'
      ? n
        ? `Hi ${n}! Ready to dig in?`
        : 'Hi there! Ready to dig in?'
      : locale === 'fr'
        ? n
          ? `Salut ${n} ! On y va ?`
          : 'Salut ! On y va ?'
        : locale === 'es'
          ? n
            ? `¡Hola ${n}! ¿Empezamos?`
            : '¡Hola! ¿Empezamos?'
          : locale === 'it'
            ? n
              ? `Ciao ${n}! Pronti?`
              : 'Ciao! Pronti?'
            : n
              ? `Hi ${n}! Sollen wir loslegen?`
              : 'Hi! Sollen wir loslegen?';
  return greet;
}

/** Walk the persisted turns and figure out which item from the queue
 *  is currently open. An item is "advanced past" once its last tutor
 *  turn carries `advance_after = true`. */
function resolveCurrentItemId(
  queue: string[],
  turns: Array<{ item_id: string | null; role: string; advance_after: boolean | null }>,
): string | null {
  if (queue.length === 0) return null;
  const advanced = new Set<string>();
  for (const t of turns) {
    if (t.role === 'tutor' && t.item_id && t.advance_after === true) advanced.add(t.item_id);
  }
  for (const id of queue) {
    if (!advanced.has(id)) return id;
  }
  return null;
}

function countAdvancedItems(
  turns: Array<{ role: string; advance_after: boolean | null; item_id: string | null }>,
): number {
  const advanced = new Set<string>();
  for (const t of turns) {
    if (t.role === 'tutor' && t.item_id && t.advance_after === true) advanced.add(t.item_id);
  }
  return advanced.size;
}

// Shared item picker — reuses the same RPC the legacy /sessions route
// uses. Kept inline rather than imported so this file is self-contained
// and the legacy module can be deleted later without breaking us.
async function pickItems(
  supabase: ReturnType<typeof getDeps>['supabase'],
  i: {
    learner_id: string;
    subject_id: string | null;
    folder_id: string | null;
    material_id: string | null;
    max_items: number;
    now: string;
  },
): Promise<Array<Record<string, unknown>>> {
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
      const byId = new Map(
        ((items.data ?? []) as Array<Record<string, unknown>>).map((it) => [it.id as string, it]),
      );
      return itemIds.map((id) => byId.get(id)).filter((it): it is Record<string, unknown> => !!it);
    }
  }
  let q = supabase.from('items').select('*').eq('learner_id', i.learner_id).is('archived_at', null);
  if (i.material_id) q = q.eq('material_id', i.material_id);
  const items = await q;
  if (items.error) {
    throw new ApiError('internal', 'Failed to load items', { cause: items.error.message });
  }
  return ((items.data ?? []) as Array<Record<string, unknown>>).slice(0, i.max_items);
}
