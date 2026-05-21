-- 0026 — Expo push tokens for learners.
--
-- One learner may have multiple devices (parent's phone + tablet),
-- so we model push tokens as a separate table rather than a single
-- column on learners. Tokens are device-issued strings like
-- ExponentPushToken[xxx...] from Expo's push-notification service.
--
-- The mobile app posts /learners/:id/push-tokens after notification
-- permission is granted; the extraction worker reads from this table
-- when a material flips to ready/failed and pushes a heads-up.

create table public.learner_push_tokens (
  id          uuid primary key default gen_random_uuid(),
  learner_id  uuid not null references public.learners(id) on delete cascade,
  token       text not null,
  platform    text not null check (platform in ('ios', 'android', 'web')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  -- Same physical device may re-register; we upsert by (learner_id, token)
  -- so re-installs / token-refresh just update updated_at and avoid dupes.
  unique (learner_id, token)
);

create index learner_push_tokens_learner_id_idx
  on public.learner_push_tokens (learner_id);

alter table public.learner_push_tokens enable row level security;

-- Service role only (workers + signed API server). Learners never read
-- their own tokens — they only ever WRITE through the authenticated API
-- which uses the service role on their behalf.
create policy "service_role_full_access"
  on public.learner_push_tokens
  for all
  to service_role
  using (true)
  with check (true);
