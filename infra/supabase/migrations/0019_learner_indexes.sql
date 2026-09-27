-- Indexes for every foreign key (audit M-68 p2-account-deletion-cascade-unindexed-fks,
-- p2-state-subjects-counts-scan-all-tenants).
--
-- Deleting an account cascades through these columns (ON DELETE CASCADE / SET
-- NULL), and Buddy's state counts questions and sheets per subject. Without an
-- index each deleted row or counted subject scanned the whole table across all
-- learners, so the cost grew with everybody's data instead of her own. Nullable
-- references get partial indexes (only rows that point somewhere).
-- apps/api/src/__tests__/scale.int.test.ts keeps every future foreign key indexed.

create index items_subject_all_idx on items(subject_id);
create index materials_subject_idx on materials(subject_id) where subject_id is not null;
create index materials_goal_idx on materials(goal_id) where goal_id is not null;
create index materials_step_idx on materials(step_id) where step_id is not null;
create index materials_completes_idx on materials(completes_material_id)
  where completes_material_id is not null;
create index materials_merged_into_idx on materials(merged_into) where merged_into is not null;
create index buddy_goals_subject_idx on buddy_goals(subject_id) where subject_id is not null;
create index buddy_steps_goal_idx on buddy_steps(goal_id) where goal_id is not null;
create index practice_sessions_goal_idx on practice_sessions(goal_id) where goal_id is not null;
create index practice_sessions_material_idx on practice_sessions(material_id)
  where material_id is not null;
create index session_items_item_idx on session_items(item_id);
create index practice_turns_item_idx on practice_turns(item_id);
create index practice_turns_learner_idx on practice_turns(learner_id);
create index buddy_messages_decision_idx on buddy_messages(decision_id) where decision_id is not null;
create index buddy_messages_outreach_idx on buddy_messages(outreach_id) where outreach_id is not null;
create index buddy_messages_reply_to_idx on buddy_messages(reply_to_id) where reply_to_id is not null;
create index buddy_memories_source_message_idx on buddy_memories(source_message_id)
  where source_message_id is not null;
create index buddy_memories_supersedes_idx on buddy_memories(supersedes_id)
  where supersedes_id is not null;
create index buddy_decisions_trigger_message_idx on buddy_decisions(trigger_message_id)
  where trigger_message_id is not null;
create index buddy_actions_decision_idx on buddy_actions(decision_id) where decision_id is not null;
create index buddy_outreach_decision_idx on buddy_outreach(decision_id) where decision_id is not null;
create index buddy_outreach_goal_idx on buddy_outreach(goal_id) where goal_id is not null;
create index buddy_outreach_step_idx on buddy_outreach(step_id) where step_id is not null;
create index buddy_outreach_push_token_idx on buddy_outreach(push_token_id)
  where push_token_id is not null;
create index llm_calls_learner_idx on llm_calls(learner_id);
