-- Notifications with buttons (gaps.md #16; docs/architecture.md §Delivery, "Buttons on a
-- notification"): "Jetzt üben", "Heute nicht", "Seltener schreiben". Each goes through the
-- API (rule 5).
--
-- "Seltener schreiben" is her own say, not a count (ADR 0006): from then on Buddy's own
-- initiatives reach the phone only when they are important (time-critical); the rest waits
-- in the app. Agreed reminders and answers to her own actions are not affected. Turning it
-- off again allows more contact: under 16 that needs the parents' PIN (rule 6).
alter table buddy_settings add column phone_only_important boolean not null default false;

-- The answer "Seltener schreiben" on one of Buddy's messages.
alter table buddy_outreach drop constraint buddy_outreach_response_check;
alter table buddy_outreach add constraint buddy_outreach_response_check
  check (response in ('start','later','not_now','dismissed','less'));
