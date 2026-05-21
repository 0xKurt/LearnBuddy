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
import { applyAttempt, type ItemStateRow } from '../lib/fsrs.js';
import { reflectAndPersistSession } from '../lib/reflective/session-reflect.js';
import { getDeps } from '../lib/deps.js';
import { ApiError } from '../lib/errors.js';
import type { Locale } from '@learnbuddy/shared-types';
import { requireAuth, requireLearnerContext } from '../middleware/auth.js';
import { rateLimit } from '../middleware/rate-limit.js';

export const agentRoutes = new Hono();
agentRoutes.use('*', requireAuth, requireLearnerContext);

/** Wrap a promise with a hard deadline. On timeout the returned promise
 *  rejects with an ApiError so the SSE outer try/catch can send a
 *  proper `error` event instead of letting the stream hang forever.
 *  Failure modes we've actually hit in prod: GCP STT first-call cold
 *  start, Vertex regional outage, TTS quota exhausted. */
function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => {
      reject(new ApiError('evaluation_failed', `${label} timed out after ${ms}ms`));
    }, ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (err) => {
        clearTimeout(t);
        reject(err);
      },
    );
  });
}

// ── Session start ──────────────────────────────────────────────────────────

const SessionCreateBody = z.object({
  subject_id: z.string().uuid().nullable().optional(),
  folder_id: z.string().uuid().nullable().optional(),
  material_id: z.string().uuid().nullable().optional(),
  /** Filter items by their auto-extracted topic label. Used by the
   *  Thema-detail screen so the tutor session covers exactly one topic
   *  (e.g. "Bruchrechnung"). Bypasses the FSRS-aware RPC and pulls items
   *  directly with topic = X — kids who tap a topic want to study THAT,
   *  not whatever the scheduler thinks is due. */
  topic: z.string().min(1).max(120).nullable().optional(),
  test_mode: z.boolean().default(false),
  max_items: z.number().int().min(1).max(50).default(20),
});

