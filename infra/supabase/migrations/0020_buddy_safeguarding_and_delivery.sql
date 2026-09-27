-- Safeguarding, honest failure states and contact promises
-- (docs/architecture.md §Turns, §Proactivity, §Delivery; audit I-9, I-10, N-3, N-7).
--
-- 1. A failed or held-back learner message keeps WHY it failed, so the app can say
--    it honestly ("Nicht angekommen" only when it really did not arrive) and later
--    prompts can leave out a message the provider's safety filter blocked.
--      blocked            the provider's safety filter held it back (Buddy answered
--                         with the fixed, caring reply; no "send again")
--      model_unavailable  the model could not be reached
--      budget             today's limit for conversations is used up
--      invalid            the model's answer could not be used
--      stale              the context kept changing while Buddy thought
--      internal           anything else (a database error, a bug)
alter table buddy_messages
  add column failure_code text check (failure_code in (
    'blocked','model_unavailable','budget','invalid','stale','internal'
  ));

-- 2. Buddy's answer to something the learner just did (her photos were read, her
--    practice is finished) is not an initiative: it always appears in the app and is
--    not held back by the caps or the "previous message unanswered" rule.
alter table buddy_outreach drop constraint buddy_outreach_origin_check;
alter table buddy_outreach
  add constraint buddy_outreach_origin_check check (origin in ('agreed','buddy','learner'));

-- 3. Texts whose words depend on the day they are read ("Morgen ist …") are rendered
--    when they are delivered, from a template key and its parameters, never frozen
--    at planning time. {"key": "exam.prepared", "params": {...}, "due_date": "YYYY-MM-DD"}
alter table buddy_outreach add column body_template jsonb;

-- 4. A sheet the provider's safety filter refused to read: reading it again would give
--    the same answer, so it is a final state with its own honest words.
alter table materials drop constraint materials_failure_reason_check;
alter table materials
  add constraint materials_failure_reason_check check (failure_reason in (
    'photos_missing','unreadable','not_learning_material','model_error','budget_exhausted','blocked'
  ));
