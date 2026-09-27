# ADR 0006 — Contact without counts, the parents' gate under 16, one PIN lock

- Status: accepted
- Date: 2026-09-27
- Decided by: the product owner
- Replaces: the orchestrator defaults D-8, D-12 and D-14 of the audit remediation
  (`reports/AUDIT-2026-09-27.md` §16.5), and the contact caps of
  [ADR 0004](0004-proactive-buddy.md) and `docs/architecture.md` §Delivery before this change

## Context

The audit remediation had set defaults for three open questions:

- **D-12**: Buddy's messages in the app count toward daily and weekly caps (1 a day, 4 a week by
  default). The same count feeds a gate that holds back the next message while the last one is
  unanswered for 48 hours.
- **D-8**: a child profile stays behind the parents' PIN until 18, so 16- and 17-year-olds cannot
  change their own contact settings or export or delete their data.
- **D-14**: wrong PINs lock for 15 minutes, then 30 minutes, 1 hour and so on, up to 24 hours.

The product owner reviewed these on 2026-09-27 and rejected them. In his words:

- "Die ganze Nachrichten Begrenzung ist sinnlos da sie Kern der App ist."
  (Limiting the messages makes no sense, because messages are the core of the app.)
- "Die Regeln klingen übertrieben." (The rules sound excessive.)
- "Zuviele constraints machen die App kaputt. Das solltest du vermeiden."
  (Too many constraints break the app. Avoid them.)

Buddy is the interface (CLAUDE.md rule 16). A companion that goes quiet after one message a day,
or after one unanswered message, is not the product.

## Decision

1. **No message limits.**
   - Messages in the app are never limited or counted.
   - Messages to the phone have no daily or weekly cap either.
   - The `max_per_day` and `max_per_week` columns are dropped (migration
     `0032_contact_without_caps.sql`). They are also gone from the settings contract, the
     `set_contact` tool (its `fewer` flag), the prompts, the settings screen and the copy in all
     five languages.
   - The 48-hour "unanswered" gate is removed. A daily routine look also runs while contact to
     the phone is off or paused; what it says waits in the app.
2. **What stays.** These are the learner's own say, not limits:
   - Contact outside the app is opt-in: the setting and the OS push permission.
   - Quiet hours at night, a pause, the preferred window and days without messages are her
     settings, and they apply to the phone. What cannot go to the phone waits in the app.
   - Buddy does not raise the same topic twice within 72 hours. This also applies in the app, and
     it is what keeps the identical nudge from being pushed again.
   - Buddy's own message still needs a model-rated relevance of at least 0.6. That is a quality
     bar on what it says, not a count.
   - Buddy's tools can only reduce contact to the phone (CLAUDE.md rule 6).
3. **The parents' gate applies under 16 only.** 16 is the age of consent in DSGVO Art. 8 as set
   in Germany.
   - Under 16: the parents give explicit consent when they create the profile, and their PIN
     is needed to loosen contact, export or delete data, correct the birth date or agree to a
     new privacy text.
   - From 16: she consents and decides herself, also on a profile her parents created.
     `isMinor` is `age < 16`, whoever set the profile up.
4. **PIN lock.** 5 wrong PINs lock for 15 minutes, every time, with no escalation.
   - The lock is counted atomically and shared by every route that takes the PIN
     (`lib/limits.ts`). The right PIN resets it.
   - The `lock_level` column is dropped (migration `0033_pin_lock_without_escalation.sql`).
5. **Request budgets are abuse protection only.** Practice answers are limited to 600 an hour
   and messages to Buddy to 120 an hour, per account. A learner never gets near these numbers,
   so they stay; PIN recovery (5 an hour after a fresh sign-in) stays for the same reason.
6. **General rule from the owner.** Do not add a constraint that is not strictly needed.

## Consequences

- With push off (the default), Buddy may write several times a day in the thread. The topic
  dedupe and the relevance bar are what keep it from repeating itself.
- "Schreib mir weniger" has no count to lower. Buddy pauses the phone, moves the quiet hours
  earlier, narrows the window or rules out days, or asks which of these she wants.
- A 16- or 17-year-old on a child profile sees no parents' step at sign-up. She can turn contact
  on, undo a pause, export and delete by herself.
- Old undo records may still carry `max_per_week`. It is ignored.
- Older app builds that read `max_per_day` / `max_per_week` from `/buddy/settings` no longer find
  them. The app has not been released, so no compatibility shim was added.

## Open points

- CLAUDE.md rule 6 still says "For minors, loosening needs the adult's PIN". The owner updates
  CLAUDE.md; the code means "under 16".
- The per-learner daily model budgets in `config.ts` (`DAILY_LIMITS`, e.g. 80 Buddy turns and 8
  background checks a day) are cost bounds, not contact rules. They were left unchanged. Whether
  80 turns a day can limit normal use is for the owner to decide.
- The legal wording in the privacy text (age of consent 16, consent recorded for 16/17 on a
  parent-created profile) needs **legal review** like the rest of `docs/privacy.md`.
