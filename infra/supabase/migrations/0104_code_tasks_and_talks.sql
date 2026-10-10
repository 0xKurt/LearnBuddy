-- Informatik (issue #262) und das Referat als Ziel mit Probevortrag und Lautlesen (issue #264).
-- docs/architecture.md §Informatik, §Talks and reading aloud.
--
-- ═══════════════ 1. Programme und SQL-Abfragen (#262) ═══════════════
--
-- Dieselbe Änderung, die `items.bar_task` (0064) und `items.staff_task` (0078) schon waren: eine
-- Spalte für die geprüfte Aufgabe, aus der Code alles andere gerechnet hat. Hier steht, was das
-- Modell geschrieben hat — ein Programm und eine von drei Aufgaben (Ausgabe vorhersagen, Zeile
-- des Fehlers, Funktion schreiben) oder eine kleine Tabelle mit einer SQL-Abfrage (`CodeTask`,
-- packages/shared-types/src/contracts/code.ts) —, und zwar NACH der Ausführung: Ausgabe, erwartete
-- Werte und Ergebniszeilen sind die des Laufs in der Sandbox (apps/api/src/sandbox/), nie die
-- Behauptung des Modells; wich sie ab, gibt es die Frage nicht.
--
-- Gespeichert wird die Aufgabe aus denselben Gründen wie Balken und Notenzeile:
--   * sie ist die EINE Quelle der Frage;
--   * sie sagt der App, welche Fläche die Frage hat (Zeile antippen oder Code tippen), ohne die
--     Lösung zu verraten;
--   * sie sagt der Bewertung, dass hier Code läuft und kein Text verglichen wird: ihre Funktion
--     läuft gegen die Tests („3 von 5 Tests bestanden“), ihre Abfrage auf der Tabelle — ohne Modell.
--
-- Kein Backfill: alte Zeilen haben keine Aufgabe und werden behandelt wie bisher.
alter table items add column if not exists code_task jsonb;

comment on column items.code_task is
  'Die geprüfte Informatik-Aufgabe (CodeTask in packages/shared-types/src/contracts/code.ts), nach der Ausführung in der Sandbox (apps/api/src/sandbox/): Ausgabe, Fehlerzeile, erwartete Werte und Ergebniszeilen sind die des Laufs, nie vom Modell übernommen. Frage, Anzeige, Schlüssel und Tipps sind daraus gerechnet (modules/practice/code.ts, codeSql.ts). Issue #262.';

-- Eine Frage hat höchstens EINE gerechnete Quelle (0078 hat das für zwei gesagt; jetzt sind es
-- drei). Sonst entschiede die Reihenfolge im Code, welche Fläche sie bekommt. Die alte Bedingung
-- wird ersetzt, nicht ergänzt: zwei Bedingungen für dieselbe Regel wären zwei Stellen, die beim
-- nächsten Mal nur zur Hälfte geändert werden.
alter table items drop constraint if exists items_one_computed_source;
alter table items add constraint items_one_computed_source
  check (num_nonnulls(bar_task, staff_task, code_task) <= 1);

-- ═══════════════ 2. Das Referat als Ziel (#264) ═══════════════
--
-- Ein Referat, eine GFS, eine Präsentation, ein Gedichtvortrag hat einen Tag wie ein Test, aber
-- keine Fragen: es hat Schritte, die sie SELBST tut (Thema, Gliederung, Quellen, Folien oder
-- Karteikarten, Probevortrag). Darum eine eigene Ziel-Art und eine eigene Schritt-Art; Übungs- und
-- Foto-Schritte bleiben, wie sie sind. Die Bedingungen werden ersetzt, nicht ergänzt (wie 0078).
alter table buddy_goals drop constraint if exists buddy_goals_kind_check;
alter table buddy_goals add constraint buddy_goals_kind_check
  check (kind in ('exam', 'topic', 'talk'));
-- Wie lang der Vortrag sein soll, in Minuten, wenn sie es gesagt hat. Der Probevortrag misst
-- dagegen; ohne Vorgabe wird nur gemessen, nicht verglichen.
alter table buddy_goals add column if not exists talk_minutes smallint
  check (talk_minutes is null or talk_minutes between 1 and 45);
alter table buddy_goals add constraint buddy_goals_talk_has_date
  check (kind <> 'talk' or due_date is not null);
alter table buddy_goals add constraint buddy_goals_minutes_only_for_talks
  check (talk_minutes is null or kind = 'talk');

-- `task`: ein Schritt, den sie selbst erledigt — sie sagt Buddy, dass er erledigt ist
-- (learner_reported), oder der Probevortrag belegt ihn (evidence). payload.stage sagt, welcher.
alter table buddy_steps drop constraint if exists buddy_steps_kind_check;
alter table buddy_steps add constraint buddy_steps_kind_check
  check (kind in ('practice', 'capture', 'task'));

-- ═══════════════ 3. Was von einem Probevortrag bleibt (#264) ═══════════════
--
-- Die Aufnahme wird NIE gespeichert: sie lebt nur für den einen Modellaufruf im Speicher der API
-- (wie jede Sprachaufnahme, docs/privacy.md). Auch das Transkript nicht — es ist ihr gesprochenes
-- Wort. Was bleibt, sind Messwerte, die Code aus Transkript und Aufnahmedauer rechnet, und beim
-- Lautlesen die Wörter DES VORGELEGTEN TEXTES, die sie übersprungen oder anders gelesen hat.
create table rehearsals (
  id uuid primary key default gen_random_uuid(),
  learner_id uuid not null references learners(id) on delete cascade,
  -- Idempotenz: dieselbe Aufnahme zweimal geschickt (Netz weg) ergibt einen Eintrag.
  client_request_id uuid not null,
  -- Die Karte, auf der sie aufgenommen hat (Buddys offer_rehearsal).
  action_id uuid not null references buddy_actions(id) on delete cascade,
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
  unique (learner_id, client_request_id),
  constraint rehearsals_talk_or_text check (
    (kind = 'talk' and fillers is not null) or (kind = 'read_aloud' and structure is null)
  )
);

comment on table rehearsals is
  'What a rehearsal talk or a read-aloud left behind: measurements computed by code (duration, words per minute, filler sounds, skipped/misread words OF THE GIVEN TEXT) and per part of a talk whether it was heard. Never the recording, never the transcript. Issue #264.';

create index rehearsals_learner_idx on rehearsals (learner_id, created_at desc);
create index rehearsals_action_idx on rehearsals (action_id);
create index rehearsals_goal_idx on rehearsals (goal_id) where goal_id is not null;
create index rehearsals_step_idx on rehearsals (step_id) where step_id is not null;

alter table rehearsals enable row level security;

-- Buddys Nachricht nach einem Probevortrag zeigt auf das, was gemessen wurde (wie 0091 beim
-- Rollenspiel): der Server liefert die Messung aus der EINEN gespeicherten Fassung mit der
-- Nachricht aus, nichts wird kopiert.
alter table buddy_messages add column if not exists rehearsal_id uuid
  references rehearsals(id) on delete set null;
create index if not exists buddy_messages_rehearsal_idx on buddy_messages (rehearsal_id)
  where rehearsal_id is not null;

comment on column buddy_messages.rehearsal_id is
  'Only on Buddy''s message after a rehearsal talk or a read-aloud (issue #264): the rehearsal whose measurements the app shows as the result card. Null everywhere else.';
