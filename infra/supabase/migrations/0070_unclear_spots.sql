-- The smallest clarification a sheet needs, instead of "photograph the page again" (issue #164, point 1).
--
-- Until now unclarity had exactly one step. A reading that could not settle one digit — "ist das
-- 12 oder 17?", a word under a reflection — reported the whole PAGE as partly read
-- (`materials.page_problems`, migration 0009) and wrote no question for that task. The learner
-- then got the coarse notice ("eine Seite konnte ich nicht ganz lesen") and was asked to
-- photograph a whole page again for one smudged digit. She never learned WHERE it stuck, so she
-- could not help — and the question for that task was simply gone.
--
-- Now the reading may name the spot and the readings it could be, and the app asks HER, in words,
-- with her sheet in her hand: the task as printed, what is unclear about it, and the two to four
-- readings. She taps one, and the question for that task is written from the reading SHE
-- confirmed. Everything else on the sheet is read and usable throughout: the sheet never leaves
-- `ready`, exactly as a task Buddy cannot practise costs only itself (issue #198).
--
-- Why words and not a cut-out of the photo: a box would have to come from the same model that
-- just said it could not read that spot, and a wrong box shows her the wrong part of her own
-- sheet — she would answer about another task and the app would write a question nobody asked
-- for. The crop machinery exists (`materials/images.ts`), and it is deliberately outside the
-- reading, as a bonus that may fail. An ask may not be a bonus. The page she sent is shown
-- beside the question from her own phone (no coordinates, no crop) and the words carry the ask.
--
-- Three rules this table exists to keep:
--   * No invented question. Until she answers, the question does not exist; the answer is one of
--     the readings the server stored, named by the alias the server issued (`ref`), never free
--     text the model would have to interpret (CLAUDE.md rules 1 and 2).
--   * The ask is opt-out. `dismissed` is one tap ("weiß ich nicht"), and an unanswered ask
--     expires at `expires_at` — the same day-long window the page notice uses, while the sheet
--     is still at hand. Nothing nags, nothing is counted (rule 6).
--   * Her answer lands. `answered` queues one more reading of the same photos with the confirmed
--     reading named — the multi-pass machinery of issue #150 (`more_items`, dedupe by normalised
--     prompt), not a second mechanism. `items_added` records what came of it, so a clarification
--     that still could not be written says so instead of going quiet (rule 5).
create table material_unclear_spots (
  id uuid primary key default gen_random_uuid(),
  learner_id uuid not null references learners(id) on delete cascade,
  -- The material whose PHOTOS hold the spot: pages added to an earlier sheet are read again
  -- from their own photos, not from the sheet's.
  material_id uuid not null references materials(id) on delete cascade,
  -- The sheet the learner sees and answers for (the merge target, else the material itself):
  -- her answer names this sheet and the alias, and the question joins this sheet.
  sheet_id uuid not null references materials(id) on delete cascade,
  -- The alias the server issued, unique per sheet ('u1', 'u2', …). The model never writes an id.
  ref text not null check (ref ~ '^u[0-9]+$'),
  -- Which of her photos the spot is on, so the app can show that page from her own phone.
  page int not null check (page >= 1),
  -- The task as PRINTED, so she recognises which one is meant (like `not_practicable.task`).
  task text not null check (length(task) between 1 and 120),
  -- What about it could not be read, in a few words of her language.
  about text not null check (length(about) between 1 and 80),
  -- The readings it could be, in the order the reading gave them: ["12", "17"]. Two to four;
  -- she picks one by its position ('r1' … 'r4'), which the server resolves to this text.
  readings jsonb not null check (
    jsonb_typeof(readings) = 'array'
    and jsonb_array_length(readings) between 2 and 4
  ),
  -- open: asked, nothing done · answered: she picked one, a reading is queued · read: that
  -- reading ran (see items_added) · dismissed: she said she does not know · expired: the window
  -- passed unanswered. Only `open` is ever asked about, and only once at a time.
  status text not null default 'open'
    check (status in ('open', 'answered', 'read', 'dismissed', 'expired')),
  -- The reading SHE confirmed, copied from `readings` server-side. Null until she answers.
  answer text,
  -- How many questions the clarified reading added. 0 after a reading that still could not
  -- write it: Buddy says that plainly rather than letting the answer vanish.
  items_added int not null default 0 check (items_added >= 0),
  asked_at timestamptz not null,
  expires_at timestamptz not null,
  answered_at timestamptz,
  read_at timestamptz,
  seq bigserial not null,
  unique (sheet_id, ref)
);

comment on table material_unclear_spots is
  'One spot on a sheet the reading could not settle, with the readings it could be. The learner picks one (by the alias the server issued) and the question for that task is written from HER reading; an ignored ask expires and costs the sheet nothing. Issue #164 point 1.';

-- The one hot path: the open ask of this learner (the home notice and Buddy''s STATE).
create index material_unclear_spots_open_idx
  on material_unclear_spots (learner_id, seq)
  where status in ('open', 'answered');

-- Every foreign key carries an index, so deleting an account does not scan whole tables
-- (scale.int.test.ts fails a table without it).
create index material_unclear_spots_learner_idx on material_unclear_spots (learner_id, seq desc);
create index material_unclear_spots_material_idx on material_unclear_spots (material_id);
create index material_unclear_spots_sheet_idx on material_unclear_spots (sheet_id);

-- Nothing reaches this table except through the API's own connection (the same rule every table
-- here follows; the guard in database-exposure.int.test.ts fails a table without it).
alter table material_unclear_spots enable row level security;
