-- 0001 — LearnBuddy baseline (fresh start, 2026-09-25).
-- Source: docs/architecture.md, docs/adr/0004-proactive-buddy.md.
--
-- Replaces the legacy migrations 0001–0021 (see git history before this
-- commit). There is no data migration: the database is reset for this
-- release (decision recorded in ADR 0004 §Transition).
--
-- Conventions
--   * Every learner-owned row references learners(id) ON DELETE CASCADE, so
--     deleting the account (auth user → account → learner) removes everything.
--   * The API is the only client. It connects with a privileged role through
--     DATABASE_URL and scopes every query by the authenticated learner. RLS is
--     enabled on every table WITHOUT policies: anon/authenticated keys that
--     ship in the app can read or write nothing directly.
--   * Time-dependent decisions never use SQL now(); the API passes its clock
--     explicitly so behaviour is testable with simulated time. now() is only
--     used for audit columns (created_at/updated_at).
--   * Optimistic concurrency: rows the user or Buddy edit carry `version`;
--     buddy_settings.context_version fences whole Buddy decisions.

create extension if not exists pgcrypto;

create or replace function lb_touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ═══════════════════════════ identity ═══════════════════════════

create table accounts (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null unique references auth.users(id) on delete cascade,
  locale text not null default 'de' check (locale in ('de','en','fr','es','it')),
  consent_version text not null check (length(consent_version) between 1 and 40),
  consent_at timestamptz not null,
  -- Admin gate for minor profiles: scrypt hash "salt:hash" (hex), never the PIN.
  pin_hash text,
  pin_failed_count smallint not null default 0,
  pin_locked_until timestamptz,
  -- Account deletion with a cancellable hold (docs/privacy.md).
  deletion_due_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger accounts_touch before update on accounts
  for each row execute function lb_touch_updated_at();

create table learners (
  id uuid primary key default gen_random_uuid(),
  -- Exactly one learner per account (product rule).
  account_id uuid not null unique references accounts(id) on delete cascade,
  relation text not null check (relation in ('self','child')),
  display_name text not null check (length(display_name) between 1 and 40),
  birth_date date not null check (birth_date between date '1920-01-01' and date '2030-12-31'),
  -- What level questions and explanations are pitched at. Buddy asks for it
  -- in conversation when it is 'unknown' and matters for the next step.
  level text not null default 'unknown'
    check (level in ('unknown','school','university','adult')),
  grade smallint check (grade between 1 and 13),
  locale text not null default 'de' check (locale in ('de','en','fr','es','it')),
  -- DSGVO Art. 8: the account holder's consent for a learner under 16.
  minor_consent_version text,
  minor_consent_at timestamptz,
  version int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint learners_grade_only_in_school check (grade is null or level = 'school'),
  constraint learners_child_consent check (
    relation = 'self' or (minor_consent_version is not null and minor_consent_at is not null)
  )
);
create trigger learners_touch before update on learners
  for each row execute function lb_touch_updated_at();

-- ═══════════════════════════ Buddy: settings & contact ═══════════════════════════

create table buddy_settings (
  learner_id uuid primary key references learners(id) on delete cascade,
  timezone text not null default 'Europe/Berlin',
  -- Opt-in; off until the learner (adult) or account holder (minor) enables it.
  contact_enabled boolean not null default false,
  contact_changed_by text check (contact_changed_by in ('learner','account_holder')),
  contact_changed_at timestamptz,
  quiet_start time not null default '20:00',
  quiet_end time not null default '07:00',
  preferred_start time not null default '15:00',
  preferred_end time not null default '18:30',
  -- ISO weekdays (1 = Monday … 7 = Sunday) on which Buddy never reaches out.
  avoid_weekdays smallint[] not null default '{}'
    check (avoid_weekdays <@ array[1,2,3,4,5,6,7]::smallint[]),
  max_per_day smallint not null default 1 check (max_per_day between 0 and 3),
  max_per_week smallint not null default 4 check (max_per_week between 0 and 14),
  paused_until timestamptz,
  -- "Not now" on the contact opt-in card hides it until then.
  opt_in_prompt_hidden_until timestamptz,
  -- Incremented by every change Buddy's decisions depend on (messages,
  -- memory, goals, steps, settings, practice results). A decision made on an
  -- older version is stale and is not applied.
  context_version bigint not null default 1,
  -- Last authenticated request; outreach is skipped while the learner is in
  -- the app because the card is already on screen.
  last_seen_at timestamptz,
  -- Serialises background checks per learner (no two model calls at once).
  check_lease_token uuid,
  check_lease_until timestamptz,
  version int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint buddy_settings_window check (preferred_start < preferred_end)
);
create trigger buddy_settings_touch before update on buddy_settings
  for each row execute function lb_touch_updated_at();

