-- A destructive action waiting for HER word, not for the model's reading of it (issue #151).
--
-- Deleting a sheet cannot be taken back: the photos and the transcript are queued for
-- erasure right away. Until now the guard was `requireAsked`, which looked at one bit of
-- the last applied decision — `output->>'asks_permission'` — and it failed in both
-- directions (external audit 30.09., F6):
--
--   * After a lookup the bit sits in `output->'final'`, so a correct "ja, lösch das" was
--     REFUSED — and looking the sheet up first is the normal way this conversation goes.
--   * The bit says only that SOMETHING was asked, not what about. An unrelated question in
--     the turn before authorised the deletion, even after she said "nein, behalte es".
--
-- Consent is the one thing the model must not infer (CLAUDE.md rule 1). So the model can
-- only ever PROPOSE now: the proposal lands here, the app shows her a card with the sheet's
-- name, and deleting happens when she taps it — bound to this operation, this object, once,
-- and not for ever (docs/UX-PRINCIPLES.md §18: the library's confirm sheet, in the
-- conversation).
create table buddy_pending_actions (
  id uuid primary key default gen_random_uuid(),
  learner_id uuid not null references learners(id) on delete cascade,
  operation text not null check (operation in ('delete_material', 'delete_item')),
  material_id uuid not null references materials(id) on delete cascade,
  -- delete_item: the one question, resolved server-side from what she said.
  item_id uuid references items(id) on delete cascade,
  -- What the card shows her, as it read when she was asked: a sheet whose title changes
  -- afterwards must not silently change what she agreed to.
  title text,
  detail text,
  status text not null default 'open'
    check (status in ('open', 'confirmed', 'declined', 'expired', 'superseded')),
  asked_at timestamptz not null,
  expires_at timestamptz not null,
  decided_at timestamptz,
  seq bigserial not null
);

comment on table buddy_pending_actions is
  'A destructive action Buddy proposed and the learner has not answered yet. Her tap is the consent; the model can never delete by itself. Issue #151.';

create index buddy_pending_actions_open_idx
  on buddy_pending_actions (learner_id, operation, material_id)
  where status = 'open';

-- The card is drawn from the action that proposed it: one look-up per thread page.
create index buddy_pending_actions_learner_idx on buddy_pending_actions (learner_id, seq desc);

-- Nothing reaches this table except through the API's own connection (the same rule every
-- table here follows; the guard in scale.int.test.ts fails a table without it).
alter table buddy_pending_actions enable row level security;

-- Every foreign key carries an index, so deleting an account does not scan whole tables.
create index buddy_pending_actions_material_idx on buddy_pending_actions (material_id);
create index buddy_pending_actions_item_idx on buddy_pending_actions (item_id) where item_id is not null;
