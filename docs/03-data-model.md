# 03 — Data Model

Postgres on Supabase, region `eu-central-1`. All tables have Row-Level Security enabled. UUIDs throughout. Timestamps `timestamptz` in UTC.

Conventions:
- Every table has `id uuid primary key default gen_random_uuid()`, `created_at timestamptz not null default now()`, and `updated_at timestamptz not null default now()`.
- An `updated_at` trigger maintains `updated_at` on row updates.
- Soft-deleted entities use a nullable `archived_at`.
- Foreign keys cascade through the account.
- RLS policies are scoped so the auth user can only access rows that belong to an account they own.

This document is the canonical schema. The mobile app's local SQLite mirror is a strict subset of these tables, omitting only credit ledger, subscription, outbox (server-side), and DSGVO request tables.

## Identity and ownership

```sql
-- An account is the billing and data-ownership unit. Owned by one adult auth user (the account holder).
create table accounts (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  display_name text,
  locale text not null default 'de',
  country_code text not null default 'DE',
  dsgvo_consent_version text,
  dsgvo_consent_at timestamptz,
  scheduled_deletion_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index accounts_owner_idx on accounts(owner_user_id);

alter table accounts enable row level security;
create policy account_owner_rw on accounts
  for all using (owner_user_id = auth.uid())
  with check (owner_user_id = auth.uid());

-- The learner profile is the single sub-profile of an account; not an auth user.
-- Enforced as one active profile per account via the partial unique index below.
create table learners (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  display_name text not null,
  birth_year smallint check (birth_year between 2005 and 2025),
  grade_level smallint not null check (grade_level between 1 and 13),
  ui_locale text not null default 'de',
  preferred_answer_mode text not null default 'voice'
    check (preferred_answer_mode in ('voice','text','multiple_choice')),
  avatar_id smallint not null default 1,
  notifications_practice_nudge_enabled boolean not null default false,
  notifications_practice_nudge_time time not null default '16:30',
  notifications_test_heads_up_enabled boolean not null default false,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- One profile per account. Unique on active rows so a soft-archived profile
-- doesn't block creation of its replacement.
create unique index learners_account_idx on learners(account_id) where archived_at is null;

alter table learners enable row level security;
create policy learner_account_rw on learners
  for all using (
    account_id in (select id from accounts where owner_user_id = auth.uid())
  )
  with check (
    account_id in (select id from accounts where owner_user_id = auth.uid())
  );
```

## Organization

```sql
create table subjects (
  id uuid primary key default gen_random_uuid(),
  learner_id uuid not null references learners(id) on delete cascade,
  name text not null,
  subject_kind text not null default 'general'
    check (subject_kind in (
      'math','physics','chemistry','biology','geography',
      'history','language_native','language_foreign',
      'religion_ethics','art_music','general','other'
    )),
  color_hex text not null default '#6B8AFD',
  icon_id text,
  sort_order int not null default 0,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index subjects_learner_idx on subjects(learner_id) where archived_at is null;

alter table subjects enable row level security;
create policy subject_account_rw on subjects
  for all using (
    learner_id in (
      select k.id from learners k
      join accounts f on f.id = k.account_id
      where f.owner_user_id = auth.uid()
    )
  )
  with check (
    learner_id in (
      select k.id from learners k
      join accounts f on f.id = k.account_id
      where f.owner_user_id = auth.uid()
    )
  );

create table folders (
  id uuid primary key default gen_random_uuid(),
  subject_id uuid not null references subjects(id) on delete cascade,
  name text not null,
  scheduled_for date,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index folders_subject_idx on folders(subject_id) where archived_at is null;
create index folders_upcoming_idx on folders(scheduled_for)
  where archived_at is null and scheduled_for is not null;

alter table folders enable row level security;
create policy folder_account_rw on folders
  for all using (
    subject_id in (
      select s.id from subjects s
      join learners k on k.id = s.learner_id
      join accounts f on f.id = k.account_id
      where f.owner_user_id = auth.uid()
    )
  )
  with check (
    subject_id in (
      select s.id from subjects s
      join learners k on k.id = s.learner_id
      join accounts f on f.id = k.account_id
      where f.owner_user_id = auth.uid()
    )
  );
```

