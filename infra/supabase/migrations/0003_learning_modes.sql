-- Learning modes beyond practice from photos (docs/architecture.md §Practice):
--   * help    — homework help: hints step by step, the solution is never shown
--   * explain — "explain X to me": a short explanation, then questions to check it
--   * vocab   — vocabulary pairs, asked in both directions
--   * speak   — say a word or sentence aloud; the model listens to the audio itself
-- Questions can come from a photo (material), from Buddy (a topic the learner
-- named, clearly marked) or from what the learner typed (a vocabulary list).
-- Questions can carry a figure (fraction, number line, graph, chart, geometry,
-- table) as validated data the app draws.

alter table items drop constraint items_kind_check;
alter table items add constraint items_kind_check
  check (kind in ('short','long','numeric','multiple_choice','formula','vocab','speak'));
alter table items alter column material_id drop not null;
alter table items
  add column origin text not null default 'material'
    check (origin in ('material','buddy','typed','homework')),
  -- vocab: language of the answer (translation); speak: language to say it in.
  add column lang text check (lang is null or lang ~ '^[a-z]{2}$'),
  -- vocab: language of the prompt (the term).
  add column prompt_lang text check (prompt_lang is null or prompt_lang ~ '^[a-z]{2}$'),
  add column figure jsonb;
alter table items add constraint items_source_shape
  check (origin <> 'material' or material_id is not null);

alter table materials
  add column purpose text not null default 'study' check (purpose in ('study','homework'));

alter table practice_sessions drop constraint practice_sessions_mode_check;
alter table practice_sessions add constraint practice_sessions_mode_check
  check (mode in ('practice','test','help','explain'));
alter table practice_sessions
  add column title text check (title is null or length(title) <= 120),
  add column intro text check (intro is null or length(intro) <= 3000),
  add column material_id uuid references materials(id) on delete set null,
  add column client_request_id uuid;
create unique index practice_sessions_client_idx
  on practice_sessions(learner_id, client_request_id) where client_request_id is not null;

alter table practice_turns
  add column pronunciation jsonb;

-- Listening to a recording has its own daily limit.
alter table usage_daily drop constraint usage_daily_kind_check;
alter table usage_daily add constraint usage_daily_kind_check
  check (kind in ('buddy_turn','buddy_check','tutor','explain','extraction','pronounce'));
