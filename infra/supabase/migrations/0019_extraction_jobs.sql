-- 0019 — Durable extraction jobs.
-- Source: docs/04-api.md §POST /materials, docs/06-ai-pipeline.md §P1,
--         docs/adr/0003-durable-extraction-pipeline.md.
--
-- Extraction used to run entirely inside the POST /materials HTTP response.
-- A dropped connection (or the 300s function budget) stranded the material
-- in 'pending' forever with the credit pre-debited and never refunded. This
-- table decouples the work: POST /materials enqueues a row here and returns
-- immediately; a worker (drain endpoint / edge function) processes it; a
-- pg_cron sweep (migration 0020) fails + refunds anything stuck too long.

create table extraction_jobs (
  id uuid primary key default gen_random_uuid(),
  material_id uuid not null references materials(id) on delete cascade,
  learner_id uuid not null references learners(id) on delete cascade,
  account_id uuid not null references accounts(id) on delete cascade,
  subject_id uuid not null references subjects(id) on delete cascade,
  status text not null default 'queued'
    check (status in ('queued','running','done','failed')),
  attempts smallint not null default 0,
  locale text not null default 'de',
  title text,
  client_quality_scores jsonb not null,
  credit_estimate int not null,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz
);

-- One job per material (retry reuses the same row, never duplicates).
create unique index extraction_jobs_material_idx on extraction_jobs(material_id);
-- Worker pickup + the stale-sweep both scan unfinished jobs oldest-first.
create index extraction_jobs_pickup_idx
  on extraction_jobs(status, created_at)
  where status in ('queued', 'running');

alter table extraction_jobs enable row level security;
-- No learner-facing policy: the API touches this table only via the service
-- role (worker/drain/sweep). Learners observe progress via materials.status.
