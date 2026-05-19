# ADR 0001 — Store learner date of birth, not birth year

- Status: accepted
- Date: 2026-05-19
- Supersedes: the `birth_year` modelling in docs/03-data-model.md §Identity and
  docs/04-api.md §`POST /learners`.

## Context

Learner age gates a hard legal boundary: under DSGVO Art. 8 (and German
implementation) the age of digital consent is **16**. The app must know,
exactly, whether a learner is a minor, because that decides whether
`minor_consent_version` is required and how tone/safety scale (docs/09 §3,
docs/01 §profile).

Until now a learner carried `birth_year` (a `smallint`). Age was derived as
`current_year - birth_year`. Two problems:

1. **Legal imprecision.** Someone born in December 2010 was treated as
   turning 16 on 1 Jan 2026, ~12 months before their actual 16th birthday
   (or vice-versa). For a consent boundary that is not acceptable.
2. **Input ambiguity.** The only date the user typed (and the folder/exam
   date) went through free-text fields. `01/02/2026` is 1 Feb to a German
   user and 2 Jan to others. The product is German-default but multilingual.

The user asked that _all_ dates in the app be chosen via a picker (no typed
formats; Europe uses `DD.MM.YYYY`), and explicitly chose the full
date-of-birth option over keeping a year.

## Decision

- `learners.birth_year smallint` → `learners.birth_date date` (migration
  `0018`). Existing rows backfill to 1 Jan of the recorded year — they never
  had more than year precision, so nothing is lost.
- Shared types expose a single exported `DateOnly` (`YYYY-MM-DD`) zod schema
  (`packages/shared-types/src/enums.ts`); `Learner`/`LearnerCreate` use it.
  `folder.scheduled_for` now reuses the same schema instead of a local copy.
- Age is computed from the full date (`ageInYears`/`isMinor`) on both the
  API (`apps/api/src/lib/date.ts`) and mobile (`apps/mobile/lib/date.ts`).
  The minor boundary is now exact on the birthday.
- Every user-facing date is entered through one component, `LbDatePicker`,
  which renders `DD.MM.YYYY` and emits ISO `YYYY-MM-DD`. There is no
  free-text date entry anywhere in the app.
- `birth_date` stays immutable post-create (absent from `LearnerUpdate`);
  correcting it remains a data-request operation (docs/09 §3).

## Consequences

- Migration `0018` drops `birth_year`; it is immutable once merged (a later
  correction would be a new migration).
- ~22 API test/e2e fixtures move from `birth_year: <year>` to
  `birth_date: '<YYYY-MM-DD>'`; the minor-logic assertions keep their
  adult/minor outcome by choice of backfilled date.
- The admin/profile UI shows a formatted `DD.MM.YYYY` instead of a bare
  year. i18n keys renamed `birth_year_*` → `birth_date_*` across all five
  locales.
- docs/03 and docs/04 are updated to match; this ADR is the record of the
  divergence from their previous `birth_year` shape.
