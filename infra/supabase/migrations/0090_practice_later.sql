-- „Merk ich mir für nachher" (issue #391, report „Hilfe und Fragen beim Üben" §4): a question she
-- asked the tutor during practice that had nothing to do with the task is answered in one kind
-- sentence that steers back, and the reply offers one chip. On a tap her question is kept as a
-- note on the session, and once the practice is over Buddy brings it up in the chat. Without the
-- tap nothing goes into the chat.
--
-- Two columns on the TUTOR turn of such a question, both additive:
--
--   * `later`: 'offered' — written by code when the tutor classified her question as off-topic
--     (apps/api/src/modules/practice/answer.ts); 'kept' — she tapped the chip
--     (apps/api/src/modules/practice/later.ts). Null on every other turn. The note's text is her own
--     learner turn right before it (seq - 1); nothing is copied, so deleting the session or the
--     account deletes the note with it, and the export already carries both turns.
--   * `later_at`: when she tapped, from the app clock (CLAUDE.md rule 7).

alter table practice_turns add column if not exists later text
  check (later in ('offered', 'kept'));
alter table practice_turns add column if not exists later_at timestamptz;

-- Buddy's STATE reads the kept notes of one learner (modules/buddy/state.ts); almost no turn has one.
create index if not exists practice_turns_later_idx on practice_turns (learner_id)
  where later = 'kept';

comment on column practice_turns.later is
  'Only on the tutor turn after a question to the tutor that had nothing to do with the task (issue #391): offered = the reply carried the chip "Merk ich mir für nachher"; kept = she tapped it, and Buddy brings her question (the learner turn at seq - 1) up in the chat after the practice. Null everywhere else.';
comment on column practice_turns.later_at is
  'When she tapped "Merk ich mir für nachher" (issue #391), from the app clock.';
