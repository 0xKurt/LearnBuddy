-- 0017 — Indexes on every foreign-key column that had none.
-- Source: docs/architecture.md §Limits; audit p2-account-deletion-cascade-unindexed-fks.
--
-- Deleting a parent row (a message, a decision, an item, a learner) makes Postgres find the
-- referencing rows for ON DELETE CASCADE / SET NULL. Without an index that is a scan of the
-- whole table across all learners, once per deleted row: the account deletion cascade took
-- seconds per learner at 300k messages. With these, its cost follows the learner's own data.
-- Nullable SET NULL columns get partial indexes (only rows that point somewhere).

create index if not exists buddy_actions_decision_idx on buddy_actions(decision_id) where decision_id is not null;
create index if not exists buddy_decisions_trigger_msg_idx on buddy_decisions(trigger_message_id) where trigger_message_id is not null;
create index if not exists buddy_goals_subject_idx on buddy_goals(subject_id) where subject_id is not null;
create index if not exists buddy_memories_source_msg_idx on buddy_memories(source_message_id) where source_message_id is not null;
create index if not exists buddy_memories_supersedes_idx on buddy_memories(supersedes_id) where supersedes_id is not null;
create index if not exists buddy_messages_decision_idx on buddy_messages(decision_id) where decision_id is not null;
create index if not exists buddy_messages_outreach_idx on buddy_messages(outreach_id) where outreach_id is not null;
create index if not exists buddy_messages_reply_to_idx on buddy_messages(reply_to_id) where reply_to_id is not null;
create index if not exists buddy_outreach_decision_idx on buddy_outreach(decision_id) where decision_id is not null;
create index if not exists buddy_outreach_goal_idx on buddy_outreach(goal_id) where goal_id is not null;
create index if not exists buddy_outreach_push_token_idx on buddy_outreach(push_token_id) where push_token_id is not null;
create index if not exists buddy_outreach_step_idx on buddy_outreach(step_id) where step_id is not null;
create index if not exists buddy_steps_goal_idx on buddy_steps(goal_id) where goal_id is not null;
create index if not exists items_subject_idx on items(subject_id) where subject_id is not null;
create index if not exists llm_calls_learner_idx on llm_calls(learner_id, created_at);
create index if not exists materials_completes_idx on materials(completes_material_id) where completes_material_id is not null;
create index if not exists materials_goal_idx on materials(goal_id) where goal_id is not null;
create index if not exists materials_merged_into_idx on materials(merged_into) where merged_into is not null;
create index if not exists materials_step_idx on materials(step_id) where step_id is not null;
create index if not exists materials_subject_idx on materials(subject_id) where subject_id is not null;
create index if not exists practice_sessions_goal_idx on practice_sessions(goal_id) where goal_id is not null;
create index if not exists practice_sessions_material_idx on practice_sessions(material_id) where material_id is not null;
create index if not exists practice_turns_item_idx on practice_turns(item_id);
create index if not exists practice_turns_learner_idx on practice_turns(learner_id);
create index if not exists session_items_item_idx on session_items(item_id);
