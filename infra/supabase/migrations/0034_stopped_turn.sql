-- She can stop Buddy's reply while it is being written (docs/architecture.md §Turns, §Speed).
-- A stopped turn is honest, never a half state: her message stays, marked "stopped" (with
-- "Nochmal senden"), and nothing of the reply is stored or applied — the running turn loses
-- its claim, so its answer can no longer be applied (apply.ts messageClaim).
--      stopped            she stopped the reply before it was stored
alter table buddy_messages drop constraint buddy_messages_failure_code_check;
alter table buddy_messages
  add constraint buddy_messages_failure_code_check check (failure_code in (
    'blocked','model_unavailable','budget','invalid','stale','internal','stopped'
  ));
