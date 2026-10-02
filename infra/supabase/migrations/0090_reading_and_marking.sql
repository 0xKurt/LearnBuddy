-- Lesetext und Markieren (Issues #233, #234).
--
-- Zwei Dinge, die zusammen kommen, weil das eine das andere braucht („Belegstelle antippen"):
--
-- 1. `items.read_passage`: der Text, zu dem eine Frage gestellt ist (Leseverständnis, #233) —
--    seine Zeilen, wie sie auf dem Blatt stehen oder wie Buddy sie geschrieben hat, sein Titel
--    und seine Sprache (`ReadPassage`, packages/shared-types/src/contracts/reading.ts). Er steht
--    an JEDER Frage der Gruppe, aus demselben Grund wie `listen_task` (0077): die Wiederholung
--    bringt eine einzelne Frage in drei Wochen allein zurück, und dann muss sie ihren Text
--    mitbringen. Zeilenweise, weil „Z. 12" eine Zeile des Blatts meint und Code vor dem
--    Speichern prüft, dass es sie gibt (apps/api/src/modules/practice/reading.ts).
--    Anders als ein Hörtext ist er der Reiz, nicht die Lösung: die App bekommt ihn, solange die
--    Frage offen ist.
--
-- 2. Die Art `mark` (#234): Wörter, Lücken zwischen Wörtern oder Silbengrenzen antippen. Eine
--    strukturierte Art wie `order` (0079): ihre Aufgabe MIT Schlüssel steht in `items.task`, die
--    Wörter hat Code zerlegt, der Schlüssel sind Positionen (`MarkTask`, contracts/structured.ts).
--
-- Die Reihenfolge der Anwendung ist nicht die der Nummern (README in diesem Ordner). Diese Datei
-- baut auf 0079 auf (die Spalte `task` und die Prüfregel `items_task_matches_kind`) und prüft
-- das selbst. Und sie ERSETZT die Liste der erlaubten Arten nicht durch eine eigene: parallel
-- entstehende Migrationen erweitern dieselbe Liste, und wer zuletzt läuft, nähme den anderen
-- sonst ihre Art wieder weg. Deshalb wird die Liste aus der bestehenden Regel gelesen und nur
-- `mark` hinzugefügt.

do $$
begin
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'items' and column_name = 'task'
  ) then
    raise exception '0090_reading_and_marking: items.task (migration 0079) is missing; apply 0079 first. Nothing was changed.';
  end if;
end
$$;

alter table items add column read_passage jsonb;

comment on column items.read_passage is
  'Leseverständnis (Issue #233): der Text, zu dem diese Frage gestellt ist — {"title": …, "lines": [...], "lang": …}, geprüft als ReadPassage. Zeilenweise wie gedruckt; Zeilenverweise der Frage sind gegen genau diese Zeilen geprüft (practice/reading.ts). null für jede andere Frage.';

-- Eine Frage hat höchstens einen Reiz: einen Text, den sie liest, oder einen, den sie hört.
alter table items add constraint items_one_text
  check (read_passage is null or listen_task is null);

-- Die erlaubten Arten: die bestehende Liste plus `mark`, gelesen aus der Regel, die gerade gilt.
do $$
declare
  def text;
  kinds text[];
  list text;
begin
  select pg_get_constraintdef(oid) into def
    from pg_constraint where conname = 'items_kind_check' and conrelid = 'public.items'::regclass;
  if def is null then
    raise exception '0090_reading_and_marking: items_kind_check not found. Nothing was changed.';
  end if;
  select array_agg(distinct m[1]) into kinds from regexp_matches(def, '''([a-z_]+)''', 'g') as m;
  if not ('mark' = any(kinds)) then
    kinds := kinds || 'mark'::text;
  end if;
  select string_agg(quote_literal(k), ',' order by k) into list from unnest(kinds) as k;
  execute 'alter table items drop constraint items_kind_check';
  execute format('alter table items add constraint items_kind_check check (kind in (%s))', list);
end
$$;

-- Eine strukturierte Art hat IMMER eine Aufgabe, jede andere NIE (0079). Dieselbe Regel, mit
-- `mark` unter den strukturierten Arten — ebenfalls aus der bestehenden Regel gelesen.
do $$
declare
  def text;
  kinds text[];
  list text;
begin
  select pg_get_constraintdef(oid) into def
    from pg_constraint where conname = 'items_task_matches_kind' and conrelid = 'public.items'::regclass;
  if def is null then
    raise exception '0090_reading_and_marking: items_task_matches_kind (migration 0079) not found. Nothing was changed.';
  end if;
  -- Die Literale der Regel ohne den Schlüssel `type`, den sie in der Aufgabe nachschlägt.
  select array_agg(distinct m[1]) into kinds
    from regexp_matches(def, '''([a-z_]+)''', 'g') as m where m[1] <> 'type';
  if not ('mark' = any(kinds)) then
    kinds := kinds || 'mark'::text;
  end if;
  select string_agg(quote_literal(k), ',' order by k) into list from unnest(kinds) as k;
  execute 'alter table items drop constraint items_task_matches_kind';
  execute format(
    'alter table items add constraint items_task_matches_kind check ((kind in (%s)) = (task is not null) and (task is null or task->>''type'' = kind))',
    list);
end
$$;
