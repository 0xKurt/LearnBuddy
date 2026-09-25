-- Buddy's event log (ADR 0005 §Events and schedules, stage 4): things that
-- just happened, written in the same transaction as the change that caused
-- them; subscribers (code) decide what follows, e.g. waking Buddy for a
-- check. Schedules (countdowns, reminders, routine) stay jobs. created_at
-- comes from the app clock (CLAUDE.md rule 7).

create table buddy_events (
  id uuid primary key default gen_random_uuid(),
  learner_id uuid not null references learners(id) on delete cascade,
  type text not null check (type in ('material_ready','session_finished','homework_ready')),
  -- The row it is about (material or session); one event per type and row.
  ref_id uuid not null,
  data jsonb not null default '{}',
  created_at timestamptz not null,
  -- Set when a Buddy check has looked at it.
  handled_at timestamptz
);
create unique index buddy_events_once_idx on buddy_events(type, ref_id);
create index buddy_events_learner_idx on buddy_events(learner_id, created_at desc);
alter table buddy_events enable row level security;
