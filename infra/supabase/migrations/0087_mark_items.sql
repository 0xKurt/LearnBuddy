-- Markieren (issue #234): Wörter, Komma-Stellen oder Silbengrenzen in einem Satz antippen.
--
-- Eine neue strukturierte Art `mark` neben `order`, `match`, `table_fill`, `cloze` (0079) und
-- `select_all` (0085). Sie trägt ihre Aufgabe in `items.task` wie die anderen (`MarkTask`,
-- packages/shared-types/src/contracts/structured.ts): die Wörter des Textes, wie CODE ihn zerlegt
-- hat (nie das Modell), mit Ids vom Server, die Kategorien (Subjekt, Prädikat …) und der Schlüssel
-- als Menge von Stellen (`w3` ein Wort, `g3` die Lücke dahinter, `w3_2` die Trennstelle nach dem
-- zweiten Buchstaben). Das Modell nennt nur die Wörter; Code findet ihre Stellen, verlangt bei einem
-- doppelten Wort die Nummer seines Vorkommens und prüft beim Fehlertext, dass die korrigierte
-- Fassung genau an den Schlüsselstellen abweicht (apps/api/src/modules/practice/mark.ts). Ihre
-- Antwort ist die Menge, die sie markiert hat, verglichen als Menge — kein Modell.
--
-- Nur die zwei Prüfregeln ändern sich, keine Spalte. Wie in 0085 werden sie NICHT neu
-- hingeschrieben, sondern aus der Regel gebaut, die gerade in der Datenbank steht, um `mark`
-- erweitert: die Anwendungsreihenfolge ist nicht die der Nummern (README), und eine andere
-- Migration, die zur selben Zeit eine weitere Art erlaubt, darf hier nicht still wieder verboten
-- werden. Steht `mark` schon drin, ändert die Datei nichts.

do $$
declare
  def text;
begin
  select pg_get_constraintdef(oid) into def
    from pg_constraint
   where conrelid = 'public.items'::regclass and conname = 'items_kind_check';
  if def is null then
    raise exception '0087_mark_items: items_kind_check is missing; nothing was changed.';
  end if;
  if position('''mark''' in def) = 0 then
    if position('ARRAY[' in def) = 0 then
      raise exception '0087_mark_items: items_kind_check has an unexpected form (%); nothing was changed.', def;
    end if;
    alter table items drop constraint items_kind_check;
    execute 'alter table items add constraint items_kind_check '
         || replace(def, 'ARRAY[', 'ARRAY[''mark''::text, ');
  end if;

  -- Eine strukturierte Art hat IMMER eine Aufgabe, jede andere NIE (0079). `mark` ist
  -- strukturiert, also gehört sie in die Liste dieser Regel.
  select pg_get_constraintdef(oid) into def
    from pg_constraint
   where conrelid = 'public.items'::regclass and conname = 'items_task_matches_kind';
  if def is null then
    raise exception '0087_mark_items: items_task_matches_kind is missing (0079); nothing was changed.';
  end if;
  if position('''mark''' in def) = 0 then
    if (length(def) - length(replace(def, 'ARRAY[', ''))) / length('ARRAY[') <> 1 then
      raise exception '0087_mark_items: items_task_matches_kind has an unexpected form (%); nothing was changed.', def;
    end if;
    alter table items drop constraint items_task_matches_kind;
    execute 'alter table items add constraint items_task_matches_kind '
         || replace(def, 'ARRAY[', 'ARRAY[''mark''::text, ');
  end if;
end
$$;

comment on column items.task is
  'Die geprüfte Aufgabe einer strukturierten Frage (ordnen, zuordnen, Tabelle füllen, Lückentext, alle richtigen ankreuzen, markieren) MIT Schlüssel: StructuredTask in packages/shared-types/src/contracts/structured.ts. Ids, Mischung, Zerlegung in Wörter und Schlüssel setzt Code (practice/structured.ts, table.ts, mark.ts). Verlässt den Server nie; die App bekommt ItemView.task_view ohne Schlüssel. Issues #228–#232, #234, #240.';
