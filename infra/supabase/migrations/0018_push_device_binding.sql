-- Push tokens bound to an install (docs/architecture.md §Delivery; audit M-65,
-- decision D-6: one active learner per device).
--
-- The app keeps a random install id (never shown, never derived from the
-- hardware). A device gets Buddy's messages for at most one learner: registering
-- a token deactivates every other active token of that install, a different
-- person signing in on it deactivates the previous learner's token
-- (`POST /push-devices/claim`), and signing out releases it
-- (`POST /push-devices/release`, retried by the app until the server has it —
-- even without a session). Tokens registered by older app builds have no
-- install id and keep the old behaviour until the app registers again.
alter table push_tokens
  add column device_id text check (device_id is null or device_id ~ '^[A-Za-z0-9-]{16,64}$');

create unique index push_tokens_device_active_idx
  on push_tokens(device_id) where status = 'active' and device_id is not null;