## Materials and items

```sql
create table materials (
  id uuid primary key default gen_random_uuid(),
  subject_id uuid not null references subjects(id) on delete cascade,
  folder_id uuid references folders(id) on delete set null,
  learner_id uuid not null references learners(id) on delete cascade,
  title text,
  source_kind text not null default 'photo'
    check (source_kind in ('photo','text','pdf')),
  page_count smallint not null default 1,
  extracted_markdown text,
  detected_language text,
  extraction_model text,
  extraction_prompt_version text,
  extraction_status text not null default 'pending'
    check (extraction_status in ('pending','ready','failed')),
  extraction_error text,
  photos_deleted_at timestamptz,
  scheduled_photo_deletion_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index materials_subject_idx on materials(subject_id) where archived_at is null;
create index materials_folder_idx on materials(folder_id) where archived_at is null;
create index materials_pending_extraction_idx on materials(created_at)
  where extraction_status = 'pending';
create index materials_photo_wipe_due_idx on materials(scheduled_photo_deletion_at)
  where photos_deleted_at is null and scheduled_photo_deletion_at is not null;

alter table materials enable row level security;
create policy material_account_rw on materials
  for all using (
    learner_id in (
      select k.id from learners k join accounts f on f.id = k.account_id
      where f.owner_user_id = auth.uid()
    )
  )
  with check (
    learner_id in (
      select k.id from learners k join accounts f on f.id = k.account_id
      where f.owner_user_id = auth.uid()
    )
  );

create table material_photos (
  id uuid primary key default gen_random_uuid(),
  material_id uuid not null references materials(id) on delete cascade,
  position smallint not null,
  storage_path text not null,
  width int,
  height int,
  byte_size int,
  client_blur_score real,
  client_brightness real,
  deleted_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index material_photos_pos_idx on material_photos(material_id, position);

alter table material_photos enable row level security;
create policy material_photo_account_rw on material_photos
  for all using (
    material_id in (
      select m.id from materials m
      join learners k on k.id = m.learner_id
      join accounts f on f.id = k.account_id
      where f.owner_user_id = auth.uid()
    )
  )
  with check (
    material_id in (
      select m.id from materials m
      join learners k on k.id = m.learner_id
      join accounts f on f.id = k.account_id
      where f.owner_user_id = auth.uid()
    )
  );

-- Derivative images (numbered diagrams, cropped graphs, rendered formulas).
-- Persistent — survives the 7-day raw-photo deletion.
create table study_assets (
  id uuid primary key default gen_random_uuid(),
  material_id uuid not null references materials(id) on delete cascade,
  learner_id uuid not null references learners(id) on delete cascade,
  kind text not null check (kind in ('numbered_diagram','cropped_graph','rendered_formula','clean_image')),
  storage_path text not null,
  source_page_index smallint,
  title text,
  width int not null,
  height int not null,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index study_assets_material_idx on study_assets(material_id);
create index study_assets_learner_idx on study_assets(learner_id);

alter table study_assets enable row level security;
create policy study_asset_account_rw on study_assets
  for all using (
    learner_id in (
      select k.id from learners k join accounts f on f.id = k.account_id
      where f.owner_user_id = auth.uid()
    )
  )
  with check (
    learner_id in (
      select k.id from learners k join accounts f on f.id = k.account_id
      where f.owner_user_id = auth.uid()
    )
  );

create table items (
  id uuid primary key default gen_random_uuid(),
  material_id uuid not null references materials(id) on delete cascade,
  learner_id uuid not null references learners(id) on delete cascade,

  question text not null,
  expected_answer text not null,
  acceptable_answers text[] not null default '{}',
  answer_kind text not null default 'short'
    check (answer_kind in ('short','long','numeric','multiple_choice','formula','diagram_label','fill_blank')),

  -- multiple_choice
  mc_options text[],
  mc_correct_index smallint,
  mc_option_stimuli jsonb,                                    -- optional per-option stimulus

  -- numeric / formula
  units text,
  latex_expected text,
  latex_acceptable text[] not null default '{}',

  -- fill_blank
  fill_blank_template text,
  fill_blank_answers text[] not null default '{}',

  -- diagram_label
  study_asset_id uuid references study_assets(id) on delete set null,
  diagram_label_index smallint,

  -- stimulus shown with the question
  stimulus_kind text not null default 'none'
    check (stimulus_kind in ('none','study_asset','function_plot','svg','coord_grid')),
  stimulus_data jsonb not null default '{}',

  -- metadata
  difficulty smallint not null default 2 check (difficulty between 1 and 5),
  topic text,
  language text not null default 'de',
  source_excerpt text,
  generated_by_model text,
  generated_by_prompt_version text,
  problem_template_id uuid,                                   -- FK added below to avoid circular
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index items_material_idx on items(material_id) where archived_at is null;
create index items_learner_active_idx on items(learner_id) where archived_at is null;
create index items_topic_idx on items(learner_id, topic) where archived_at is null;
create index items_template_idx on items(problem_template_id) where problem_template_id is not null;

alter table items enable row level security;
create policy items_account_rw on items
  for all using (
    learner_id in (
      select k.id from learners k join accounts f on f.id = k.account_id
      where f.owner_user_id = auth.uid()
    )
  )
  with check (
    learner_id in (
      select k.id from learners k join accounts f on f.id = k.account_id
      where f.owner_user_id = auth.uid()
    )
  );
```

