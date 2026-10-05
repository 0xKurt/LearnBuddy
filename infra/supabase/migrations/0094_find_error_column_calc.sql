-- Fehlerdetektiv und schriftliches Rechnen (issue #260): zwei neue strukturierte Arten neben
-- `order`, `match`, `table_fill`, `cloze` (0079), `select_all` (0085) und `mark` (0087).
--
--   find_error  — ein vorgerechneter Weg mit EINER falschen Zeile; sie tippt die Zeile an und
--                 schreibt sie richtig. Das Modell schreibt den Weg richtig, Code prüft jeden
--                 Schritt (practice/steps.ts) und baut den Fehler selbst ein; der Schlüssel ist die
--                 Id der Zeile und die Zeile, wie sie richtig heißt (practice/findError.ts).
--   column_calc — Addition, Subtraktion, Multiplikation, Division in Spalten mit Überträgen. Die
--                 Aufgabe hält nur Rechenart und Zahlen; jede Ziffer und jeden Übertrag rechnet Code
--                 bei jedem Lesen neu aus (practice/columnCalc.ts).
--
-- Beide tragen ihre Aufgabe in `items.task` wie die anderen (packages/shared-types/src/contracts/
-- structured.ts); ihre Antwort prüft Code, kein Modell.
--
-- Nur die zwei Prüfregeln ändern sich, keine Spalte. Wie in 0085/0087/0089 werden sie NICHT neu
-- hingeschrieben, sondern aus der Regel gebaut, die gerade in der Datenbank steht, um die neuen
-- Arten erweitert: eine andere Migration, die zur selben Zeit eine weitere Art erlaubt, darf hier
-- nicht still wieder verboten werden. Steht eine Art schon drin, ändert die Datei für sie nichts.

do $$
declare
  def text;
  kind text;
begin
  foreach kind in array array['find_error', 'column_calc'] loop
    select pg_get_constraintdef(oid) into def
      from pg_constraint
     where conrelid = 'public.items'::regclass and conname = 'items_kind_check';
    if def is null then
      raise exception '0094_find_error_column_calc: items_kind_check is missing; nothing was changed.';
    end if;
    if position(quote_literal(kind) in def) = 0 then
      if position('ARRAY[' in def) = 0 then
        raise exception '0094_find_error_column_calc: items_kind_check has an unexpected form (%); nothing was changed.', def;
      end if;
      alter table items drop constraint items_kind_check;
      execute 'alter table items add constraint items_kind_check '
           || replace(def, 'ARRAY[', 'ARRAY[' || quote_literal(kind) || '::text, ');
    end if;

    -- Eine strukturierte Art hat IMMER eine Aufgabe, jede andere NIE (0079).
    select pg_get_constraintdef(oid) into def
      from pg_constraint
     where conrelid = 'public.items'::regclass and conname = 'items_task_matches_kind';
    if def is null then
      raise exception '0094_find_error_column_calc: items_task_matches_kind is missing (0079); nothing was changed.';
    end if;
    if position(quote_literal(kind) in def) = 0 then
      if (length(def) - length(replace(def, 'ARRAY[', ''))) / length('ARRAY[') <> 1 then
        raise exception '0094_find_error_column_calc: items_task_matches_kind has an unexpected form (%); nothing was changed.', def;
      end if;
      alter table items drop constraint items_task_matches_kind;
      execute 'alter table items add constraint items_task_matches_kind '
           || replace(def, 'ARRAY[', 'ARRAY[' || quote_literal(kind) || '::text, ');
    end if;
  end loop;
end
$$;

comment on column items.task is
  'Die geprüfte Aufgabe einer strukturierten Frage (ordnen, zuordnen, Tabelle füllen, Lückentext, alle richtigen ankreuzen, markieren, Fehler finden, schriftlich rechnen) MIT Schlüssel: StructuredTask in packages/shared-types/src/contracts/structured.ts. Ids, Mischung, Zerlegung in Wörter, der eingebaute Fehler und jede Ziffer des schriftlichen Rechnens setzt Code (practice/structured.ts, table.ts, mark.ts, findError.ts, columnCalc.ts). Verlässt den Server nie; die App bekommt ItemView.task_view ohne Schlüssel. Issues #228–#232, #234, #240, #260.';
