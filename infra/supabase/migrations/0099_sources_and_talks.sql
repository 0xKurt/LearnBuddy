-- Neue Lernquellen und das Referat als Ziel (issues #259, #264; docs/architecture.md §Material,
-- §Talks and reading aloud).
--
-- ─────────────── 1. Woher ein Blatt kommt (#259) ───────────────
--
-- Bisher war jedes Foto ein Arbeitsblatt. Zwei Quellen lesen sich anders und werden anders
-- behandelt, über DENSELBEN Fotoweg (kein zweiter Weg daneben):
--   * corrected_test — eine korrigierte Klassenarbeit. Gelesen werden nur die Aufgaben mit
--     Korrekturzeichen; daraus entstehen NEUE Aufgaben derselben Art (Code verwirft jede, die
--     dem Original gleicht). Note und Punkte werden nie gespeichert: das Schema hat kein Feld
--     dafür, und die Transkription des Modells wird für diese Quelle gar nicht gespeichert —
--     `extracted_text` setzt Code aus den markierten Aufgaben zusammen.
--   * today_notes — ein Hefteintrag vom Tag („Was war heute?"): höchstens fünf kurze Fragen,
--     als Übung für den nächsten Morgen vorbereitet.
-- Hausaufgaben bleiben `purpose = 'homework'`; eine Quelle gibt es nur für Lernstoff.
alter table materials add column source text not null default 'sheet'
  check (source in ('sheet', 'corrected_test', 'today_notes'));
alter table materials add constraint materials_source_is_study
  check (source = 'sheet' or purpose = 'study');

-- Eine korrigierte Arbeit, auf der die Lesung keine einzige angestrichene Aufgabe fand, ist kein
-- unlesbares Foto: ein eigener, ehrlicher Grund (wie `form_not_practicable` in 0067).
alter table materials drop constraint materials_failure_reason_check;
alter table materials
  add constraint materials_failure_reason_check check (failure_reason in (
    'photos_missing','unreadable','not_learning_material','model_error','budget_exhausted','blocked',
    'form_not_practicable','nothing_marked'
  ));

comment on column materials.source is
  'Where the photos come from: sheet (a worksheet or page), corrected_test (only the marked tasks are read, new questions of the same type are written, grades and points are never stored), today_notes (the notebook entry of the day, five questions for the next morning). Issue #259.';

-- ─────────────── 2. Das Referat als Ziel (#264) ───────────────
--
-- Ein Referat, eine GFS, eine Präsentation, ein Gedichtvortrag hat einen Tag wie ein Test,
-- aber keine Fragen: es hat Schritte, die sie SELBST tut (Thema, Gliederung, Quellen, Folien,
-- Probevortrag). Darum eine eigene Ziel-Art und eine eigene Schritt-Art; die Übungs- und
-- Foto-Schritte bleiben, wie sie sind.
alter table buddy_goals drop constraint buddy_goals_kind_check;
alter table buddy_goals add constraint buddy_goals_kind_check
  check (kind in ('exam', 'topic', 'talk'));
-- Wie lang der Vortrag sein soll, in Minuten, wenn sie es gesagt hat. Der Probevortrag misst
-- dagegen; ohne Vorgabe wird nur gemessen, nicht verglichen.
alter table buddy_goals add column talk_minutes smallint
  check (talk_minutes is null or talk_minutes between 1 and 45);
alter table buddy_goals add constraint buddy_goals_talk_has_date
  check (kind <> 'talk' or due_date is not null);
alter table buddy_goals add constraint buddy_goals_minutes_only_for_talks
  check (talk_minutes is null or kind = 'talk');

-- `task`: ein Schritt, den sie selbst erledigt — sie sagt Buddy, dass er erledigt ist
-- (learner_reported), oder der Probevortrag belegt ihn (evidence). payload.stage sagt welcher.
alter table buddy_steps drop constraint buddy_steps_kind_check;
alter table buddy_steps add constraint buddy_steps_kind_check
  check (kind in ('practice', 'capture', 'task'));

-- ─────────────── 3. Was von einem Probevortrag bleibt (#264) ───────────────
--
-- Die Aufnahme selbst wird NIE gespeichert: sie lebt nur für den einen Modellaufruf im
-- Speicher der API (wie jede Sprachaufnahme, docs/privacy.md). Auch das Transkript nicht —
-- es ist ihr gesprochenes Wort. Was bleibt, sind Messwerte, die Code aus Transkript und
-- Aufnahmedauer rechnet, und beim Lautlesen die Wörter DES TEXTES, die sie übersprungen oder
-- anders gelesen hat (Wörter des vorgelegten Textes, nicht ihre).
create table rehearsals (
  id uuid primary key default gen_random_uuid(),
  learner_id uuid not null references learners(id) on delete cascade,
  -- Idempotenz: dieselbe Aufnahme zweimal geschickt (Netz weg) ergibt einen Eintrag.
  client_request_id uuid not null,
  kind text not null check (kind in ('talk', 'read_aloud')),
  goal_id uuid references buddy_goals(id) on delete set null,
  step_id uuid references buddy_steps(id) on delete set null,
  -- Die Aufnahmedauer, wie der Rekorder der App sie gemessen hat.
  duration_ms int not null check (duration_ms between 1000 and 600000),
  -- Die Vorgabe (Referat), sonst null.
  target_ms int check (target_ms is null or target_ms between 60000 and 2700000),
  words int not null check (words >= 0),
  words_per_minute int not null check (words_per_minute >= 0),
  fillers int check (fillers is null or fillers >= 0),
  -- Lautlesen: Wörter des Textes, je höchstens 20.
  skipped jsonb not null default '[]'::jsonb check (jsonb_typeof(skipped) = 'array'),
  misread jsonb not null default '[]'::jsonb check (jsonb_typeof(misread) = 'array'),
  -- Referat: je Teil (Einleitung, Hauptteil, Schluss) heard | not_heard | unknown.
  structure jsonb,
  created_at timestamptz not null,
  seq bigserial not null,
  unique (learner_id, client_request_id),
  constraint rehearsals_talk_or_text check (
    (kind = 'talk' and fillers is not null) or (kind = 'read_aloud' and structure is null)
  )
);

comment on table rehearsals is
  'What a rehearsal talk or a read-aloud left behind: measurements computed by code (duration, words per minute, filler sounds, skipped/misread words OF THE GIVEN TEXT) and per part of a talk whether it was heard. Never the recording, never the transcript. Issue #264.';

create index rehearsals_learner_idx on rehearsals (learner_id, seq desc);
create index rehearsals_goal_idx on rehearsals (goal_id) where goal_id is not null;
create index rehearsals_step_idx on rehearsals (step_id) where step_id is not null;

alter table rehearsals enable row level security;