## Problem templates and practice runs

```sql
create table problem_templates (
  id uuid primary key default gen_random_uuid(),
  material_id uuid not null references materials(id) on delete cascade,
  learner_id uuid not null references learners(id) on delete cascade,
  source_item_id uuid references items(id) on delete set null,
  subject_kind text not null,
  topic text not null,
  template_text text not null,
  params jsonb not null,
  constraints jsonb not null default '[]',
  text_substitutions jsonb not null default '[]',
  solution_expression text not null,
  answer_kind text not null check (answer_kind in ('numeric','formula','short')),
  units text,
  stimulus_template jsonb,
  difficulty smallint not null default 2 check (difficulty between 1 and 5),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index problem_templates_learner_idx on problem_templates(learner_id) where archived_at is null;
create index problem_templates_material_idx on problem_templates(material_id);

alter table problem_templates enable row level security;
create policy template_account_rw on problem_templates
  for all using (
    learner_id in (
      select k.id from learners k join accounts f on f.id = k.account_id
      where f.owner_user_id = auth.uid()
    )
  )
  with check (
    learner_id in (
      select k.id from learners k join accounts f on f.id = k.account_id
      where f.owner_user_id = auth.uid()
    )
  );

-- Close the FK from items to problem_templates now that both tables exist.
alter table items
  add constraint items_problem_template_fk
  foreign key (problem_template_id) references problem_templates(id) on delete set null;

create table practice_runs (
  id uuid primary key default gen_random_uuid(),
  learner_id uuid not null references learners(id) on delete cascade,
  template_id uuid not null references problem_templates(id) on delete cascade,
  problems_generated int not null,
  problems_correct int not null default 0,
  avg_time_ms int,
  difficulty_adjustment smallint not null default 0,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  created_at timestamptz not null default now()
);
create index practice_runs_learner_template_idx on practice_runs(learner_id, template_id, started_at desc);

alter table practice_runs enable row level security;
create policy practice_run_account_rw on practice_runs
  for all using (
    learner_id in (
      select k.id from learners k join accounts f on f.id = k.account_id
      where f.owner_user_id = auth.uid()
    )
  )
  with check (
    learner_id in (
      select k.id from learners k join accounts f on f.id = k.account_id
      where f.owner_user_id = auth.uid()
    )
  );
```

