-- 0007 — Operational tables (outbox, DSGVO requests).
-- Source: docs/03-data-model.md §operational-tables.
-- Service role only — no RLS.

create table outbox (
  id uuid primary key default gen_random_uuid(),
  kind text not null,          -- wipe_photo | grant_credits | dsgvo_export | dsgvo_delete | ...
  payload jsonb not null,
  run_after timestamptz not null default now(),
  attempts int not null default 0,
  last_error text,
  done_at timestamptz,
  created_at timestamptz not null default now()
);
create index outbox_due_idx on outbox(run_after) where done_at is null;

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
