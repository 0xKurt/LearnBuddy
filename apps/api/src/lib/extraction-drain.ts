// Drain the extraction_jobs queue.
//
// Shared by:
//   - POST /materials-worker/drain — the pg_cron endpoint that fires every
//     60 s in production (migration 0020).
//   - POST /materials and POST /materials/:id/retry — they kick this off
//     fire-and-forget right after enqueueing so local dev (where pg_cron
//     doesn't target the dev API) sees the job processed immediately.
//
// Each invocation processes up to MAX_PER_DRAIN jobs so wall-clock per call
// stays bounded — the cron / re-trigger picks up the rest on the next sweep.

import type { LLMGateway } from './llm/gateway.js';
import type { ServiceClient } from './supabase.js';
import { runExtraction, VISION_ESTIMATE } from './extraction.js';
import { sendExpoPush } from './notifications/expo-push.js';

type DrainDeps = {
  supabase: ServiceClient;
  llm: LLMGateway;
  now: () => Date;
};

type JobRow = {
  id: string;
  material_id: string;
  learner_id: string;
  account_id: string;
  subject_id: string;
  status: string;
  attempts: number;
  locale: string;
  title: string | null;
  client_quality_scores: Array<{ position: number }>;
};

export type DrainResult = {
  processed: number;
  results: Array<{ material_id: string; ok: boolean; error?: string }>;
};

const MAX_PER_DRAIN = 10;

