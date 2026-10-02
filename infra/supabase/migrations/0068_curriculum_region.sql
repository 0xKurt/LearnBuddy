-- Where the learner goes to school, as far as the curriculum is concerned (issue #199).
--
-- At twelve verified places in docs/lehrplan-und-uebungsformen.md the same answer is right
-- in one Bundesland and wrong in another: the sentence-element analysis of one German
-- sentence has four different expected solutions, the operator "vergleichen" demands a
-- closing judgement in Bayern and explicitly none in Niedersachsen, the Hypothesentest is
-- compulsory in Berlin/Brandenburg and BW and absent from the NRW and Bayern core
-- curriculum. Without this column Buddy can teach a child something that counts as a
-- mistake in her own class test.
--
-- Nullable on purpose: every row that exists before this migration has no value, and
-- nothing in the app blocks or fails on NULL — "not known" simply means no state-specific
-- rule is applied. New profiles must supply it (POST /learner, contracts/identity.ts).
--
-- No backfill here (owner 2026-10-02): a migration is schema, and it runs against every
-- database. Existing rows are set by hand, as a one-off.
--
-- The keys are the ISO 3166-2:DE codes in lower case, plus 'other' for a learner who is not
-- at a German school (the app ships in five languages, and a required field with only the
-- sixteen German states would be a dead end for her). The CHECK is the same closed list the
-- zod enum CurriculumRegion holds, so the database cannot store a value the contract does
-- not know — the model never writes this value at all (CLAUDE.md rule 2).

alter table learners
  add column curriculum_region text
    check (curriculum_region in (
      'bw', -- Baden-Württemberg
      'by', -- Bayern
      'be', -- Berlin
      'bb', -- Brandenburg
      'hb', -- Bremen
      'hh', -- Hamburg
      'he', -- Hessen
      'mv', -- Mecklenburg-Vorpommern
      'ni', -- Niedersachsen
      'nw', -- Nordrhein-Westfalen
      'rp', -- Rheinland-Pfalz
      'sl', -- Saarland
      'sn', -- Sachsen
      'st', -- Sachsen-Anhalt
      'sh', -- Schleswig-Holstein
      'th', -- Thüringen
      'other'
    ));

comment on column learners.curriculum_region is
  'Bundesland of the learner''s school as an ISO 3166-2:DE code in lower case, or ''other'' '
  'for a school outside Germany; NULL for a profile created before issue #199. Decides which '
  'state-specific curriculum rules apply (docs/lehrplan-und-uebungsformen.md). Asked once as '
  'a required field at registration; part of the export and of the account deletion.';
