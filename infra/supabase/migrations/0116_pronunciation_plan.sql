-- Prepared competitors, never a recording. Existing exercises keep the audio-model fallback.
alter table items add column pronunciation_plan jsonb;
alter table items add constraint items_pronunciation_plan_kind
  check (pronunciation_plan is null or (kind = 'speak' and jsonb_typeof(pronunciation_plan) = 'object'));