-- ═══════════════════════════ learning material ═══════════════════════════

create table subjects (
  id uuid primary key default gen_random_uuid(),
  learner_id uuid not null references learners(id) on delete cascade,
  name text not null check (length(name) between 1 and 60),
  kind text not null default 'other' check (kind in (
    'math','physics','chemistry','biology','geography','history','german','english',
    'french','spanish','latin','other_language','religion_ethics','art_music',
    'computer_science','economics','social_studies','other'
  )),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);
create unique index subjects_learner_name_idx on subjects(learner_id, lower(name))
  where archived_at is null;
create trigger subjects_touch before update on subjects
  for each row execute function lb_touch_updated_at();

-- ═══════════════════════════ Buddy: plans ═══════════════════════════

create table buddy_goals (
  id uuid primary key default gen_random_uuid(),
  learner_id uuid not null references learners(id) on delete cascade,
  kind text not null check (kind in ('exam','topic')),
  title text not null check (length(title) between 1 and 120),
  subject_id uuid references subjects(id) on delete set null,
  -- The goal owns its date (exam day, learner-local calendar date).
  due_date date,
  topics text[] not null default '{}',
  status text not null default 'active' check (status in ('active','done','dropped')),
  outcome text check (outcome in ('good','ok','hard')),
  version int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  closed_at timestamptz,
  constraint buddy_goals_exam_has_date check (kind <> 'exam' or due_date is not null)
);
create index buddy_goals_learner_idx on buddy_goals(learner_id, status);
create trigger buddy_goals_touch before update on buddy_goals
  for each row execute function lb_touch_updated_at();

