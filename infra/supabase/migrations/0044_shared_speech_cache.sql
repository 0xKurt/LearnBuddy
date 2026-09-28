-- Shared cache for synthesised fixed app texts (the voice picker's samples):
-- the same four voices read the same sentence for every learner, so the first
-- tap anywhere seeds it for all. Holds only app-authored strings — never a
-- learner's own sentences (those stay in speech_cache, per learner, 24 h;
-- docs/privacy.md §Datenarten). Issue #12.
create table speech_cache_shared (
  key text primary key,
  mime text not null,
  audio bytea not null,
  created_at timestamptz not null,
  expires_at timestamptz not null
);
create index speech_cache_shared_expires_idx on speech_cache_shared (expires_at);
alter table speech_cache_shared enable row level security;
-- API only (service role); no client policies.
