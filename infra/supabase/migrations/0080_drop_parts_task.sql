-- `items.parts_task` geht (issues #228–#230, Entscheidung in #224).
--
-- Migration 0072 hat die erste Umsetzung von ordnen, zuordnen und Tabelle füllen angelegt; 0079
-- hat die ersetzt (`items.task`, siehe dort, warum) und dabei schon ihre Prüfregel
-- `items_parts_shape` entfernt. Die Spalte ist ab hier eine zweite Quelle für dieselbe Frage, die
-- kein Code mehr liest oder schreibt.
--
-- Eine Ausnahme von der Regel „kein Drop“ (README in diesem Ordner, docs/architecture.md
-- §Testing), und zwar eine bewusste, entschieden in #224: die Spalte ist nicht umbenannt oder
-- verschoben, sondern tot.
-- 0072 selbst bleibt unverändert (CLAUDE.md Regel 10).
--
-- Der Preis, offen gesagt: die Regel „erst nicht mehr schreiben, im nächsten Release löschen“
-- (docs/architecture.md §Testing, Rollback) wird hier nicht eingehalten. Der Code vor diesem
-- Release liest `i.parts_task` in JEDER Sitzungsansicht; zwischen dem Anwenden dieser Datei und
-- dem Promoten des neuen Codes schlägt die Übungsansicht des alten Codes deshalb fehl, und ein
-- Zurückrollen des Codes allein heilt das nicht. Das Fenster ist so kurz wie der Abstand zwischen
-- Migration und Promote (`deploy-check.ts` verlangt die Migration davor). Wer das nicht will,
-- schiebt diese eine Datei in ein späteres Release: 0079 und der neue Code brauchen sie nicht.
--
-- Keine Umwandlung, weil es nichts umzuwandeln gibt: die Produktion hielt am 02.10.2026 keine
-- Zeile mit `parts_task` (Leseabfrage). Weil Anwendungs- und Nummernreihenfolge nicht dasselbe
-- sind und dazwischen Zeit vergehen kann, prüft die Datei das trotzdem selbst und bricht LAUT ab,
-- statt Daten still zu löschen: eine Zeile mit `parts_task` ist eine Frage, die jemand gerade übt.

do $$
declare
  n bigint;
begin
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'items' and column_name = 'parts_task'
  ) then
    execute 'select count(*) from items where parts_task is not null' into n;
    if n > 0 then
      raise exception
        '0080_drop_parts_task: % row(s) in items still carry parts_task. Convert them to items.task first; nothing was dropped.',
        n;
    end if;
  end if;
end
$$;

-- Schon in 0079 entfernt; hier nur, falls 0079 auf einer Datenbank anders angekommen ist.
alter table items drop constraint if exists items_parts_shape;
alter table items drop column if exists parts_task;
