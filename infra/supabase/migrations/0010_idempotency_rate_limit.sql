-- 0010 — Idempotency keys + rate-limit counters.
-- Source: docs/04-api.md §idempotency + §rate-limits.
--
-- Both tables are service-role-only (no RLS). The API layer enforces
-- account-scoped access before writing; these are operational tables,
-- not user-owned rows.

-- ── Idempotency keys ─────────────────────────────────────────────────────────
-- Backs apps/api/src/lib/idempotency.ts. Stores the response of any mutating
-- endpoint for 24 h so retries (e.g. after a Vercel cold start on a different
-- instance) replay the original response rather than re-executing the handler.
--
-- The unique partial index uses coalesce so unauthenticated calls (e.g.
-- POST /auth/account/signup) collide correctly on (NULL, route, key).

create table idempotency_keys (
  id            uuid        primary key default gen_random_uuid(),
  account_id    uuid        references accounts(id) on delete cascade,
  route         text        not null,
  key           text        not null,
  status_code   int         not null,
  response_body text        not null,
  response_headers jsonb    not null default '{}',
  stored_at     timestamptz not null default now()
);

create unique index idempotency_account_route_key_idx
  on idempotency_keys (coalesce(account_id::text, 'anon'), route, key);

-- Cleanup index: lets the daily pg_cron job find expired rows fast.
create index idempotency_stored_at_idx on idempotency_keys(stored_at);

-- ── Rate-limit counters ──────────────────────────────────────────────────────
-- Backs apps/api/src/middleware/rate-limit.ts. One row per (key:account:learner)
-- bucket; upserted on every request. Postgres-backed so counts survive Vercel
-- cold starts — the previous in-memory Map reset per lambda instance.

create table rate_limit_counters (
  id         text        primary key,   -- '{key}:{account_id}:{learner_id}'
  count      int         not null default 1,
  reset_at   timestamptz not null,
  updated_at timestamptz not null default now()
);

-- Cleanup index: lets the daily pg_cron job prune expired windows fast.
create index rate_limit_reset_at_idx on rate_limit_counters(reset_at);
