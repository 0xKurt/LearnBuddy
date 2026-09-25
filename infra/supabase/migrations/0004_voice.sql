-- Speech to text (spoken chat messages and answers) has its own daily limit.
-- Recordings are never stored (docs/privacy.md).
alter table usage_daily drop constraint usage_daily_kind_check;
alter table usage_daily add constraint usage_daily_kind_check
  check (kind in ('buddy_turn','buddy_check','tutor','explain','extraction','pronounce','transcribe'));
