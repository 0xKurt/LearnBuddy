-- Pages go up while she is still taking them (issue #56): the material is reserved with the
-- first page, not with the send. A reservation nobody asked to send yet is not a sheet on its
-- way — it is pages lying in her composer. `send_requested_at` is the moment she asked for it
-- ("Senden"), and only then does the home say "Deine Fotos werden gesendet" and Buddy's
-- context count the sheet (CLAUDE.md rule 5: never claim what isn't true).
--
-- Rows that exist now were all reserved by a send, so they get their created_at.

alter table materials add column if not exists send_requested_at timestamptz;

update materials set send_requested_at = created_at where send_requested_at is null;

comment on column materials.send_requested_at is
  'When the learner asked for these pages to be sent (submit). Null: reserved for pages she is still attaching (issue #56).';

-- The home and Buddy's state ask for "reserved but not asked to send" often enough to index it.
create index if not exists materials_awaiting_send_idx
  on materials (learner_id)
  where status = 'awaiting_upload' and send_requested_at is null and archived_at is null;