agentRoutes.post(
  '/sessions',
  rateLimit({ key: 'agent_sessions_create', per_hour: 60 }),
  zValidator('json', SessionCreateBody),
  async (c) => {
    const { supabase, tts, now } = getDeps(c);
    const learner_id = c.get('learner_id');
    if (!learner_id) throw new ApiError('unauthenticated', 'Missing learner context');
    const body = c.req.valid('json');
    const nowIso = now().toISOString();

    const learnerRow = await supabase
      .from('learners')
      .select('display_name, grade_level, ui_locale, tts_voice')
      .eq('id', learner_id)
      .maybeSingle();
    const learner = (learnerRow.data ?? null) as {
      display_name: string | null;
      grade_level: number | null;
      ui_locale: string | null;
      tts_voice: string | null;
    } | null;
    const locale = ((learner?.ui_locale ?? 'de') as Locale) ?? ('de' as Locale);
    const ttsVoice = learner?.tts_voice ?? null;

    const items = await pickItems(supabase, {
      learner_id,
      subject_id: body.subject_id ?? null,
      folder_id: body.folder_id ?? null,
      material_id: body.material_id ?? null,
      topic: body.topic ?? null,
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

    // Friendly opener + first question, persisted as ONE tutor turn.
    // We must not seed two consecutive tutor entries because Gemini's
    // `contents` requires alternating user/model — back-to-back model
    // turns produce flaky output. Joining them in one bubble also reads
    // more naturally on the client.
    const firstItem = items[0]!;
    const opener = buildLocalOpener(learner?.display_name ?? null, locale);
    const firstQuestion = String(firstItem.question);
    const seedContent = `${opener}\n\n${firstQuestion}`;
    await supabase.from('conversation_turns').insert({
      session_id: session.id,
      learner_id,
      item_id: firstItem.id as string,
      turn_index: 0,
      role: 'tutor',
      kind: 'question',
      content: seedContent,
      intent: 'introduce_next',
    });

    // Synthesise the opener so the chat screen reads it aloud on start
    // — same Chirp HD voice and rate as the per-turn replies. Failure
    // (incl. timeout) is non-blocking: the screen still shows the text.
    let openerAudio: { base64: string; mime: string; durationMs: number } | null = null;
    try {
      const synth = await withTimeout(
        tts.synthesize({ text: seedContent, locale, rate: 1.0, voiceId: ttsVoice }),
        8_000,
        'opener TTS',
      );
      openerAudio = {
        base64: synth.audioBase64,
        mime: synth.mime,
        durationMs: synth.durationMs,
      };
    } catch (err) {
      console.warn(
        `[agent] opener TTS synthesize failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    return c.json(
      {
        session_id: session.id,
        items,
        opener,
        first_question: firstQuestion,
        audio: openerAudio,
      },
      201,
    );
  },
);

// ── Transcribe-only (no LLM tutor call) ────────────────────────────────────
//
// The composer's mic button uses this when the kid wants the spoken
// text to land in the input field for review/edit before sending.
// `/sessions/:id/turn` always runs the full pedagogy cycle; this route
// is intentionally narrow — audio in, plain text out.

const TranscribeBody = z.object({
  audio_base64: z.string().min(1).max(8_000_000),
  audio_mime: z.enum(['audio/m4a', 'audio/mp4', 'audio/wav', 'audio/webm']),
});

// Fire-and-forget pre-warm: the mobile app pings this the instant the
// user taps the mic so the Vercel function and the GCP STT gRPC channel
// are both warm by the time the actual audio arrives. Returns 200 fast
// — the warmup itself is awaited so a cold gRPC handshake doesn't kick
// over to the user's recognize() call.
agentRoutes.post(
  '/transcribe/warm',
  rateLimit({ key: 'agent_transcribe_warm', per_hour: 6000 }),
  async (c) => {
    const { stt } = getDeps(c);
    await stt.warmup();
    return c.json({ ok: true });
  },
);

agentRoutes.post(
  '/transcribe',
  rateLimit({ key: 'agent_transcribe', per_hour: 600 }),
  zValidator('json', TranscribeBody),
  async (c) => {
    const { supabase, stt } = getDeps(c);
    const learner_id = c.get('learner_id');
    if (!learner_id) throw new ApiError('unauthenticated', 'Missing learner context');
    const body = c.req.valid('json');

    // Pull learner's UI locale as a HINT only — chirp_2 still auto-
    // detects, so a German learner answering in English on an English
    // vocab item still gets transcribed correctly.
    const learnerRow = await supabase
      .from('learners')
      .select('ui_locale')
      .eq('id', learner_id)
      .maybeSingle();
    const preferredLocale =
      ((learnerRow.data as { ui_locale: string | null } | null)?.ui_locale as Locale | null) ??
      null;

    const res = await stt.recognize({
      audioBase64: body.audio_base64,
      mime: body.audio_mime,
      preferredLocale,
    });
    return c.json({
      text: res.text,
      detected_locale: res.detectedLocale,
      confidence: res.confidence,
    });
  },
);

// ── Voice sample (preview for the admin → Stimme settings screen) ─────────
//
// Synthesises one short, friendly phrase in the requested voice and the
// learner's UI locale, returns the MP3 base64. The settings screen plays
// it via the existing `playTtsAudio` helper so the kid hears the voice
// BEFORE committing to it. No DB writes — selecting is a separate
// PATCH /learners call.

const VoiceSampleBody = z.object({
  voice: z.string().min(1).max(40),
});

// One short, natural-sounding sample per locale. ~2 sentences = ~3–5 s of
// audio — enough to judge the voice character (pitch, warmth, pacing)
// without wasting TTS budget. Kept simple and inviting; no brand-name
// gymnastics ("Ich bin deine LearnBuddy-Stimme" reads weirdly in German
// and the equivalent in romance languages too).
const SAMPLE_PHRASE_BY_LOCALE: Record<string, string> = {
  de: 'Hallo! Schön, dass du da bist. Lass uns gemeinsam etwas Neues lernen.',
  en: "Hello! I'm glad you're here. Let's learn something new together.",
  fr: 'Bonjour ! Ravie de te voir. On va apprendre quelque chose de nouveau ensemble.',
  es: '¡Hola! Qué bien tenerte aquí. Vamos a aprender algo nuevo juntos.',
  it: 'Ciao! Che bello averti qui. Impariamo qualcosa di nuovo insieme.',
};

agentRoutes.post(
  '/voice/sample',
  rateLimit({ key: 'agent_voice_sample', per_hour: 120 }),
  zValidator('json', VoiceSampleBody),
  async (c) => {
    const { supabase, tts } = getDeps(c);
    const learner_id = c.get('learner_id');
    if (!learner_id) throw new ApiError('unauthenticated', 'Missing learner context');
    const { voice } = c.req.valid('json');

    const learnerRow = await supabase
      .from('learners')
      .select('ui_locale')
      .eq('id', learner_id)
      .maybeSingle();
    const locale = (((learnerRow.data as { ui_locale: string | null } | null)
      ?.ui_locale as Locale | null) ?? 'de') as Locale;
    const text = SAMPLE_PHRASE_BY_LOCALE[locale] ?? SAMPLE_PHRASE_BY_LOCALE['de']!;

    const synth = await tts.synthesize({ text, locale, rate: 1.0, voiceId: voice });
    return c.json({
      audio: {
        base64: synth.audioBase64,
        mime: synth.mime,
        durationMs: synth.durationMs,
      },
    });
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
    const { supabase, llm, stt, tts, now } = getDeps(c);
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
        // reply, replay it instead of re-charging credits. If a prior
        // attempt inserted the learner row but the LLM call failed
        // (no tutor row exists), DELETE the orphan learner row and
        // proceed as a fresh turn — otherwise the client would hang
        // waiting for a `done` event we can't synthesize honestly.
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
            return;
          }
          // Orphan learner row — delete it and fall through. Without
          // this the client retries forever.
          await supabase.from('conversation_turns').delete().eq('id', dup.id);
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
          .select('display_name, grade_level, ui_locale, tts_voice')
          .eq('id', learner_id)
          .maybeSingle();
        const learner = (learnerRow.data ?? null) as {
          display_name: string | null;
          grade_level: number | null;
          ui_locale: string | null;
          tts_voice: string | null;
        } | null;
        const locale = ((learner?.ui_locale ?? 'de') as Locale) ?? ('de' as Locale);
        const ttsVoice = learner?.tts_voice ?? null;

        // Voice transcription if audio supplied. GCP Speech-to-Text v2
        // chirp_2 with multilingual auto-detect: the German UI locale is
        // a hint only, the learner can answer in any of the supported
        // languages and it'll still come through (key feature for a
        // language-learning app).
        let learnerText = (body.text ?? '').trim();
        if (!learnerText && body.audio_base64) {
          const transcript = await withTimeout(
            stt.recognize({
              audioBase64: body.audio_base64,
              mime: body.audio_mime ?? 'audio/m4a',
              preferredLocale: locale,
            }),
            25_000,
            'STT',
          );
          learnerText = transcript.text.trim();
          if (learnerText) await send({ type: 'transcript', text: learnerText });
        }
        if (!learnerText) {
          // Empty: either pure silence, hallucination filtered, or noise.
          // We DON'T fail the turn — just signal end-of-stream gracefully
          // so the client can re-open the mic without a scary error.
          await send({ type: 'error', code: 'silent', message: 'no speech detected' });
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
          agentResult = await withTimeout(
            llm.agentTurn({
              systemInstruction,
              history,
              learnerMessage: learnerText,
            }),
            45_000,
            'agent LLM',
          );
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

        // Parallelise tutor-turn persistence and TTS synthesis. They're
        // independent: the DB write needs only the parsed reply + verdict,
        // and TTS needs only the reply text + locale + voice. Running
        // them sequentially used to add ~50-200 ms (DB) on top of the
        // 1-3 s TTS — pure waste in the gap between text-arrives and
        // voice-starts that the user perceived as latency.
        const tutorIndex = nextIndex + 1;
        const persistTutorTurn = supabase
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
        const synthTts = parsed.reply
          ? withTimeout(
              tts.synthesize({ text: parsed.reply, locale, rate: 1.0, voiceId: ttsVoice }),
              8_000,
              'per-turn TTS',
            ).catch((err: unknown) => {
              console.warn(
                `[agent] TTS synthesize failed: ${
                  err instanceof Error ? err.message : String(err)
                }`,
              );
              return null;
            })
          : Promise.resolve(null);

        const [tutorInsert, synthResult] = await Promise.all([persistTutorTurn, synthTts]);
        const tutorTurnId = (tutorInsert.data as { id: string } | null)?.id ?? null;
        const ttsAudio = synthResult
          ? {
              base64: synthResult.audioBase64,
              mime: synthResult.mime,
              durationMs: synthResult.durationMs,
            }
          : null;

        // FSRS update: every verdict advances the item_state row. The
        // hint-aware effort signal downgrades a scaffolded `correct`
        // to Hard so the next-due interval reflects partial mastery.
        // Fire-and-forget — a transient DB hiccup shouldn't fail the
        // turn the learner already got a reply for.
        if (parsed.verdict) {
          void updateItemState(supabase, {
            learner_id,
            item_id: currentItemId,
            verdict: parsed.verdict,
            reviewedAt: now(),
            effort: {
              hintsUsed: hintsGivenForItem + (parsed.hint_given ? 1 : 0),
              priorWrongAttempts: priorWrongAttemptsOnItem,
            },
          }).catch((err: unknown) => {
            console.warn(
              `[agent] FSRS update failed for item ${currentItemId}: ${
                err instanceof Error ? err.message : String(err)
              }`,
            );
          });
        }

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
          audio: ttsAudio,
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
  const { supabase, llm, now } = getDeps(c);
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
  // Reflective summary — fire-and-forget. Writes a learner_episodes row
  // + bumps recurring_misconceptions. The opener for the next session
  // reads from this. Don't block the response on it; the LLM call can
  // take several seconds.
  void reflectAndPersistSession({ supabase, llm, now }, { session_id, learner_id }).catch(
    (err: unknown) => {
      console.warn(
        `[agent] reflect failed for ${session_id}: ${err instanceof Error ? err.message : String(err)}`,
      );
    },
  );
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
    topic: string | null;
    max_items: number;
    now: string;
  },
): Promise<Array<Record<string, unknown>>> {
  // Topic-scoped picks bypass the FSRS RPC: when the kid taps a topic
  // they want to study THAT topic, not whatever the scheduler thinks is
  // due. Filter items directly. The "Allgemein" bucket includes items
  // with NULL/empty topic too — mirrors the topic-items list endpoint
  // so what the kid sees is what the tutor gets.
  if (i.topic) {
    const isAllgemein = i.topic.trim().toLowerCase() === 'allgemein';
    let q = supabase
      .from('items')
      .select('*')
      .eq('learner_id', i.learner_id)
      .is('archived_at', null)
      .limit(i.max_items);
    if (isAllgemein) {
      q = q.or('topic.is.null,topic.eq.,topic.ilike.allgemein');
    } else {
      q = q.ilike('topic', i.topic);
    }
    if (i.subject_id) {
      // Topic + subject — narrow to subject's materials. We rely on the
      // join via material_id; items don't carry subject_id directly.
      const mats = await supabase.from('materials').select('id').eq('subject_id', i.subject_id);
      const matIds = ((mats.data ?? []) as Array<{ id: string }>).map((m) => m.id);
      if (matIds.length === 0) return [];
      q = q.in('material_id', matIds);
    }
    const res = await q;
    if (res.error) {
      throw new ApiError('internal', 'Failed to load items', { cause: res.error.message });
    }
    return (res.data ?? []) as Array<Record<string, unknown>>;
  }

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

/** FSRS bookkeeping. Upserts the `item_states` row for (learner, item)
 *  based on the verdict + effort signal. Best-effort: any error is
 *  logged by the caller; the learner's turn already succeeded. */
async function updateItemState(
  supabase: ReturnType<typeof getDeps>['supabase'],
  args: {
    learner_id: string;
    item_id: string;
    verdict: 'correct' | 'partially_correct' | 'incorrect' | 'skipped';
    reviewedAt: Date;
    effort: { hintsUsed: number; priorWrongAttempts: number };
  },
): Promise<void> {
  const prevRes = await supabase
    .from('item_states')
    .select('*')
    .eq('learner_id', args.learner_id)
    .eq('item_id', args.item_id)
    .maybeSingle();
  const prev = (prevRes.data as ItemStateRow | null) ?? null;
  const next = applyAttempt(prev, args.verdict, args.reviewedAt, args.effort);
  if (prev) {
    const upd = await supabase
      .from('item_states')
      .update(next)
      .eq('learner_id', args.learner_id)
      .eq('item_id', args.item_id);
    if (upd.error) throw new Error(upd.error.message);
  } else {
    const ins = await supabase
      .from('item_states')
      .insert({ ...next, learner_id: args.learner_id, item_id: args.item_id });
    if (ins.error) throw new Error(ins.error.message);
  }
}