create table materials (
  id uuid primary key default gen_random_uuid(),
  learner_id uuid not null references learners(id) on delete cascade,
  -- Idempotency for "create material" retries from the app.
  client_request_id uuid not null,
  subject_id uuid references subjects(id) on delete set null,
  goal_id uuid references buddy_goals(id) on delete set null,
  title text check (title is null or length(title) between 1 and 120),
  -- The capture step this photo answers (Buddy asked for it); done on success.
  step_id uuid,
  status text not null default 'awaiting_upload' check (status in (
    'awaiting_upload','queued','processing','ready','failed'
  )),
  photo_count smallint not null check (photo_count between 1 and 20),
  extracted_text text,
  language text,
  failure_reason text check (failure_reason in (
    'photos_missing','unreadable','not_learning_material','model_error','budget_exhausted'
  )),
  ready_at timestamptz,
  photos_deleted_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index materials_client_request_idx on materials(learner_id, client_request_id);
create index materials_learner_idx on materials(learner_id, created_at desc);
create trigger materials_touch before update on materials
  for each row execute function lb_touch_updated_at();

create table material_photos (
  id uuid primary key default gen_random_uuid(),
  material_id uuid not null references materials(id) on delete cascade,
  position smallint not null check (position between 0 and 19),
  storage_path text not null unique,
  mime text not null check (mime in ('image/jpeg','image/png')),
  created_at timestamptz not null default now(),
  unique (material_id, position)
);

create table items (
  id uuid primary key default gen_random_uuid(),
  learner_id uuid not null references learners(id) on delete cascade,
  material_id uuid not null references materials(id) on delete cascade,
  subject_id uuid references subjects(id) on delete set null,
  kind text not null check (kind in ('short','long','numeric','multiple_choice','formula')),
  prompt text not null check (length(prompt) between 1 and 1000),
  answer text not null check (length(answer) between 1 and 1000),
  accepted_answers text[] not null default '{}',
  unit text,
  choices text[],
  correct_choice smallint,
  topic text check (topic is null or length(topic) <= 80),
  difficulty smallint not null default 2 check (difficulty between 1 and 5),
  source_excerpt text check (source_excerpt is null or length(source_excerpt) <= 400),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  constraint items_choice_shape check (
    kind <> 'multiple_choice'
    or (choices is not null and array_length(choices, 1) between 2 and 6
        and correct_choice between 0 and array_length(choices, 1) - 1)
  )
);
create index items_learner_idx on items(learner_id) where archived_at is null;
create index items_material_idx on items(material_id);

-- FSRS memory state per item (ts-fsrs Card fields).
create table item_states (
  item_id uuid primary key references items(id) on delete cascade,
  learner_id uuid not null references learners(id) on delete cascade,
  due timestamptz not null,
  stability double precision not null,
  difficulty double precision not null,
  elapsed_days int not null,
  scheduled_days int not null,
  reps int not null,
  lapses int not null,
  state smallint not null check (state between 0 and 3),
  last_review timestamptz,
  -- How the last practice of this question went (what "secure"/"shaky" mean).
  last_outcome text check (last_outcome in ('first_try','with_help','revealed')),
  updated_at timestamptz not null default now()
);
create index item_states_learner_due_idx on item_states(learner_id, due);

-- ═══════════════════════════ Buddy: steps ═══════════════════════════

create table buddy_steps (
  id uuid primary key default gen_random_uuid(),
  learner_id uuid not null references learners(id) on delete cascade,
  goal_id uuid references buddy_goals(id) on delete cascade,
  kind text not null check (kind in ('practice','capture')),
  title text not null check (length(title) between 1 and 120),
  -- planned → prepared → in_progress → done | skipped | cancelled
  state text not null default 'planned' check (state in (
    'planned','prepared','in_progress','done','skipped','cancelled'
  )),
  -- Learner-local day and optional agreed time (an agreed reminder).
  planned_date date,
  planned_time time,
  -- Agreed with the learner (quote-backed) vs. Buddy's own suggestion.
  agreed boolean not null default false,
  -- practice: {"item_ids": [...], "est_minutes": 8, "focus_topics": [...]}
  payload jsonb not null default '{}'::jsonb,
  -- Proof of completion (practice: session id + counts).
  evidence jsonb,
  done_source text check (done_source in ('evidence','learner_reported')),
  version int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  prepared_at timestamptz,
  finished_at timestamptz,
  constraint buddy_steps_done_has_source check (state <> 'done' or done_source is not null)
);
create index buddy_steps_learner_idx on buddy_steps(learner_id, state);
alter table materials
  add constraint materials_step_fk foreign key (step_id) references buddy_steps(id) on delete set null;
create trigger buddy_steps_touch before update on buddy_steps
  for each row execute function lb_touch_updated_at();

-- ═══════════════════════════ practice ═══════════════════════════

create table practice_sessions (
  id uuid primary key default gen_random_uuid(),
  learner_id uuid not null references learners(id) on delete cascade,
  step_id uuid references buddy_steps(id) on delete set null,
  goal_id uuid references buddy_goals(id) on delete set null,
  mode text not null default 'practice' check (mode in ('practice','test')),
  status text not null default 'active' check (status in ('active','finished','abandoned')),
  started_at timestamptz not null,
  last_activity_at timestamptz not null,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index practice_sessions_learner_idx on practice_sessions(learner_id, started_at desc);
create unique index practice_sessions_step_active_idx on practice_sessions(step_id)
  where step_id is not null and status = 'active';
create trigger practice_sessions_touch before update on practice_sessions
  for each row execute function lb_touch_updated_at();

create table session_items (
  session_id uuid not null references practice_sessions(id) on delete cascade,
  item_id uuid not null references items(id) on delete cascade,
  position smallint not null,
  status text not null default 'open' check (status in ('open','correct','revealed','skipped')),
  attempts smallint not null default 0,
  hints_used smallint not null default 0,
  first_try_correct boolean,
  closed_at timestamptz,
  primary key (session_id, item_id),
  unique (session_id, position)
);

create table practice_turns (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references practice_sessions(id) on delete cascade,
  learner_id uuid not null references learners(id) on delete cascade,
  item_id uuid not null references items(id) on delete cascade,
  seq int not null,
  role text not null check (role in ('learner','tutor')),
  text text not null check (length(text) between 1 and 4000),
  -- Learner turns: how the answer was judged; tutor turns: null.
  verdict text check (verdict in ('correct','partially_correct','incorrect','not_an_attempt')),
  evaluated_by text check (evaluated_by in ('rule','model')),
  gave_hint boolean not null default false,
  revealed boolean not null default false,
  client_turn_id uuid,
  created_at timestamptz not null default now(),
  unique (session_id, seq)
);
create unique index practice_turns_client_idx on practice_turns(session_id, client_turn_id)
  where client_turn_id is not null;

-- ═══════════════════════════ Buddy: memory & conversation ═══════════════════════════

create table buddy_messages (
  id uuid primary key default gen_random_uuid(),
  -- Insertion order: the thread order, independent of clock resolution.
  seq bigint generated always as identity,
  learner_id uuid not null references learners(id) on delete cascade,
  role text not null check (role in ('learner','buddy')),
  text text not null check (length(text) between 1 and 4000),
  -- Learner messages: idempotency key from the app; processing state of the
  -- turn it started (Buddy replies are always 'done').
  client_message_id uuid,
  status text not null default 'done' check (status in ('processing','done','failed')),
  -- Ownership of a processing turn (fencing token) and when it was claimed
  -- (app clock), so an interrupted turn can be taken over exactly once.
  claim_token uuid,
  claimed_at timestamptz,
  reply_to_id uuid references buddy_messages(id) on delete set null,
  -- A question Buddy asked with tappable answers: {"options": ["…", "…"]}.
  ask jsonb,
  outreach_id uuid,
  decision_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index buddy_messages_client_idx on buddy_messages(learner_id, client_message_id)
  where client_message_id is not null;
create index buddy_messages_learner_idx on buddy_messages(learner_id, seq desc);
create trigger buddy_messages_touch before update on buddy_messages
  for each row execute function lb_touch_updated_at();

create table buddy_memories (
  id uuid primary key default gen_random_uuid(),
  learner_id uuid not null references learners(id) on delete cascade,
  kind text not null check (kind in ('fact','preference','goal','constraint')),
  statement text not null check (length(statement) between 1 and 300),
  -- Provenance: what the learner literally said (verified server-side against
  -- that message) or an edit by the learner / account holder.
  source text not null check (source in ('learner_stated','learner_edited','account_holder')),
  source_message_id uuid references buddy_messages(id) on delete set null,
  quote text check (quote is null or length(quote) between 1 and 300),
  status text not null default 'active' check (status in ('active','superseded','retracted')),
  -- Temporary conditions end; they never turn into permanent rules.
  valid_until timestamptz,
  supersedes_id uuid references buddy_memories(id) on delete set null,
  version int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint buddy_memories_constraint_ends check (kind <> 'constraint' or valid_until is not null),
  constraint buddy_memories_stated_has_quote check (
    source <> 'learner_stated' or (quote is not null and source_message_id is not null)
  )
);
create index buddy_memories_learner_idx on buddy_memories(learner_id, status);
create trigger buddy_memories_touch before update on buddy_memories
  for each row execute function lb_touch_updated_at();

-- Every model decision, applied or not: the audit trail for "why did Buddy
-- (not) do this". Holds the validated decision, never hidden reasoning.
create table buddy_decisions (
  id uuid primary key default gen_random_uuid(),
  learner_id uuid not null references learners(id) on delete cascade,
  mode text not null check (mode in ('turn','check')),
  trigger_message_id uuid references buddy_messages(id) on delete set null,
  triggers jsonb not null default '[]'::jsonb,
  context_version bigint not null,
  attempt smallint not null default 1,
  -- applied: changes committed; wait: model chose to do nothing; stale: the
  -- context changed meanwhile; rejected: failed validation; failed: model or
  -- infrastructure error.
  disposition text not null check (disposition in ('applied','wait','stale','rejected','failed')),
  reason text check (reason is null or length(reason) <= 500),
  topic_key text,
  output jsonb,
  errors jsonb,
  model text,
  prompt_version text,
  created_at timestamptz not null default now()
);
create index buddy_decisions_learner_idx on buddy_decisions(learner_id, created_at desc);

-- Applied changes with what is needed to undo them.
create table buddy_actions (
  id uuid primary key default gen_random_uuid(),
  -- Order of the actions within a decision (they share created_at).
  seq bigint generated always as identity,
  learner_id uuid not null references learners(id) on delete cascade,
  decision_id uuid references buddy_decisions(id) on delete set null,
  tool text not null check (length(tool) between 1 and 60),
  args jsonb not null,
  result jsonb not null,
  undo jsonb,
  status text not null default 'applied' check (status in ('applied','undone')),
  created_at timestamptz not null default now(),
  undone_at timestamptz
);
create index buddy_actions_learner_idx on buddy_actions(learner_id, created_at desc);

-- ═══════════════════════════ delivery ═══════════════════════════

create table push_tokens (
  id uuid primary key default gen_random_uuid(),
  learner_id uuid not null references learners(id) on delete cascade,
  token text not null unique check (length(token) between 10 and 300),
  platform text not null check (platform in ('ios','android')),
  status text not null default 'active' check (status in ('active','invalid')),
  invalid_reason text,
  registered_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index push_tokens_learner_idx on push_tokens(learner_id, status);
create trigger push_tokens_touch before update on push_tokens
  for each row execute function lb_touch_updated_at();

create table buddy_outreach (
  id uuid primary key default gen_random_uuid(),
  learner_id uuid not null references learners(id) on delete cascade,
  kind text not null check (kind in ('idea','reminder','checkin','result')),
  -- 'agreed': a reminder the learner asked for; 'buddy': Buddy's own initiative.
  origin text not null check (origin in ('agreed','buddy')),
  decision_id uuid references buddy_decisions(id) on delete set null,
  goal_id uuid references buddy_goals(id) on delete set null,
  step_id uuid references buddy_steps(id) on delete set null,
  topic_key text not null check (length(topic_key) between 1 and 120),
  dedupe_key text not null check (length(dedupe_key) between 1 and 200),
  title text not null check (length(title) between 1 and 80),
  body text not null check (length(body) between 1 and 240),
  why text check (why is null or length(why) <= 300),
  relevance numeric(3,2) check (relevance is null or relevance between 0 and 1),
  -- Delivery evidence chain. Nothing beyond what a provider confirmed is claimed:
  --   scheduled → sending → accepted (Expo ticket ok)
  --     → provider_accepted (receipt ok: handed to APNs/FCM) | provider_rejected
  --   sending → send_failed | send_uncertain (outcome unknown; never resent)
  --   suppressed (policy), in_app (no push channel), expired, cancelled
  status text not null check (status in (
    'suppressed','scheduled','sending','accepted','provider_accepted','provider_rejected',
    'send_failed','send_uncertain','in_app','expired','cancelled'
  )),
  status_reason text,
  send_at timestamptz,
  expires_at timestamptz not null,
  lease_until timestamptz,
  push_token_id uuid references push_tokens(id) on delete set null,
  ticket_id text,
  sent_at timestamptz,
  receipt_checked_at timestamptz,
  -- Only the app can prove these.
  opened_at timestamptz,
  response text check (response in ('start','later','not_now','dismissed')),
  responded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index buddy_outreach_dedupe_idx on buddy_outreach(learner_id, dedupe_key);
create index buddy_outreach_due_idx on buddy_outreach(send_at) where status = 'scheduled';
create index buddy_outreach_receipt_idx on buddy_outreach(sent_at) where status = 'accepted';
create index buddy_outreach_learner_idx on buddy_outreach(learner_id, created_at desc);
create trigger buddy_outreach_touch before update on buddy_outreach
  for each row execute function lb_touch_updated_at();

alter table buddy_messages
  add constraint buddy_messages_outreach_fk foreign key (outreach_id)
    references buddy_outreach(id) on delete set null,
  add constraint buddy_messages_decision_fk foreign key (decision_id)
    references buddy_decisions(id) on delete set null;

-- ═══════════════════════════ background work ═══════════════════════════

-- One durable queue for everything that runs outside a request: material
-- extraction, Buddy checks (the "wake-ups"), recovery of interrupted turns,
-- photo purge, account deletion. Claimed with FOR UPDATE SKIP LOCKED and a
-- lease; a crashed run is retried until max_attempts, then parked as failed.
create table jobs (
  id uuid primary key default gen_random_uuid(),
  learner_id uuid references learners(id) on delete cascade,
  kind text not null check (kind in (
    'extract_material','buddy_check','buddy_turn','purge_photos','delete_account'
  )),
  status text not null default 'queued'
    check (status in ('queued','running','done','failed','cancelled')),
  run_at timestamptz not null,
  -- Fires at most once per key (e.g. "exam:<goal>:2026-10-02:d-1").
  dedupe_key text not null check (length(dedupe_key) between 1 and 200),
  payload jsonb not null default '{}'::jsonb,
  attempts smallint not null default 0,
  max_attempts smallint not null default 3,
  lease_token uuid,
  lease_until timestamptz,
  last_error text,
  result jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  finished_at timestamptz
);
create unique index jobs_dedupe_idx on jobs(kind, dedupe_key);
create index jobs_due_idx on jobs(run_at) where status = 'queued';
create index jobs_running_idx on jobs(lease_until) where status = 'running';
create index jobs_learner_idx on jobs(learner_id, kind, status);
create trigger jobs_touch before update on jobs
  for each row execute function lb_touch_updated_at();

-- Per-learner daily budget for model calls (atomic reservation before any call).
create table usage_daily (
  learner_id uuid not null references learners(id) on delete cascade,
  day date not null,
  kind text not null check (kind in ('buddy_turn','buddy_check','tutor','explain','extraction')),
  calls int not null default 0,
  cost_micros bigint not null default 0,
  primary key (learner_id, day, kind)
);

-- Cost and outcome of every model call; no prompt or answer content.
create table llm_calls (
  id uuid primary key default gen_random_uuid(),
  learner_id uuid references learners(id) on delete cascade,
  purpose text not null,
  model text not null,
  prompt_version text not null,
  input_tokens int not null default 0,
  output_tokens int not null default 0,
  thought_tokens int not null default 0,
  cost_micros bigint not null default 0,
  latency_ms int not null default 0,
  outcome text not null check (outcome in ('ok','invalid_output','error','timeout')),
  error_code text,
  created_at timestamptz not null default now()
);
create index llm_calls_created_idx on llm_calls(created_at desc);

-- Liveness of background processing (surfaced in GET /buddy and /health so a
-- dead scheduler is visible instead of silently missing).
create table system_heartbeats (
  name text primary key,
  last_started_at timestamptz,
  last_finished_at timestamptz,
  last_error text,
  stats jsonb
);

-- ═══════════════════════════ storage ═══════════════════════════

-- Private bucket for photos; objects are deleted 7 days after extraction
-- (purge_photos job) or with the account.
insert into storage.buckets (id, name, public)
  values ('material-photos', 'material-photos', false)
  on conflict (id) do nothing;

-- ═══════════════════════════ scheduler trigger ═══════════════════════════

-- pg_cron calls the API's tick endpoint every minute. URL and secret come
-- from Supabase Vault (secrets 'lb_api_url', 'lb_tick_secret'); without them
-- the job does nothing and GET /health reports the stale heartbeat.
create or replace function lb_invoke_tick() returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  _url text;
  _secret text;
begin
  select decrypted_secret into _url from vault.decrypted_secrets where name = 'lb_api_url';
  select decrypted_secret into _secret from vault.decrypted_secrets where name = 'lb_tick_secret';
  if _url is null or _secret is null then
    return;
  end if;
  perform net.http_post(
    url     := _url || '/internal/tick',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-tick-secret', _secret),
    body    := '{}'::jsonb,
    timeout_milliseconds := 55000
  );
end;
$$;
revoke all on function lb_invoke_tick() from public;

-- ═══════════════════════════ row level security ═══════════════════════════

do $$
declare
  t text;
begin
  foreach t in array array[
    'accounts','learners','buddy_settings','subjects','buddy_goals','materials',
    'material_photos','items','item_states','buddy_steps','practice_sessions',
    'session_items','practice_turns','buddy_messages','buddy_memories',
    'buddy_decisions','buddy_actions','push_tokens','buddy_outreach','jobs',
    'usage_daily','llm_calls','system_heartbeats'
  ] loop
    execute format('alter table %I enable row level security', t);
  end loop;
end;
$$;
