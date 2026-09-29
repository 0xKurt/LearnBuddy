-- Memory that stays usable (issue #20). The cap never throws anything away silently: at 60
-- active items `remember` refuses and Buddy asks the learner what he may forget
-- (`tools.ts` MAX_ACTIVE_MEMORIES). The real pain is the other end of that rule — at 60 he
-- cannot remember anything new at all. So from ~45 active items the scheduler asks the model
-- once per kind whether some of them say the same thing (merge) or contradict each other
-- (invalidate), and the room she has carries what she said, not its fifth wording.
--
-- Provenance survives consolidation: an original that was merged is 'superseded' AND points
-- at the row that carries it now (`merged_into`); one that was contradicted is 'superseded'
-- with no successor. Both are erased by `purgeClosedMemories` after the 7-day undo window,
-- like every closed memory (docs/privacy.md) — the foreign key is `on delete set null`, so a
-- successor erased first never blocks its original's deletion.

alter table buddy_memories
  add column merged_into uuid references buddy_memories(id) on delete set null;

-- Every foreign key carries its index, so deleting an account never scans the table
-- (src/__tests__/scale.int.test.ts).
create index buddy_memories_merged_into_idx on buddy_memories(merged_into)
  where merged_into is not null;

-- A merged sentence is neither her literal words nor an edit of hers: it says so, and the
-- memory screen names it that way ("Aus mehreren Dingen zusammengefasst, die du erzählt
-- hast"). Never 'learner_stated' — that source promises a quote.
alter table buddy_memories drop constraint buddy_memories_source_check;
alter table buddy_memories add constraint buddy_memories_source_check
  check (source in ('learner_stated','learner_edited','account_holder','consolidated'));

-- The consolidation job and the model call it makes.
alter table jobs drop constraint jobs_kind_check;
alter table jobs add constraint jobs_kind_check check (kind in (
  'extract_material','buddy_check','buddy_turn','purge_photos','delete_account','purge_content',
  'summarise_session','consolidate_memories'
));

alter table usage_daily drop constraint usage_daily_kind_check;
alter table usage_daily add constraint usage_daily_kind_check
  check (kind in ('buddy_turn','buddy_check','tutor','explain','extraction','pronounce',
                  'transcribe','hints','reexplain','summary','consolidate'));
