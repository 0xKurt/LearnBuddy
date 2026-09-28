-- Two more curated voices (owner request 2026-09-28): soft (Chirp3 HD Aoede)
-- and deep (Charon). The check mirrors the contract's VOICE_NAMES.
alter table buddy_settings drop constraint buddy_settings_voice_check;
alter table buddy_settings
  add constraint buddy_settings_voice_check
  check (voice in ('warm', 'friendly', 'bright', 'clear', 'soft', 'deep'));
