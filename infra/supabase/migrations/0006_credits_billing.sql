-- 0006 — Credits, credit events, subscriptions.
-- Source: docs/03-data-model.md §credits-subscriptions-billing.
-- Mutations on these tables run through the service role only.

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

create trigger credit_buckets_updated_at
  before update on credit_buckets
  for each row execute function lb_set_updated_at();

alter table credit_buckets enable row level security;
create policy credit_bucket_read on credit_buckets
  for select using (
    account_id in (select id from accounts where owner_user_id = auth.uid())
  );

create table credit_events (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  learner_id uuid references learners(id) on delete set null,
  delta int not null,
  reason text not null,    -- monthly_grant | rollover | vision | dialog_turn | regenerate | explain | refund | refund_failure
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

create trigger subscriptions_updated_at
  before update on subscriptions
  for each row execute function lb_set_updated_at();

alter table subscriptions enable row level security;
create policy sub_read on subscriptions
  for select using (
    account_id in (select id from accounts where owner_user_id = auth.uid())
  );