## FSRS state, sessions, attempts

```sql
create table item_states (
  item_id uuid primary key references items(id) on delete cascade,
  learner_id uuid not null references learners(id) on delete cascade,
  stability double precision not null default 0,
  difficulty double precision not null default 0,
  elapsed_days int not null default 0,
  scheduled_days int not null default 0,
  reps int not null default 0,
  lapses int not null default 0,
  state smallint not null default 0,        -- 0=New 1=Learning 2=Review 3=Relearning
  last_review timestamptz,
  due timestamptz not null default now(),
  mastery_score smallint not null default 0,
  updated_at timestamptz not null default now()
);
create index item_states_learner_due_idx on item_states(learner_id, due);

alter table item_states enable row level security;
create policy item_state_account_rw on item_states
  for all using (
    learner_id in (
      select k.id from learners k join accounts f on f.id = k.account_id
      where f.owner_user_id = auth.uid()
    )
  )
  with check (
    learner_id in (
      select k.id from learners k join accounts f on f.id = k.account_id
      where f.owner_user_id = auth.uid()
    )
  );

create table sessions (
  id uuid primary key default gen_random_uuid(),
  learner_id uuid not null references learners(id) on delete cascade,
  subject_id uuid references subjects(id) on delete set null,
  test_mode boolean not null default false,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  attempts_count int not null default 0,
  correct_count int not null default 0,
  created_at timestamptz not null default now()
);
create index sessions_learner_idx on sessions(learner_id, started_at desc);

alter table sessions enable row level security;
create policy session_account_rw on sessions
  for all using (
    learner_id in (
      select k.id from learners k join accounts f on f.id = k.account_id
      where f.owner_user_id = auth.uid()
    )
  )
  with check (
    learner_id in (
      select k.id from learners k join accounts f on f.id = k.account_id
      where f.owner_user_id = auth.uid()
    )
  );

create table attempts (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references items(id) on delete cascade,
  learner_id uuid not null references learners(id) on delete cascade,
  session_id uuid references sessions(id) on delete set null,
  mode text not null check (mode in ('voice','text','multiple_choice')),
  kid_answer text,
  verdict text not null check (verdict in ('correct','partially_correct','incorrect','skipped')),
  evaluated_by text not null check (evaluated_by in ('local','llm')),
  evaluation_model text,
  evaluation_prompt_version text,
  feedback text,
  hints_used smallint not null default 0,
  duration_ms int,
  test_mode boolean not null default false,
  created_at timestamptz not null default now()
);
create index attempts_learner_recent_idx on attempts(learner_id, created_at desc);
create index attempts_item_idx on attempts(item_id);

alter table attempts enable row level security;
create policy attempt_account_rw on attempts
  for all using (
    learner_id in (
      select k.id from learners k join accounts f on f.id = k.account_id
      where f.owner_user_id = auth.uid()
    )
  )
  with check (
    learner_id in (
      select k.id from learners k join accounts f on f.id = k.account_id
      where f.owner_user_id = auth.uid()
    )
  );
```

## Credits, subscriptions, billing

