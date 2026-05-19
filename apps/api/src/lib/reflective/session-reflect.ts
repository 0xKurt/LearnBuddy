// Reflective layer — Phase C1.
//
// Builds a LearnerEpisode from a finished session and persists it to
// `learner_episodes`. ONE Vertex call per session (~500 output tokens).
// Called fire-and-forget from PATCH /sessions/:id/finish so the
// learner's "Fertig" tap doesn't block on Vertex.
//
// L2 (three tiers): this module is REFLECTIVE tier — off the learner's
// critical path. It must NOT be invoked synchronously from any turn-time
// request beyond the session-finish kickoff.
//
// L1 (the wall): the LLM prompt is shaped to describe WORK, not PERSON.
// The persisted episode never carries first-person characterizations of
// the learner; downstream consumers (next-session opener, recurring
// misconceptions) take it from there.

import type { Deps } from '../deps.js';
import { captureApiError } from '../sentry.js';

const MAX_TRANSCRIPT_TURNS = 60;

export type ReflectAndPersistResult = {
  episode_id: string | null;
  reason: 'ok' | 'no_turns' | 'no_session' | 'llm_failed' | 'persist_failed';
};

/** Reflect on a finished session and persist a LearnerEpisode row.
 *  Best-effort — failures are logged + reported to Sentry, never thrown,
 *  because the caller fires this asynchronously. */
export async function reflectAndPersistSession(
  deps: Pick<Deps, 'supabase' | 'llm' | 'now'>,
  args: { session_id: string; learner_id: string },
): Promise<ReflectAndPersistResult> {
  const { supabase, llm, now } = deps;

  const sessRes = await supabase
    .from('sessions')
    .select('id, learner_id, started_at, ended_at')
    .eq('id', args.session_id)
    .maybeSingle();
  const session = sessRes.data as {
    id: string;
    learner_id: string;
    started_at: string;
    ended_at: string | null;
  } | null;
  if (!session) return { episode_id: null, reason: 'no_session' };

  const turnsRes = await supabase
    .from('conversation_turns')
    .select('id, role, item_id, verdict, content, created_at, turn_index')
    .eq('session_id', args.session_id)
    .order('turn_index', { ascending: true });
  const turns = (turnsRes.data ?? []) as Array<{
    role: 'learner' | 'tutor' | 'system';
    item_id: string | null;
    verdict: 'correct' | 'partially_correct' | 'incorrect' | 'skipped' | null;
    content: string;
  }>;
  if (turns.length === 0) return { episode_id: null, reason: 'no_turns' };

  // Load item topics so the transcript carries pedagogical context.
  const itemIds = Array.from(new Set(turns.map((t) => t.item_id).filter((x): x is string => !!x)));
  const topicByItem = new Map<string, string | null>();
  if (itemIds.length > 0) {
    const itemsRes = await supabase.from('items').select('id, topic').in('id', itemIds);
    for (const r of (itemsRes.data ?? []) as Array<{ id: string; topic: string | null }>) {
      topicByItem.set(r.id, r.topic ?? null);
    }
  }

  const transcript = turns
    .filter((t) => t.role === 'learner' || t.role === 'tutor')
    .slice(-MAX_TRANSCRIPT_TURNS)
    .map((t) => ({
      role: t.role as 'learner' | 'tutor',
      verdict: t.verdict,
      item_topic: t.item_id ? (topicByItem.get(t.item_id) ?? null) : null,
      content: t.content,
    }));

  const endedAt = session.ended_at ?? now().toISOString();
  const startedMs = Date.parse(session.started_at);
  const endedMs = Date.parse(endedAt);
  const durationMinutes =
    Number.isFinite(startedMs) && Number.isFinite(endedMs)
      ? Math.max(0, Math.round((endedMs - startedMs) / 60_000))
      : 0;

  let summary;
  try {
    summary = await llm.reflectSession({ transcript, durationMinutes });
  } catch (err) {
    console.error(
      `[reflect] llm failed for session ${args.session_id}: ${err instanceof Error ? err.message : String(err)}`,
    );
    captureApiError(err, { session_id: args.session_id, learner_id: args.learner_id });
    return { episode_id: null, reason: 'llm_failed' };
  }

  const ins = await supabase
    .from('learner_episodes')
    .insert({
      session_id: args.session_id,
      learner_id: args.learner_id,
      ended_at: endedAt,
      duration_minutes: durationMinutes,
      one_sentence_arc: summary.one_sentence_arc,
      concepts_touched: summary.concepts_touched,
      high_points: summary.high_points,
      low_points: summary.low_points,
      hypothesized_misconceptions: summary.hypothesized_misconceptions,
      open_questions: summary.open_questions,
    })
    .select('id')
    .single();
  if (ins.error || !ins.data) {
    console.error(
      `[reflect] persist failed for session ${args.session_id}: ${ins.error?.message ?? 'no row'}`,
    );
    captureApiError(
      new Error(`learner_episodes insert failed: ${ins.error?.message ?? 'no row'}`),
      {
        session_id: args.session_id,
        learner_id: args.learner_id,
      },
    );
    return { episode_id: null, reason: 'persist_failed' };
  }

  // Update recurring_misconceptions: bump seen_count on existing tags,
  // insert new ones at confidence > 0.6. Per-row upsert keeps the
  // unique (learner_id, concept_tag) constraint clean.
  for (const m of summary.hypothesized_misconceptions) {
    if (m.confidence < 0.6) continue;
    const existing = await supabase
      .from('recurring_misconceptions')
      .select('id, seen_count')
      .eq('learner_id', args.learner_id)
      .eq('concept_tag', m.concept_tag)
      .maybeSingle();
    if (existing.data) {
      const row = existing.data as { id: string; seen_count: number };
      await supabase
        .from('recurring_misconceptions')
        .update({
          seen_count: row.seen_count + 1,
          last_seen_at: endedAt,
          description: m.description,
        })
        .eq('id', row.id);
    } else {
      await supabase.from('recurring_misconceptions').insert({
        learner_id: args.learner_id,
        concept_tag: m.concept_tag,
        description: m.description,
        first_seen_at: endedAt,
        last_seen_at: endedAt,
        seen_count: 1,
      });
    }
  }

  return { episode_id: (ins.data as { id: string }).id, reason: 'ok' };
}
