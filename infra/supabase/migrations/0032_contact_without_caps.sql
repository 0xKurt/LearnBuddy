-- Contact without counts (ADR 0006, docs/architecture.md §Proactivity, §Delivery).
--
-- The product owner decided on 2026-09-27 that Buddy's messages are the core
-- of the app and are not limited: messages in the app are never counted, and
-- messages to the phone have no daily or weekly cap. What stays is the
-- learner's own say — contact to the phone is opt-in, quiet hours, pause,
-- preferred window, days without messages — and no repeat of the same topic.
alter table buddy_settings drop column max_per_day;
alter table buddy_settings drop column max_per_week;
