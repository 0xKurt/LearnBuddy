# ADR 0003 — Capture → extraction must be durable (not a held-open stream)

- Status: accepted (problem + target design); implementation **in progress**
- Date: 2026-05-19
- Relates to: docs/04-api.md §POST /materials, docs/06-ai-pipeline.md §P1,
  docs/08-cost-and-credits.md §atomic-debit.

## Context (the bug a parent hit on first use)

Scanning 3 worksheet photos failed with "connection interrupted, processing
continues in the background", the material list then showed an error with
only a delete option, and there was no way to refresh or retry. Root causes,
confirmed in code:

1. **Extraction runs entirely inside one held-open SSE HTTP response**
   (`apps/api/src/routes/materials.ts` `POST /materials`). There is **no**
   server-side job/queue/worker. If the client connection drops — or the
   multi-minute Vertex call exceeds the 300 s function budget
   (`vercel.json`) — the handler dies and the material is stranded in
   `extraction_status='pending'` forever. The credit was pre-debited and is
   **not refunded** on a raw disconnect.
2. **The "continues in the background" message is false** — no worker, cron,
   or outbox processes materials. (The recent offline outbox covers practice
   attempts only.) The mobile copy has now been corrected to tell the truth
   (this commit).
3. **No SSE heartbeat**, so carrier/proxy idle timeouts sever the long quiet
   gap during the Vertex call — the exact "Verbindung unterbrochen".
4. **No idempotency**: the retry button re-runs `reserveMaterial`, inserting
   a _new_ `materials` row and pre-debiting credits _again_ (double charge,
   orphaned rows).
5. **Stuck `pending` is unrecoverable**: no client polling, no
   pull-to-refresh, no server sweep; failed materials offer only delete.
6. **Camera-only** capture (`expo-image-picker` is not a dependency).
7. **Hard 10-image cap** at every layer (`MAX_PHOTOS`, shared-types
   `.max(10)`, Vertex guard) — 20 sheets is structurally impossible. Note:
   simply raising the cap **without** decoupling extraction would make
   reliability _worse_ (longer Vertex call vs. the same 300 s budget), so
   the cap raise is deliberately coupled to the durability work below, not
   shipped alone.

## Decision (target architecture)

Decouple extraction from the client connection:

1. `POST /materials` enqueues a durable job and returns immediately
   (`extraction_status='pending'`, job row persisted). No LLM work in the
   request.
2. A worker (Supabase Edge Function or equivalent) performs extraction,
   updates `extraction_status` → `ready`/`failed`, settles/refunds credits.
3. A `pg_cron` sweep (pattern of `infra/supabase/migrations/0011_*`) picks
   up jobs stuck `pending` past a TTL, marks them `failed`, and **refunds**
   the pre-debit so credits never leak on a dropped connection.
4. Mobile **polls** material status (or pull-to-refresh) instead of holding
   an SSE stream open; the progress screen reads job state.
5. `POST /materials` and a new idempotent `POST /materials/:id/retry`
   share one extraction routine; retry reuses the existing material + the
   already-uploaded photos (they live 7 days per the photo-wipe schedule) —
   no new row, no double debit. Failed/stuck materials get a **Retry**
   action in the list (not just delete).
6. SSE heartbeat (if any streaming is kept for live progress).
7. Gallery import via `expo-image-picker` as an alternate source.
8. Image cap raised toward ~20 **with** Vertex calls chunked/batched so the
   per-call budget is respected.

## Status / why this ADR ships before the code

Phases 0–2 (LLM correctness, honest grading + FSRS, material grounding) are
done and verified by the test suite + bundle smoke. This durability rework
is a backend project whose correctness depends on a live Supabase + Vertex +
`pg_cron` deployment that cannot be exercised by the unit harness here.
Per CLAUDE.md ("never ship half-built; when you genuinely can't verify,
stop and document") it is specified here as the next implementation slice
rather than landed unvalidated. The one safe, truthful change made now is
removing the false "processing in the background" claim from the UI.

## Consequences

- Until the worker lands, a dropped connection still loses a material, but
  the UI no longer lies about it and tells the user to re-scan.
- The job/worker introduces a `materials` job-state column or a jobs table —
  a new migration (immutable once merged).
- Credit settle/refund logic moves into the worker + sweep; the atomic-debit
  contract (docs/08) is preserved (pre-debit on enqueue, settle/refund on
  terminal state).
