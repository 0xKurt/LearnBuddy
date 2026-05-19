-- 0018 — Replace learners.birth_year with a full birth_date.
-- Source: docs/03-data-model.md §Identity, docs/04-api.md §POST /learners,
--         docs/09-privacy.md §3 (DSGVO Art. 8, under-16),
--         docs/adr/0001-birth-date-over-birth-year.md.
--
-- birth_year (year only) made the GDPR under-16 boundary imprecise — a
-- learner flipped minor/adult on Jan 1 instead of on their actual birthday,
-- a window of up to ~12 months of wrong consent handling — and forced the
-- mobile UI into ambiguous free-text date entry. We move to a true calendar
-- date. Existing rows only ever carried year precision, so they backfill to
-- Jan 1 of the recorded year; no information is lost.

alter table learners
  add column birth_date date;

update learners
  set birth_date = make_date(birth_year, 1, 1)
  where birth_year is not null;

alter table learners
  drop constraint if exists learners_birth_year_check;

alter table learners
  drop column birth_year;

alter table learners
  add constraint learners_birth_date_check
  check (birth_date between date '1920-01-01' and date '2035-12-31');