export async function drainExtractionJobs(deps: DrainDeps): Promise<DrainResult> {
  const { supabase, llm, now } = deps;

  const queued = await supabase
    .from('extraction_jobs')
    .select('*')
    .eq('status', 'queued')
    .order('created_at', { ascending: true });
  if (queued.error) {
    throw new Error(`drain queue read failed: ${queued.error.message}`);
  }
  const jobs = ((queued.data ?? []) as JobRow[]).slice(0, MAX_PER_DRAIN);

  // Process the batch in parallel. Each `runExtraction` is bound by network +
  // Vertex latency (~30 s per material), so doing them serially leaves the
  // CPU idle while wall-clock piles up. Parallelism stays bounded by the
  // MAX_PER_DRAIN slice above so we don't spam Vertex with 50 concurrent
  // calls — the per-project quota is the next limit anyway.
  const settled = await Promise.all(
    jobs.map(async (job): Promise<DrainResult['results'][number] | null> => {
      // Claim atomically: only one worker may flip queued → running. We also
      // re-stamp credit_estimate from the in-process constant so the sweep's
      // refund (migration 0020 reads j.credit_estimate) can never drift out
      // of sync with the value the route used at debit time — single source
      // of truth is VISION_ESTIMATE in extraction.ts.
      const claim = await supabase
        .from('extraction_jobs')
        .update({
          status: 'running',
          attempts: job.attempts + 1,
          credit_estimate: VISION_ESTIMATE,
          started_at: now().toISOString(),
          updated_at: now().toISOString(),
        })
        .eq('id', job.id)
        .eq('status', 'queued')
        .select('id');
      const claimed = ((claim.data as Array<{ id: string }> | null) ?? []).length > 0;
      if (claim.error || !claimed) return null; // another worker took it

      const res = await runExtraction(
        { supabase, llm, now },
        {
          job_id: job.id,
          account_id: job.account_id,
          learner_id: job.learner_id,
          material_id: job.material_id,
          subject_id: job.subject_id,
          title: job.title,
          locale: job.locale,
          qualityScores: job.client_quality_scores ?? [],
        },
      );

      if (!res.ok) {
        // runExtraction's bail() already called markFailed + refund on the
        // material. Flip the job to 'failed' only if it's still 'running' —
        // if the sweep got here first the job is already 'failed' and this
        // no-ops (0 rows updated).
        await supabase
          .from('extraction_jobs')
          .update({
            status: 'failed',
            last_error: res.message,
            finished_at: now().toISOString(),
            updated_at: now().toISOString(),
          })
          .eq('id', job.id)
          .eq('status', 'running');
      }
      // On success: runExtraction committed the job to 'done' atomically
      // (inside the function) before calling settle. Nothing left to do.

      return {
        material_id: job.material_id,
        ok: res.ok,
        ...(res.ok ? {} : { error: res.message }),
      };
    }),
  );

  const results = settled.filter((r): r is DrainResult['results'][number] => r !== null);

  // Fire push notifications for any job that reached a terminal state.
  // Fire-and-forget — pushes are nice-to-have, must never block the drain.
  if (results.length > 0) {
    void notifyLearners(deps, jobs, results).catch((err) => {
      console.warn(
        `[drain] push notification dispatch failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    });
  }

  return { processed: results.length, results };
}

async function notifyLearners(
  deps: DrainDeps,
  jobs: JobRow[],
  results: DrainResult['results'],
): Promise<void> {
  const { supabase } = deps;

  // Build per-learner notification payloads. We notify on BOTH success
  // and failure so the user doesn't have to keep checking the list.
  const jobByMaterial = new Map(jobs.map((j) => [j.material_id, j]));
  type Note = { learnerId: string; materialId: string; ok: boolean; title: string | null };
  const notes: Note[] = [];
  for (const r of results) {
    const job = jobByMaterial.get(r.material_id);
    if (!job) continue;
    notes.push({
      learnerId: job.learner_id,
      materialId: r.material_id,
      ok: r.ok,
      title: job.title,
    });
  }
  if (notes.length === 0) return;

  const learnerIds = Array.from(new Set(notes.map((n) => n.learnerId)));
  const tokensRes = await supabase
    .from('learner_push_tokens')
    .select('learner_id, token')
    .in('learner_id', learnerIds);
  const tokensByLearner = new Map<string, string[]>();
  for (const row of (tokensRes.data ?? []) as Array<{ learner_id: string; token: string }>) {
    const list = tokensByLearner.get(row.learner_id) ?? [];
    list.push(row.token);
    tokensByLearner.set(row.learner_id, list);
  }

  // Pull learner ui_locale so messages land in the right language.
  const localeRes = await supabase.from('learners').select('id, ui_locale').in('id', learnerIds);
  const localeByLearner = new Map<string, string>();
  for (const row of (localeRes.data ?? []) as Array<{ id: string; ui_locale: string | null }>) {
    localeByLearner.set(row.id, row.ui_locale ?? 'de');
  }

  const messages: Array<{
    to: string;
    title: string;
    body: string;
    data: Record<string, unknown>;
    sound: 'default';
  }> = [];

  for (const n of notes) {
    const tokens = tokensByLearner.get(n.learnerId) ?? [];
    if (tokens.length === 0) continue;
    const locale = localeByLearner.get(n.learnerId) ?? 'de';
    const copy = pushCopy(locale, n.ok, n.title);
    for (const tok of tokens) {
      messages.push({
        to: tok,
        title: copy.title,
        body: copy.body,
        // `data.materialId` lets the mobile deep-link into the
        // material-detail screen when the user taps the notification.
        data: { materialId: n.materialId, kind: n.ok ? 'material_ready' : 'material_failed' },
        sound: 'default',
      });
    }
  }

  await sendExpoPush(messages);
}

// Minimal per-locale copy. We keep this in-server (rather than going
// through i18n) because the worker doesn't have a fully-wired i18n stack
// and the strings here are tiny + stable. Mirrors the keys in the mobile
// `home.json` material.notification section conceptually.
function pushCopy(
  locale: string,
  ok: boolean,
  materialTitle: string | null,
): {
  title: string;
  body: string;
} {
  const titleFallback: Record<string, string> = {
    de: 'dein Material',
    en: 'your material',
    fr: 'ton support',
    es: 'tu material',
    it: 'il tuo materiale',
  };
  const name = materialTitle ?? titleFallback[locale] ?? titleFallback.de;
  if (ok) {
    const copy: Record<string, { title: string; body: string }> = {
      de: { title: 'Material bereit', body: `${name} ist bereit zum Üben` },
      en: { title: 'Material ready', body: `${name} is ready to practise` },
      fr: { title: 'Support prêt', body: `${name} est prêt pour s'entraîner` },
      es: { title: 'Material listo', body: `${name} está listo para practicar` },
      it: { title: 'Materiale pronto', body: `${name} è pronto per esercitarti` },
    };
    return copy[locale] ?? copy.de!;
  }
  const copy: Record<string, { title: string; body: string }> = {
    de: {
      title: 'Hat nicht geklappt',
      body: `Wir konnten ${name} nicht lesen — bitte nochmal versuchen.`,
    },
    en: { title: 'Something went wrong', body: `We couldn't read ${name} — please try again.` },
    fr: { title: 'Échec', body: `Impossible de lire ${name} — réessaie.` },
    es: { title: 'Error', body: `No pudimos leer ${name} — inténtalo de nuevo.` },
    it: { title: 'Errore', body: `Non siamo riusciti a leggere ${name} — riprova.` },
  };
  return copy[locale] ?? copy.de!;
}
