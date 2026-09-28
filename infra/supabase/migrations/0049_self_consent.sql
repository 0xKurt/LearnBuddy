-- With her 16th birthday the learner decides for herself (EDPB §147–149, issue #31): the
-- parents' consent carried her until then, from now on hers does. The app asks her once,
-- warmly, and records what she agreed to — the same way the parents' consent was recorded.
--
-- Nothing is taken away while she has not answered: she is not locked out of her own
-- learning. What changes is who the record names.

alter table learners add column if not exists self_consent_version text;
alter table learners add column if not exists self_consent_at timestamptz;

comment on column learners.self_consent_at is
  'When the learner confirmed the privacy text for herself (from 16; before that the parents did, minor_consent_at).';

create index if not exists learners_self_consent_due_idx
  on learners (birth_date)
  where relation = 'child' and self_consent_at is null;
