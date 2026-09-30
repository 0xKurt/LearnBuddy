-- Whether a message's own words may be put in front of a model again (issue #149).
--
-- The promise already stood in two places. docs/privacy.md: "A message the provider's
-- safety filter blocked is kept (her conversation, her data), marked `blocked`, and never
-- sent to the model again" — and, for a distress disclosure, that it "cannot reach the
-- memory screen, the export, later prompts or a lock screen".
--
-- Code kept it in exactly one path. `turnDialogue` swaps a blocked message for a fixed
-- "held back" line before the next turn; the session summariser, which reads the same
-- table, had no such rule. So the one text the code swore never to send again went to the
-- summary model, and a summary of a distress disclosure could come back as STATE — derived
-- knowledge, where `buddy_memories` stays empty as promised.
--
-- One column answers the one question, so a new reader has one thing to respect instead of
-- two conventions to rediscover. Null is the normal case: her words are hers and stay in
-- her conversation either way (the app shows them, the export contains them, deleting the
-- conversation deletes them). This says only what a MODEL may be told later.
alter table buddy_messages
  add column recall_block text
    check (recall_block in ('blocked', 'concern'));

comment on column buddy_messages.recall_block is
  'Why this message must never enter a model context again (null: it may). blocked = the provider''s safety filter held it; concern = a distress disclosure. Issue #149.';

-- What the safety filter already held back carries the same rule from now on.
update buddy_messages set recall_block = 'blocked' where failure_code = 'blocked';

-- Every later model context filters on this, so it must be cheap on the hot path.
create index buddy_messages_recall_block_idx
  on buddy_messages (learner_id, seq)
  where recall_block is not null;
