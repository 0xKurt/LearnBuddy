-- Mehrfachauswahl mit mehreren richtigen Antworten (issue #240): „Kreuze alle richtigen an“.
--
-- Eine neue strukturierte Art `select_all` neben `order`, `match`, `table_fill` (0079). Sie trägt
-- ihre Aufgabe in `items.task` wie die anderen (`SelectAllTask`,
-- packages/shared-types/src/contracts/structured.ts): die Optionen in der gemischten Reihenfolge,
-- in der sie sie sieht, mit Ids vom Server, und der Schlüssel als Menge dieser Ids. Das Modell
-- schreibt die Optionen und markiert die richtigen; Ids, Mischung und Schlüssel setzt Code, und
-- Code prüft vor dem Speichern: mindestens zwei richtige und eine falsche, keine zwei gleichen
-- (apps/api/src/modules/practice/structured.ts). Ihre Antwort ist die Menge, die sie angetippt
-- hat, exakt verglichen — kein Modell.
--
-- Warum keine Spalte `correct_choices` an `multiple_choice`: eine Frage mit einer Antwort wird
-- angetippt und sofort beurteilt, ihre richtige Option steht in `correct_choice`. Eine Frage mit
-- mehreren wird gesammelt und mit „Prüfen“ als `parts` abgeschickt — genau der Weg, den die
-- strukturierten Arten schon haben, samt Schlüssel, der den Server nie verlässt, und Rückmeldung
-- Teil für Teil. Eine zweite Bedeutung von `multiple_choice` hätte jede Stelle, die heute eine
-- Antwort-Option vergleicht, doppelt gemacht.
--
-- Nur die zwei Prüfregeln ändern sich, keine Spalte. Sie werden NICHT neu hingeschrieben, sondern
-- aus der Regel gebaut, die gerade in der Datenbank steht, um `select_all` erweitert: die
-- Anwendungsreihenfolge ist nicht die der Nummern (README), und eine andere Migration, die zur
-- selben Zeit eine weitere Art erlaubt, darf hier nicht still wieder verboten werden. Steht
-- `select_all` schon drin, ändert die Datei nichts.

do $$
declare
  def text;
begin
  select pg_get_constraintdef(oid) into def
    from pg_constraint
   where conrelid = 'public.items'::regclass and conname = 'items_kind_check';
  if def is null then
    raise exception '0089_select_all_items: items_kind_check is missing; nothing was changed.';
  end if;
  if position('''select_all''' in def) = 0 then
    if position('ARRAY[' in def) = 0 then
      raise exception '0089_select_all_items: items_kind_check has an unexpected form (%); nothing was changed.', def;
    end if;
    alter table items drop constraint items_kind_check;
    execute 'alter table items add constraint items_kind_check '
         || replace(def, 'ARRAY[', 'ARRAY[''select_all''::text, ');
  end if;

  -- Eine strukturierte Art hat IMMER eine Aufgabe, jede andere NIE (0079). `select_all` ist
  -- strukturiert, also gehört sie in die Liste dieser Regel.
  select pg_get_constraintdef(oid) into def
    from pg_constraint
   where conrelid = 'public.items'::regclass and conname = 'items_task_matches_kind';
  if def is null then
    raise exception '0089_select_all_items: items_task_matches_kind is missing (0079); nothing was changed.';
  end if;
  if position('''select_all''' in def) = 0 then
    if (length(def) - length(replace(def, 'ARRAY[', ''))) / length('ARRAY[') <> 1 then
      raise exception '0089_select_all_items: items_task_matches_kind has an unexpected form (%); nothing was changed.', def;
    end if;
    alter table items drop constraint items_task_matches_kind;
    execute 'alter table items add constraint items_task_matches_kind '
         || replace(def, 'ARRAY[', 'ARRAY[''select_all''::text, ');
  end if;
end
$$;

comment on column items.task is
  'Die geprüfte Aufgabe einer strukturierten Frage (ordnen, zuordnen, Tabelle füllen, alle richtigen ankreuzen) MIT Schlüssel: StructuredTask in packages/shared-types/src/contracts/structured.ts. Ids, Mischung und Schlüssel setzt Code (practice/structured.ts, table.ts). Verlässt den Server nie; die App bekommt ItemView.task_view ohne Schlüssel. Issues #228–#230, #240.';
