-- A turn the model provider throttled through every retry is said as such (issue #206,
-- docs/architecture.md §Model calls). Until now a 429 that outlasted the retries read
-- "Buddy konnte gerade nicht antworten", the same as an outage; the app now says "Buddy ist
-- gerade überlastet – gleich nochmal", because that is exactly what the provider told us
-- (rule 5) — and resending in a moment is the right thing to do.
--      busy               the provider answered 429 on every attempt (llm/retry.ts)
alter table buddy_messages drop constraint buddy_messages_failure_code_check;
alter table buddy_messages
  add constraint buddy_messages_failure_code_check check (failure_code in (
    'blocked','model_unavailable','busy','budget','invalid','stale','internal','stopped'
  ));
