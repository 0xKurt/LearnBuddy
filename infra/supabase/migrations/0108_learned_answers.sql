-- Antworten, die der Schlüssel aus einem Tutor-Urteil lernt, mit Herkunft und Rücknahme
-- (KI-Audit F16, issue #675).
--
-- Wenn der Tutor (ein Modell) eine kurze Antwort, die die Regeln nicht kannten, für richtig hält,
-- kommt sie in `items.accepted_answers` und wird ab dann ohne Modell als richtig gewertet
-- (`practice/answerApply.ts`, #227). Ein einziges Fehlurteil wurde so zur dauerhaften Regel, und
-- nichts sagte, woher der Eintrag kam. Hier steht jede so gelernte Antwort mit ihrer Herkunft:
-- der Zug, in dem sie beurteilt wurde, und die Version des Tutor-Prompts. Sie ist vorläufig
-- (`provisional`); bestreitet sie die Bewertung dieser Frage („Die Bewertung stimmt nicht"),
-- nimmt Code die gelernten Antworten der Frage wieder aus dem Schlüssel (`retracted`).
--
-- Kein Backfill: ältere gelernte Einträge sind von denen aus dem Blatt nicht zu unterscheiden,
-- und eine geratene Herkunft wäre schlimmer als keine (Regel 5).
create table learned_answers (
  id uuid primary key default gen_random_uuid(),
  learner_id uuid not null references learners(id) on delete cascade,
  item_id uuid not null references items(id) on delete cascade,
  answer text not null check (length(answer) between 1 and 80),
  -- Ihr Zug, den der Tutor für richtig hielt; die Antwort bleibt, wenn der Zug gelöscht wird.
  turn_id uuid references practice_turns(id) on delete set null,
  prompt_version text not null,
  status text not null default 'provisional' check (status in ('provisional', 'retracted')),
  created_at timestamptz not null,
  retracted_at timestamptz,
  check ((status = 'retracted') = (retracted_at is not null)),
  unique (item_id, answer)
);

comment on table learned_answers is
  'Antworten, die items.accepted_answers aus einem Tutor-Urteil gelernt hat: Herkunft (Zug, Prompt-Version) und Status vorläufig/zurückgenommen. Eine bestrittene Bewertung nimmt sie aus dem Schlüssel. Issue #675.';

create index learned_answers_item_idx on learned_answers (item_id) where status = 'provisional';
create index learned_answers_learner_idx on learned_answers (learner_id);
-- The deletion cascade from practice_turns never scans the table (scale.int.test.ts).
create index learned_answers_turn_idx on learned_answers (turn_id);

alter table learned_answers enable row level security;
