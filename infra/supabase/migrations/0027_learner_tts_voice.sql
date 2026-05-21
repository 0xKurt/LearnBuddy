-- 0027 — Learner TTS voice preference.
--
-- The conversational tutor reads opener + replies aloud via GCP Chirp HD.
-- A single voice tier serves every learner today (de-DE-Chirp3-HD-Aoede)
-- but kids report a strong preference for a voice that "matches" them.
-- This column lets each learner pick from a curated short list in the
-- admin → Stimme settings screen. NULL = use the gateway's per-locale
-- default (currently Aoede across all 5 supported locales).
--
-- Storage is the BARE voice character ("Aoede", "Kore", ...) not the
-- full GCP voice name (de-DE-Chirp3-HD-Aoede). The server pairs it with
-- the learner's ui_locale at synth time so the same preference survives
-- a language change.

alter table public.learners
  add column tts_voice text;

comment on column public.learners.tts_voice is
  'Curated Chirp HD voice character (e.g. ''Aoede''). NULL = locale default.';
