-- The practice distress check (#747) gets its own daily count: ordinary practice that uses up the
-- tutor's limit must never starve the check of a child's words (config.ts DAILY_LIMITS.safeguard,
-- docs/architecture.md §Limits). Only widens the allowed kinds.
alter table usage_daily drop constraint usage_daily_kind_check;
alter table usage_daily add constraint usage_daily_kind_check
  check (kind in ('buddy_turn','buddy_check','tutor','explain','extraction','pronounce',
                  'transcribe','hints','reexplain','summary','figures','consolidate',
                  'embedding','safeguard'));
