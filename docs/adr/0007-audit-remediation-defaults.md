# ADR 0007 — Defaults chosen while fixing the audit findings

- Status: accepted (open for the product owner to change any line)
- Date: 2026-09-27
- Context: `reports/AUDIT-2026-09-27.md` §16.5 listed decisions the fixes needed. The owner asked
  to fix everything; these defaults were chosen to do that. [ADR 0006](0006-contact-and-age-rules.md)
  replaces D-8, D-12 and D-14 (decided by the owner).
- Guidance from the owner that applies to all of them: "Zuviele constraints machen die App
  kaputt." A rule stays only when the product needs it; new limits need a reason.

## Decisions

| #    | Topic                        | Default in the code                                                                                                                                                                                         |
| ---- | ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D-1  | Numeric tolerance            | Whole numbers and fractions must match; a decimal key accepts less than half a unit of its last written decimal. A wider tolerance only when the item declares one (capped at a tenth of the key).          |
| D-2  | Spelling                     | In German and language subjects, case, ß and punctuation matter; a miss there is a gentle "Fast richtig". Elsewhere the tutor decides. Settable per item.                                                   |
| D-3  | Expressions and other forms  | A calculation or another form of the right value (`17·23`, `1/8` for `0.125`) goes to the tutor, never a rule verdict.                                                                                      |
| D-4  | Supabase region              | **Not decided.** The link points to London; `docs/privacy.md` still promises the EU. The API only logs a warning. Needs the owner and a legal check before real data exists.                                |
| D-5  | "Beenden" in homework help   | Pauses while tasks are open; a help session stays resumable 14 days from last activity; practice idle for 3 days is abandoned and its step returns to prepared.                                             |
| D-6  | Push tokens                  | Bound to a random install id; one active learner per phone; sign-out releases it on the server (retried).                                                                                                   |
| D-7  | Delete means delete          | "Blatt löschen" and "Frage löschen" erase the content; a removed memory is erased after the 7-day undo window.                                                                                              |
| D-9  | Deletion when storage fails  | The account is deleted anyway; photos follow from a queue, at most 1000 per request, retried and shown in `/health`.                                                                                        |
| D-10 | Distress                     | A fixed, caring reply per language with a helpline (DE 116 111, FR 119, ES 900 20 20 10, IT 19696, EN Childline 0800 1111); adults get 112. No parent notification. **Needs pedagogical and legal review.** |
| D-11 | iOS speech in other language | On-device only for the phone's own language; otherwise the EU recording path.                                                                                                                               |
| D-13 | Agreed reminders             | Always appear in the app, also when paused or late, and say when they are late.                                                                                                                             |

## Consequences

Where a default changes documented behaviour, `docs/architecture.md` and `docs/privacy.md` were
updated in the same change. Each default is covered by the integration tests named in the notes of
the fix that introduced it. Changing one is a code change with its test, not a prompt change.
