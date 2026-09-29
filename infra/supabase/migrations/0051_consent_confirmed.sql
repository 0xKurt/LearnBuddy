-- The e-mail address of the account is confirmed anyway: Supabase Auth has confirmations on, so
-- no session exists before the link in the mail was clicked. What was missing is the record that
-- this click is also the account holder's confirmation of the consent they gave in the app —
-- the parent's e-mail loop the EDPB describes as a reasonable effort to verify a child's
-- consent (Guidelines 05/2020 on consent, Example 23; issue #30). The confirmation mail now
-- carries the consent wording in as many words (docs/consent-email-templates.md), and the
-- instant Supabase recorded for the click is kept next to the consent itself (consent_at).
--
-- Nothing waits for this column. A mail that was slow, filtered or lost never locks the learner
-- out of her own learning; the record says what happened, it does not gate anything.

alter table accounts add column if not exists consent_confirmed_at timestamptz;

comment on column accounts.consent_confirmed_at is
  'When the account holder confirmed the consent by clicking the link in the confirmation e-mail: the instant Supabase Auth recorded (email_confirmed_at), written by the first request that carries it and never overwritten (EDPB Guidelines 05/2020 Example 23, issue #30).';
