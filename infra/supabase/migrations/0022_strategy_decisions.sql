-- 0022 — Strategy decisions telemetry.
-- Source: docs/LEARNER-EXPERIENCE-PLAN.md Phase B4.
--
-- Records the pedagogical move the selector picked for each tutor turn,
-- plus a snapshot of the runtime signal that drove the decision. Used
-- for two things:
--
--   1. The variety penalty in lib/strategy/select.ts — without persisted
--      recent_moves the selector can't avoid repeating the same move 3
--      turns in a row.
--
--   2. Empirical tuning of move preconditions. After a week of data we
--      can see how often each move fires, which moves correlate with
--      'correct' next-turn verdicts, and which moves the selector
--      stalls on. That informs which preconditions to widen or tighten.
--
-- The table is append-only; no updates. One row per tutor turn.

create table strategy_decisions (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions(id) on delete cascade,
  learner_id uuid not null references learners(id) on delete cascade,
  item_id uuid references items(id) on delete cascade,
  turn_index int not null,
  move_id text not null,
  -- Snapshot of the runtime signal AT decision time. Cheap to store,
  -- expensive to reconstruct later if we ever want to ask "why did the
  -- selector pick that move on that turn?".
  signal_snapshot jsonb not null,
  -- The list of moves that were ALSO eligible (priority + applies +
  -- !forbidden), in priority order. Useful for understanding what the
  -- selector almost picked instead.
  alternates jsonb not null default '[]'::jsonb,
  -- Short human-readable reason, e.g. "selected_by_priority_5" or
  -- "variety_penalty_avoided_direct_hint_broad". Never shown to the
  -- learner. Logged for ops.
  reason text not null,
  -- Filled in AFTER the tutor turn completes — the verdict the model
  -- produced (post-safety-net). Null on early failures.
  verdict_after text,
  created_at timestamptz not null default now()
);

-- Per-session move-recency lookup (the selector's variety penalty
-- queries this every turn).
create index strategy_decisions_session_idx
  on strategy_decisions (session_id, turn_index desc);

-- Per-learner aggregate lookup (tuning queries that look at move-mix
-- per learner over weeks).
create index strategy_decisions_learner_idx
  on strategy_decisions (learner_id, created_at desc);

-- Move-frequency rollup (tuning).
create index strategy_decisions_move_idx on strategy_decisions (move_id, created_at desc);

alter table strategy_decisions enable row level security;
-- No learner-facing policy: this table is service-role-only. Telemetry
-- about the system's pedagogical choices is not part of the learner-
-- visible surface and never should be (L1 invariant — the learner
-- never reads analytical data about themselves).
