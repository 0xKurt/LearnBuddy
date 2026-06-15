-- 0025 — Agent turn bookkeeping.
-- Source: docs/INTERACTIVE-AI-AGENT-SPEC.md (rebuild — one-screen chat agent).
--
-- The agent stores one row per learner message and one per tutor reply in
-- the existing `conversation_turns` table. Three additional columns are
-- needed for the new single-endpoint chat:
--
--   intent           — the model's classification of THIS reply
--                      ('evaluate' | 'introduce_next' | 'hint' | 'reveal' |
--                       'praise_and_advance' | 'give_up_scaffold' |
--                       'explain' | 'redirect' | 'break_suggest')
--   hint_given       — true when this tutor reply contained a hint
--   advance_after    — true when the model decided the next learner message
--                      should be addressed to a NEW item (server pops the queue)
--   audio_storage_key — for voice turns, the path in storage of the uploaded
--                       audio clip; null for text. Lets us re-transcribe
--                       offline if needed.
--
-- All four are NULLABLE so existing rows (and the old /sessions path) keep
-- working without backfill.

alter table conversation_turns
  add column if not exists intent text,
  add column if not exists hint_given boolean,
  add column if not exists advance_after boolean,
  add column if not exists audio_storage_key text;

-- Index for analytics — most queries filter on intent + recent.
create index if not exists conversation_turns_intent_idx
  on conversation_turns(intent, created_at desc)
  where intent is not null;
