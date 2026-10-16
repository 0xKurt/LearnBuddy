-- What Buddy's natural voice costs and how often its cache answers (issue #682, KI-Audit K9 / D-F10).
-- docs/architecture.md §Voice, docs/privacy.md.
--
-- Text to speech was nowhere counted: no row in `llm_calls`, no cost, so the price of a sentence read
-- aloud (Chirp 3: HD, $30 per 1M characters) and the use of the two caches were invisible. One row
-- per sentence asked for: numbers only, never the text (like `llm_calls`). Cost is the provider's
-- list price — a ceiling: the free monthly characters are not subtracted.

create table if not exists speech_calls (
  id uuid primary key default gen_random_uuid(),
  learner_id uuid not null references learners(id) on delete cascade,
  -- 'ok': synthesized now; 'cached': her own cache answered; 'shared': the picker's sample cache;
  -- 'error': the provider failed (the phone then reads with its own voice).
  outcome text not null check (outcome in ('ok', 'cached', 'shared', 'error')),
  characters int not null check (characters >= 0),
  latency_ms int not null default 0,
  cost_micros bigint not null default 0,
  error_kind text,
  created_at timestamptz not null
);

create index if not exists speech_calls_created_idx on speech_calls(created_at desc);
create index if not exists speech_calls_learner_idx on speech_calls(learner_id);

comment on table speech_calls is
  'One row per sentence Buddy''s natural voice was asked for: outcome, characters, latency, list-price cost. Never the text. Issue #682.';

alter table speech_calls enable row level security;
-- No policies: only the API (service role / owner) touches it.
