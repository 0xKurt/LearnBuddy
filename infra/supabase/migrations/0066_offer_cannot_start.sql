-- An offer whose questions could not be written is no longer an offer (issue #196).
--
-- `offer_learning` changes nothing: it puts a button in the chat, and the questions behind it
-- are written when she taps — or, since issue #48, a few seconds earlier in the background,
-- under the offer's own action id. That background run is the first moment anyone knows whether
-- the offer can start at all, and until now it threw the answer away (`prepare.ts` swallowed
-- the error on purpose: "her tap prepares it then"). Two things followed from that:
--
--   * her tap met the refusal instead — the card replaced "Let's go" with "I can't prepare
--     anything from that, sorry", seconds after Buddy's reply said the practice was ready
--     (measured 01.10. during the product video, reproduced twice live);
--   * STATE went on calling that button "waiting for her, she has not started it" (issue #184),
--     so Buddy kept pointing her at a card that cannot start. Claiming what is not proven is
--     exactly what rule 5 forbids.
--
-- So the refusal is kept. One nullable instant, written only by the preparation that was
-- refused, read by `loadStandingOffers` (it stops standing) and by the thread (the app shows
-- the quiet line instead of a button she would tap in vain). Nothing is deleted and nothing is
-- rewritten: the action stays exactly as it was applied.
alter table buddy_actions add column cannot_start_at timestamptz;

comment on column buddy_actions.cannot_start_at is
  'offer_learning only: when preparing this offer was refused as unusable, so its button cannot start anything. Written by the background preparation (practice/prepare.ts), never by a model. Issue #196.';