```sql
create table credit_buckets (
  account_id uuid primary key references accounts(id) on delete cascade,
  tier text not null check (tier in ('trial','standard','plus')),
  current_balance int not null default 0,
  monthly_allotment int not null,
  rollover_cap int not null,
  current_period_start timestamptz not null default now(),
  current_period_end timestamptz not null,
  updated_at timestamptz not null default now()
);

alter table credit_buckets enable row level security;
create policy credit_bucket_read on credit_buckets
  for select using (
    account_id in (select id from accounts where owner_user_id = auth.uid())
  );
-- Mutations only via service role (API).

create table credit_events (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  learner_id uuid references learners(id) on delete set null,
  delta int not null,
  reason text not null,                       -- 'monthly_grant','rollover','vision','dialog_turn','regenerate','explain','refund','refund_failure'
  reference_id uuid,
  model text,
  prompt_version text,
  input_tokens int,
  output_tokens int,
  cost_usd_micros bigint,
  created_at timestamptz not null default now()
);
create index credit_events_account_idx on credit_events(account_id, created_at desc);
create index credit_events_reason_idx on credit_events(reason, created_at desc);

alter table credit_events enable row level security;
create policy credit_event_read on credit_events
  for select using (
    account_id in (select id from accounts where owner_user_id = auth.uid())
  );
-- Mutations only via service role.

create table subscriptions (
  account_id uuid primary key references accounts(id) on delete cascade,
  revenuecat_app_user_id text not null unique,
  product_id text,
  tier text not null default 'trial' check (tier in ('trial','standard','plus')),
  status text not null default 'trial'
    check (status in ('trial','active','grace','expired','cancelled')),
  expires_at timestamptz,
  trial_ends_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table subscriptions enable row level security;
create policy sub_read on subscriptions
  for select using (
    account_id in (select id from accounts where owner_user_id = auth.uid())
  );
-- Mutations only via service role (RevenueCat webhook handler).
```

## Operational tables

```sql
-- Server-side outbox for delayed/recurring side effects.
create table outbox (
  id uuid primary key default gen_random_uuid(),
  kind text not null,                         -- 'wipe_photo','grant_credits','dsgvo_export','dsgvo_delete', ...
  payload jsonb not null,
  run_after timestamptz not null default now(),
  attempts int not null default 0,
  last_error text,
  done_at timestamptz,
  created_at timestamptz not null default now()
);
create index outbox_due_idx on outbox(run_after) where done_at is null;

-- No RLS — service role only.

create table dsgvo_requests (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  kind text not null check (kind in ('export','delete')),
  status text not null default 'pending'
    check (status in ('pending','running','done','failed','cancelled')),
  result_path text,
  result_signed_url_expires_at timestamptz,
  requested_at timestamptz not null default now(),
  completed_at timestamptz
);
create index dsgvo_requests_pending_idx on dsgvo_requests(requested_at)
  where status in ('pending','running');

alter table dsgvo_requests enable row level security;
create policy dsgvo_owner_read on dsgvo_requests
  for select using (
    account_id in (select id from accounts where owner_user_id = auth.uid())
  );
-- Mutations only via service role.
```

## Mobile local SQLite mirror

The mobile app stores a subset of the server tables in SQLite via Drizzle. Identical column names and types where possible. Local-only additions:

- `outbox_local` — pending mutations to replay to the server. Same shape as the server `outbox` but with operation kinds `attempts_batch`, `pending_attempt_eval`, `practice_run_summary`, `subject_archive`, `item_archive`, `material_archive`, `kid_settings_update`.
- `sync_state` — single-row table with `last_full_pull_at`, `last_outbox_drain_at`.

Tables omitted from the mirror: `credit_buckets`, `credit_events`, `subscriptions`, `outbox`, `dsgvo_requests`, `material_photos`. The mobile app never reads or writes them.

## Shared TypeScript types

`packages/shared-types/src/` exports Zod schemas. Static types are derived via `z.infer`. Same package imported by mobile and api.

