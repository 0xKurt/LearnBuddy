-- 0010 — Idempotency-Key storage. Doc 04 §Conventions.
--
-- Mutating endpoints accept an `Idempotency-Key` header. The (account_id,
-- route, key) tuple is unique for 24h; the first request stores its response
-- and subsequent requests within the window get the same body byte-for-byte.
--
-- Storage is Postgres because Vercel lambdas are stateless and cold-start
-- regularly — the previous in-memory cache served at most one instance and
-- let retries that landed elsewhere double-execute (which on /materials
-- meant double-debited credits + double-Vertex-call).

create table idempotency_keys (
  id uuid primary key default gen_random_uuid(),
  account_id uuid references accounts(id) on delete cascade,
  route text not null,
  key text not null,
  status_code int not null,
  response_body text not null,
  response_headers jsonb not null default '{}'::jsonb,
  stored_at timestamptz not null default now()
);

create unique index idempotency_keys_lookup_idx
  on idempotency_keys(coalesce(account_id::text, 'anon'), route, key);

create index idempotency_keys_stored_at_idx
  on idempotency_keys(stored_at);

alter table idempotency_keys enable row level security;
-- Only service role writes/reads this; no client RLS policy needed. Leaving
-- RLS enabled means no client can read replayed bodies even if a SQL bug in
-- a route handler accidentally exposes the table.

-- Periodic cleanup keeps the table small. The replay window is 24h so we
-- can safely drop anything older than 48h.
create or replace function lb_cleanup_idempotency_keys()
returns void
language sql
security definer
as $$
  delete from idempotency_keys where stored_at < now() - interval '48 hours';
$$;
