-- What a model call was part of, and how the caller waited for it (issue #652, KI-Audit F2 (5), K21).
-- docs/architecture.md §Model calls.
--
-- Until now `llm_calls` kept the latency of the LAST attempt only: a 429 answered on the third try
-- looked like one quick call, a streamed turn could not say when its first word came, and nobody
-- could tell which schema variant a run went out with or which rounds made up one Buddy turn.
-- Numbers only, as before — never prompt or answer text (docs/privacy.md).
--
-- `decision_id` has no foreign key on purpose: the call is recorded before its decision row exists
-- (the decision is what the call's answer becomes), and both go with the learner (`learner_id`
-- cascades). Old rows keep the defaults: one attempt, not streamed, nothing else known.

alter table llm_calls
  add column if not exists decision_id uuid,
  add column if not exists round smallint,
  add column if not exists schema_variant text,
  add column if not exists streamed boolean not null default false,
  add column if not exists first_token_ms int,
  add column if not exists attempts smallint not null default 1,
  add column if not exists total_ms int;

comment on column llm_calls.decision_id is
  'The Buddy decision (buddy_decisions.id) this call is a round of; null for calls outside a turn or check. No FK: the call is recorded before its decision. Issue #652.';
comment on column llm_calls.round is
  'The model round within its turn or check, 1 first (lookups and repairs add rounds). Issue #652.';
comment on column llm_calls.schema_variant is
  'Which response schema went out: step/final for Buddy, whole/chosen/fallback for a practice run or reading (practice/formChoice.ts). Issue #652.';
comment on column llm_calls.streamed is 'Whether the answer was streamed to the caller. Issue #652.';
comment on column llm_calls.first_token_ms is
  'From the call to its first streamed text, retries included; null when nothing was streamed. Issue #652.';
comment on column llm_calls.attempts is
  'Requests the gateway sent for this call, retries included (llm/retry.ts). Issue #652.';
comment on column llm_calls.total_ms is
  'The whole wait for this call, retries and pauses included; latency_ms is the last attempt only. Issue #652.';

create index if not exists llm_calls_decision_idx on llm_calls(decision_id) where decision_id is not null;
