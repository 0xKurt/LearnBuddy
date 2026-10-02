-- Zusammengesetzte Aufgaben wie in Klasse 8–10 (Issue #297): Material plus Teilaufgaben a) b) c).
--
-- Jede Teilaufgabe ist eine gewöhnliche Frage einer vorhandenen Art und wird von deren Prüfer
-- beurteilt. Neu ist nur `items.complex_task`, was die Teile verbindet (`ComplexTask`,
-- packages/shared-types/src/contracts/complex.ts):
--   · `group`    — vom Server vergeben, gleich für alle Teile einer Aufgabe;
--   · `part`     — die Position (0 = a), `parts` — wie viele es gibt;
--   · `material` — Text Zeile für Zeile, Figur, die Größen, mit denen gerechnet wird. Er steht an
--     JEDER Teilaufgabe, aus demselben Grund wie `read_passage` (0090): die Wiederholung bringt
--     eine einzelne Teilaufgabe vielleicht allein zurück, und dann muss sie ihr Material mitbringen;
--   · `uses` und `calc` — worauf sie aufbaut und wie Code sie nachrechnet: vor dem Speichern mit
--     dem Schlüssel, beim Antworten mit IHREM Ergebnis der früheren Teile (Folgefehler,
--     apps/api/src/modules/practice/complex.ts).
--
-- Die Reihenfolge der Anwendung ist nicht die der Nummern (README in diesem Ordner). Diese Datei
-- braucht nur `items`, und die Regel unten nennt `read_passage` und `listen_task` nur, wenn es sie
-- gibt — sie läuft also auch, wenn 0077 oder 0090 noch nicht angekommen sind.

alter table items add column complex_task jsonb;

comment on column items.complex_task is
  'Teilaufgabe einer zusammengesetzten Aufgabe (Issue #297): {"group": uuid, "part": 0.., "parts": 2..5, "material": {"title", "lines", "figure", "givens"}, "uses": [...], "calc": …}, geprüft als ComplexTask (practice/complex.ts). null für jede andere Frage.';

-- Ein Reiz pro Frage: das Material einer Aufgabe ist kein zweiter Text neben einem Lese- oder Hörtext.
do $$
declare
  cond text := 'complex_task is null';
  others text := '';
begin
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'items' and column_name = 'read_passage') then
    others := others || ' and read_passage is null';
  end if;
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'items' and column_name = 'listen_task') then
    others := others || ' and listen_task is null';
  end if;
  if others <> '' then
    execute format('alter table items add constraint items_complex_one_stimulus check (%s or (true%s))',
                   cond, others);
  end if;
end
$$;

-- Die Teile einer Aufgabe werden zusammen gesucht: beim Auswählen (eine Teilaufgabe kommt nie ohne
-- ihre Geschwister) und beim Folgefehler (ihr Ergebnis aus a) für b).
create index items_complex_group on items ((complex_task->>'group')) where complex_task is not null;
