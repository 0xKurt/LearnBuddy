-- Wrong PINs lock for 15 minutes after 5, every time: no escalation level
-- (ADR 0006, docs/architecture.md §Limits).
alter table attempt_counters drop column lock_level;
