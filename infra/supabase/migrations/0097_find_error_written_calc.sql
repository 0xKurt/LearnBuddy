-- Fehlerdetektiv und schriftliches Rechnen: zwei neue strukturierte Arten (issue #260).
--
--   find_error   — ein vorgerechneter Weg mit genau EINER Zeile, die nicht aus der davor folgt;
--                  sie tippt sie an und schreibt sie richtig (`FindErrorTask`).
--   written_calc — schriftlich addieren, subtrahieren, multiplizieren: Ziffer für Ziffer in
--                  Kästchen, Überträge freiwillig (`WrittenCalcTask`).
--
-- Beide speichern ihre Aufgabe in `items.task` wie `order`, `match` und `table_fill` (Migration
-- 0079), geprüft von Code (apps/api/src/modules/practice/findError.ts, written.ts). Eine neue
-- Spalte braucht es nicht; nur die beiden Prüfregeln müssen die zwei Arten kennen.
--
-- Die Prüfregeln werden ERWEITERT, nicht neu geschrieben. Parallel entstehen weitere Migrationen
-- mit eigenen Arten (README in diesem Ordner: die Reihenfolge der Anwendung ist nicht die der
-- Nummern). Eine feste Liste hier würde eine Art, die eine früher angewendete Migration erlaubt
-- hat, stillschweigend wieder verbieten. Darum liest diese Datei die geltende Regel, hängt die
-- zwei Arten hinter `table_fill` an und setzt sie neu — und bricht laut ab, wenn sie die Regel
-- nicht in der erwarteten Form findet, statt etwas zu raten. Zweimal angewendet ändert sie nichts.

do $$
declare
  def text;
begin
  -- 1. Welche Arten es gibt.
  select pg_get_constraintdef(oid) into def
    from pg_constraint
   where conrelid = 'public.items'::regclass and conname = 'items_kind_check';
  if def is null or position('''table_fill''::text' in def) = 0 then
    raise exception '0097_find_error_written_calc: items_kind_check not found in the expected form (%); nothing was changed.', def;
  end if;
  if position('''find_error''::text' in def) = 0 then
    def := replace(def, '''table_fill''::text',
                   '''table_fill''::text, ''find_error''::text, ''written_calc''::text');
    alter table items drop constraint items_kind_check;
    execute 'alter table items add constraint items_kind_check ' || def;
  end if;

  -- 2. Eine strukturierte Art hat immer eine Aufgabe, jede andere nie (0079).
  select pg_get_constraintdef(oid) into def
    from pg_constraint
   where conrelid = 'public.items'::regclass and conname = 'items_task_matches_kind';
  if def is null or position('''table_fill''::text' in def) = 0 then
    raise exception '0097_find_error_written_calc: items_task_matches_kind not found in the expected form (%); nothing was changed.', def;
  end if;
  if position('''find_error''::text' in def) = 0 then
    def := replace(def, '''table_fill''::text',
                   '''table_fill''::text, ''find_error''::text, ''written_calc''::text');
    alter table items drop constraint items_task_matches_kind;
    execute 'alter table items add constraint items_task_matches_kind ' || def;
  end if;
end
$$;

comment on column items.task is
  'Die geprüfte Aufgabe einer strukturierten Frage (ordnen, zuordnen, Tabelle füllen, Fehlerdetektiv, schriftlich rechnen) MIT Schlüssel: StructuredTask in packages/shared-types/src/contracts/structured.ts. Ids, Mischung und Schlüssel setzt Code (practice/structured.ts, table.ts, findError.ts, written.ts). Verlässt den Server nie; die App bekommt ItemView.task_view ohne Schlüssel. Issues #228–#230, #260.';
