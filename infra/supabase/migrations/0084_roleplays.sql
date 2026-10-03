-- Rollenspiel in der Fremdsprache (issue #244): Buddy spielt eine Rolle, danach Rückmeldung je
-- Kernpunkt, ohne Note.
--
-- Eng definiert (Owner 02.10.: „kommt drauf an wie man es definiert, weil buddy das schon gut
-- kann"): das Gespräch läuft im Chat und im Gesprächsmodus, das Modell spielt die Rolle — und
-- der RAHMEN steht hier, als Zeile, nicht im Prompt (CLAUDE.md Regel 1):
--
--   * Sprache, Szene, Rolle und die 3–5 Kernpunkte werden einmal beim Start festgelegt und
--     danach von Code in jeden Rollenzug geschrieben. Das Modell kann sie mitten im Spiel nicht
--     ändern, weil es sie nicht schreibt.
--   * `turns` zählt ihre Züge in der Zielsprache. Nach `max_turns` (12) ist Schluss — Code
--     beendet das Spiel im selben Transaktionsschritt, in dem der zwölfte Zug landet.
--   * Höchstens EIN laufendes Spiel pro Lernender (Teilindex unten).
--
-- Kein Backfill, nichts davon wird je zurückgerechnet.
create table buddy_roleplays (
  id uuid primary key default gen_random_uuid(),
  learner_id uuid not null references learners(id) on delete cascade,
  -- Die Sprache, in der gespielt wird (ein Code, wie `items.prompt_lang`).
  language text not null check (language in ('de', 'en', 'fr', 'es', 'it')),
  -- In ihrer App-Sprache, wie die Karte sie zeigt.
  scene text not null check (length(scene) between 3 and 80),
  role text not null check (length(role) between 2 and 40),
  -- Die Kernpunkte der Rollenkarte: ein JSON-Array aus 3–5 kurzen Texten.
  points jsonb not null check (jsonb_typeof(points) = 'array'
                               and jsonb_array_length(points) between 3 and 5),
  -- Ab hier gehört das Gespräch zum Spiel: die `seq` ihrer Nachricht, die es gestartet hat.
  start_seq bigint not null,
  turns int not null default 0 check (turns >= 0),
  max_turns int not null default 12 check (max_turns between 1 and 12),
  status text not null default 'active' check (status in ('active', 'ended')),
  -- Warum es endete: nach dem letzten Zug, auf ihren Wunsch (gesagt oder getippt), wegen einer
  -- Sorge (dann ohne Rückmeldung), oder weil sie weg war (`lapsed`, ohne Rückmeldung).
  ended_reason text check (ended_reason in ('turns', 'her', 'concern', 'lapsed')),
  -- Die geprüfte Rückmeldung (Kernpunkte mit Beleg, bessere Sätze) — für ihren Export.
  feedback jsonb,
  -- Zuletzt gespielt: nach einer langen Pause gilt das Spiel als vorbei (Code, App-Uhr).
  last_at timestamptz not null,
  created_at timestamptz not null,
  ended_at timestamptz,
  check ((status = 'active') = (ended_at is null)),
  check ((status = 'active') = (ended_reason is null))
);

comment on table buddy_roleplays is
  'Ein Rollenspiel in der Fremdsprache im Chat: Rahmen (Sprache, Szene, Rolle, Kernpunkte), Zugzähler und die geprüfte Rückmeldung. Der Rahmen wird von Code in jeden Rollenzug geschrieben, nie vom Modell. Issue #244.';

create unique index buddy_roleplays_one_active on buddy_roleplays (learner_id)
  where status = 'active';
create index buddy_roleplays_learner_idx on buddy_roleplays (learner_id, created_at desc);

alter table buddy_roleplays enable row level security;
