-- Antworten mit mehreren Teilen: ordnen, zuordnen, eine Tabelle füllen
-- (issues #228, #229, #230, aus der Analyse #224).
--
-- Bis hierher war jede Frage EIN Wert gegen EINEN Schlüssel. Die Analyse #224 hat gezählt, was
-- das kostet: von 347 Aufgabentypen gehen 240 nur „teilweise" — fast immer, weil das WISSEN
-- abfragbar ist und die FORM der Klassenarbeit nicht. Die drei häufigsten dieser Formen sind
-- ordnen (22 Typen), zuordnen (17) und eine Tabelle füllen (16); zusammen 95 Aufgabentypen aus
-- 14 Fächern (`docs/lehrplan-und-uebungsformen.md`). Alle drei sind von Code **vollständig**
-- entscheidbar, also entscheidet Code sie — kein Modellaufruf pro Antwort (CLAUDE.md Regel 1,
-- issue #227).
--
-- Zwei Änderungen, und beide so eng wie möglich.

-- ─────────────── die drei neuen Arten ───────────────
--
-- `match` ist EINE Art mit zwei Formen (Paare, Gruppen) und nicht zwei Arten: welche von beiden
-- gilt, steht in der Aufgabe selbst (`parts_task.form`), und alles, was `kind` liest — Auswahl,
-- Hinweise, Karten, Bewertung — behandelt beide gleich.
alter table items drop constraint items_kind_check;
alter table items add constraint items_kind_check
  check (kind in ('short','long','numeric','multiple_choice','formula','vocab','speak',
                  'order','match','table_fill'));

-- ─────────────── die geprüfte Aufgabe ───────────────
--
-- Genau wie `items.bar_task` (Migration 0064) steht hier das, was das Modell gesagt hat, und
-- nichts weiter: Elemente in der richtigen Reihenfolge, Paare, Gruppen mit ihren Mitgliedern oder
-- eine Tabelle mit ihren Lücken (`PartsTask`, packages/shared-types/src/contracts/parts.ts).
--
-- Die Lösung steht **in der Struktur**, nicht als eigenes Feld daneben: ein Schlüssel, der den
-- Elementen widerspricht, ist damit nicht sagbar. Deshalb ist das hier die EINE Quelle der
-- Frage — und alles, was jede andere Frage auch hat, ist daraus gerechnet und steht in den
-- Spalten, die es immer schon gab:
--   * `answer` hält die Lösung als eine Zeile, damit „Lösung zeigen", die Fragenliste eines
--     Blattes, der Leak-Check für Tipps und das Zurücknehmen eines Urteils unverändert
--     weiterlaufen (`modules/practice/parts.ts` `solutionOfParts`);
--   * die App bekommt daraus das **Brett** ohne Lösung (`ItemView.board`), in einer
--     Anzeige-Reihenfolge, die stabil pro Frage ist (`modules/practice/shuffle.ts`).
--
-- Kein Backfill: alte Zeilen haben keine Aufgabe, und keine alte Art hat eine.
alter table items add column parts_task jsonb;

comment on column items.parts_task is
  'Die geprüfte Aufgabe einer mehrteiligen Antwort (ordnen, zuordnen, Tabelle füllen), wie das Modell sie geschrieben hat: PartsTask in packages/shared-types/src/contracts/parts.ts. Enthält die Lösung und verlässt den Server nie; die App bekommt das daraus abgeleitete Brett ohne Lösung. Issues #228, #229, #230.';

-- Eine mehrteilige Antwort ohne ihre Aufgabe gibt es nicht, und keine andere Art trägt eine.
-- Das ist keine Vorsichtsmaßnahme, sondern die Bedingung dafür, dass `parts.ts` die einzige
-- Stelle ist, die so eine Frage beurteilt: ohne Aufgabe gibt es nichts zu vergleichen, und eine
-- Reihenfolge-Frage, die als Textantwort durchrutscht, würde als Zeichenkette gegen die
-- gerenderte Lösung geprüft — und dabei gelegentlich „richtig" sagen, aus dem falschen Grund.
alter table items add constraint items_parts_shape
  check ((kind in ('order','match','table_fill')) = (parts_task is not null));
