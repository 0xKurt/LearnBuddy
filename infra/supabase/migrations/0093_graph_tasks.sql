-- Schemata und Bäume: Kästchen mit Pfeilen, Baumdiagramm, Stammbaum, Automat
-- (issues #247 und #256, Bausteine FIG_SCHEMA und FIG_BAUM aus #224).
--
-- Dieselbe Änderung, die `items.staff_task` (Migration 0078) und `items.bar_task` (0064) schon
-- waren: das Modell liefert einen Graphen als Daten (`GraphTask`,
-- packages/shared-types/src/contracts/graph.ts), Code prüft ihn, legt ihn aus und rechnet Frage,
-- Figur, Schlüssel, Tipps und Lösungsweg (apps/api/src/modules/practice/graph.ts). Das Gerechnete
-- steht in den Spalten, die es immer schon gab — `prompt`, `answer`, `choices`, `figure`,
-- `parts_task` —, damit Sitzung, Bewertung und FSRS unverändert weiterlaufen.
--
-- Warum die Aufgabe trotzdem gespeichert wird:
--   * sie ist die EINE geprüfte Quelle der Frage: ein Test rechnet aus ihr nach;
--   * sie sagt der Bewertung, dass eine Wahrscheinlichkeit nach dem WERT gefragt ist (`form_free`:
--     1/4, 0,25 und 25/100 sind eine Antwort), weil Code die Frage selbst geschrieben hat;
--   * sie sagt der Antwort auf einen Fehlversuch, dass der Tutor die Zeichnung nicht sieht — die
--     feste Zeile kommt dann von Code (`graphAgain`), nie ein Modell über ein Bild, das es nicht hat.
--
-- Kein Backfill: alte Zeilen haben keine Aufgabe und werden genau wie bisher behandelt.
alter table items add column graph_task jsonb;

comment on column items.graph_task is
  'Die geprüfte Schema- oder Baumaufgabe, wie das Modell sie geliefert hat: GraphTask in packages/shared-types/src/contracts/graph.ts. Frage, Figur, Schlüssel, Tipps und Lösungsweg sind daraus gerechnet (modules/practice/graph.ts), nie vom Modell geschrieben. Issues #247, #256.';

-- Eine Frage hat höchstens EINE gerechnete Quelle (Migration 0078 begründet das für zwei; mit
-- der dritten wird die Bedingung allgemein).
alter table items drop constraint items_one_computed_source;
alter table items add constraint items_one_computed_source
  check (num_nonnulls(bar_task, staff_task, graph_task) <= 1);
