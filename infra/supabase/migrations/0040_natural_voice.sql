-- Buddy's natural voice (ADR 0008, docs/architecture.md §Voice, docs/privacy.md).
--
-- 1. Her voice settings: one of a small curated set and a speed in steps. Changed only by
--    asking Buddy (tool set_voice, undoable); the version bump fences the change like every
--    other settings change.
-- 2. A short-lived cache of synthesised audio per learner (text, voice, speed → audio), so a
--    sentence read twice (again, the same question) costs nothing. Rows are kept 24 hours
--    (purged by the scheduler) and go with the learner on deletion.

alter table buddy_settings
  add column voice text not null default 'warm'
    check (voice in ('warm', 'friendly', 'bright', 'clear')),
  add column voice_speed smallint not null default 0
    check (voice_speed between -2 and 2);

create table speech_cache (
  learner_id uuid not null references learners(id) on delete cascade,
  -- sha256 of (provider voice, locale, rate, text): the text itself is not stored.
  key text not null check (key ~ '^[0-9a-f]{64}$'),
  mime text not null check (mime in ('audio/mpeg', 'audio/wav')),
  audio bytea not null check (octet_length(audio) between 1 and 2000000),
  -- From the app clock (CLAUDE.md rule 7).
  created_at timestamptz not null,
  expires_at timestamptz not null,
  primary key (learner_id, key)
);
create index speech_cache_expires_idx on speech_cache (expires_at);

alter table speech_cache enable row level security;
-- No policies: only the API (service role / owner) touches it.
