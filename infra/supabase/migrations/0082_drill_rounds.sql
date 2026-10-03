-- Kopfrechnen-Schnellrunde (issue #243): Aufgaben schreibt der Code, nicht das Modell.
--
-- Eine Runde ist eine gewöhnliche Übungssitzung (`practice_sessions`, `session_items`,
-- `practice_turns`) mit gewöhnlichen Fragen (`items`, Art `numeric`, Herkunft `buddy`) — damit
-- Wiederholung (FSRS über `item_states`), Idempotenz per `client_turn_id`, Mandantentrennung,
-- Export und Löschung unverändert gelten. Neu sind nur zwei Dinge, die keine vorhandene Spalte
-- tragen kann:
--
--   * `items.drill_fact` — WELCHE Rechnung diese Frage ist, in einer festen Maschinenform
--     (`times:7x8`, `plus:37+48`, `frac:1/2+1/4`, `pct:25%80` …). Sie ist die eine Quelle der
--     Frage: Text und Schlüssel sind daraus gerechnet (apps/api/src/modules/practice/drill.ts),
--     und sie ist der Schlüssel, unter dem dieselbe Rechnung über alle Runden hinweg DIESELBE
--     Frage bleibt — sonst hätte „7 · 8" bei jeder Runde einen neuen, leeren FSRS-Stand, und
--     „die schwachen Aufgaben kommen öfter" wäre nicht möglich. Eindeutig je Lernender.
--     Gesetzt nur für Rundenaufgaben; jede andere Frage hat NULL, und die gewöhnliche Auswahl
--     (`practice/selection.ts`) lässt jede Rundenaufgabe aus — sie gehört in keine Übung, die
--     das Modell schreibt.
--   * `practice_sessions.drill` — was Buddy gewählt hat (`DrillSpec` in
--     packages/shared-types/src/contracts/drill.ts: ein Bereich aus einer festen Liste, bei
--     Einmaleins die Reihen). Daraus nennt die App die Runde und startet „Noch eine Runde".
--     `pass = 'drill'` sagt, dass diese Sitzung eine Runde ist; beide kommen nur zusammen vor.
--
-- Rein additiv: neue Spalten ohne Vorgabewert (NULL für jede bestehende Zeile), ein erweiterter
-- CHECK. Kein Backfill — es gibt keine alte Runde.

alter table items add column drill_fact text
  check (drill_fact is null or drill_fact ~ '^[a-z]+:[0-9x+%/-]{3,16}$');

comment on column items.drill_fact is
  'Kopfrechnen (issue #243): welche Rechnung diese Frage ist, in Maschinenform (times:7x8, divide:56/7, plus:37+48, minus:52-17, frac:1/2+1/4, pct:25%80). Text und Schlüssel sind daraus gerechnet (practice/drill.ts). Eindeutig je Lernender, damit dieselbe Rechnung über alle Runden dieselbe Frage mit demselben FSRS-Stand bleibt. NULL für jede andere Frage.';

create unique index items_drill_fact_idx on items(learner_id, drill_fact)
  where drill_fact is not null;

alter table practice_sessions drop constraint if exists practice_sessions_pass_check;
alter table practice_sessions add constraint practice_sessions_pass_check
  check (pass in ('cards', 'drill'));

alter table practice_sessions add column drill jsonb;

alter table practice_sessions add constraint practice_sessions_drill_shape
  check ((pass is not distinct from 'drill') = (drill is not null));

comment on column practice_sessions.drill is
  'Kopfrechnen (issue #243): der Bereich, den Buddy gewählt hat (DrillSpec: range, rows, carry). Gesetzt genau dann, wenn pass = drill.';