```ts
import { z } from 'zod';

export const Locale = z.enum(['de','en','fr','es','it']);
export type Locale = z.infer<typeof Locale>;

export const SubjectKind = z.enum([
  'math','physics','chemistry','biology','geography',
  'history','language_native','language_foreign',
  'religion_ethics','art_music','general','other',
]);
export type SubjectKind = z.infer<typeof SubjectKind>;

export const AnswerKind = z.enum([
  'short','long','numeric','multiple_choice',
  'formula','diagram_label','fill_blank',
]);
export type AnswerKind = z.infer<typeof AnswerKind>;

export const StimulusKind = z.enum([
  'none','study_asset','function_plot','svg','coord_grid',
]);

export const FunctionPlot = z.object({
  series: z.array(z.union([
    z.object({
      kind: z.literal('line'),
      expression: z.string(),
      color: z.string().optional(),
      label: z.string().optional(),
    }),
    z.object({
      kind: z.literal('points'),
      points: z.array(z.tuple([z.number(), z.number()])),
      color: z.string().optional(),
      label: z.string().optional(),
    }),
  ])),
  x: z.object({ min: z.number(), max: z.number(), tick_step: z.number().optional(), label: z.string().optional() }),
  y: z.object({ min: z.number(), max: z.number(), tick_step: z.number().optional(), label: z.string().optional() }),
  grid: z.boolean().optional(),
  highlights: z.array(z.object({ x: z.number(), y: z.number(), label: z.string().optional() })).optional(),
});

export const SvgStimulus = z.object({
  viewBox: z.string(),
  content: z.string(),         // sanitized before persist; see doc 07
});

export const StimulusData = z.union([
  z.object({}).strict(),                       // none
  z.object({ study_asset_id: z.string().uuid() }),
  FunctionPlot,
  SvgStimulus,
]);

export const GeneratedItem = z.object({
  question: z.string().min(3),
  expectedAnswer: z.string().min(1),
  acceptableAnswers: z.array(z.string()).default([]),
  answerKind: AnswerKind,
  mcOptions: z.array(z.string()).optional(),
  mcCorrectIndex: z.number().int().nonnegative().optional(),
  mcOptionStimuli: z.array(StimulusData.nullable()).optional(),
  units: z.string().optional(),
  latexExpected: z.string().optional(),
  latexAcceptable: z.array(z.string()).default([]).optional(),
  fillBlankTemplate: z.string().optional(),
  fillBlankAnswers: z.array(z.string()).optional(),
  diagramRef: z.object({
    diagramIndex: z.number().int().nonnegative(),
    labelIndex: z.number().int().min(1),
  }).optional(),
  stimulusKind: StimulusKind.default('none'),
  stimulusData: StimulusData.default({}),
  difficulty: z.number().int().min(1).max(5),
  topic: z.string().optional(),
  language: Locale,
  sourceExcerpt: z.string().max(200).optional(),
});
export type GeneratedItem = z.infer<typeof GeneratedItem>;

export const ParamSpec = z.object({
  name: z.string().regex(/^[a-zA-Z_][a-zA-Z0-9_]*$/),
  type: z.enum(['int','real']),
  min: z.number(),
  max: z.number(),
  step: z.number().optional(),
  exclude: z.array(z.number()).optional(),
});

export const ProblemTemplate = z.object({
  templateText: z.string(),
  params: z.array(ParamSpec).min(1),
  constraints: z.array(z.string()).default([]),
  textSubstitutions: z.array(z.object({ name: z.string(), rule: z.string() })).default([]),
  solutionExpression: z.string(),
  answerKind: z.enum(['numeric','formula','short']),
  units: z.string().optional(),
  stimulusTemplate: z.object({
    kind: z.enum(['function_plot','svg']),
    dataTemplate: z.unknown(),     // arbitrary JSON with {param} placeholders
  }).optional(),
  topic: z.string(),
  difficulty: z.number().int().min(1).max(5),
});
export type ProblemTemplate = z.infer<typeof ProblemTemplate>;

export const Verdict = z.enum(['correct','partially_correct','incorrect','skipped']);
export type Verdict = z.infer<typeof Verdict>;
```

## Drizzle setup

The same Drizzle schema lives in `apps/api/lib/db/schema.ts` and is imported by `apps/mobile/lib/db/schema.ts`, with the mobile schema overlaying the local-only `outbox_local` and `sync_state` tables and omitting service-only tables. Migrations live in `infra/supabase/migrations/`.
