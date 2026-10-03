-- Diktat: Buddy liest ein Wort oder einen Satz vor, das Kind tippt es (Issue #242).
--
-- Eine neue Art von Frage, `spelling_dictation` — nicht `dictation`, weil die App mit „Diktat“
-- schon die SPRACHEINGABE meint (`apps/mobile/lib/speech/dictation.ts`), und genau die ist bei
-- dieser Frage aus: eine Rechtschreibübung, die man einspricht, prüfte die Schreibweise des
-- Erkenners, nicht ihre.
--
-- Keine neue Spalte. Der Schlüssel steht, wie bei jeder Frage, in `items.answer`; die Aufnahme
-- kommt aus der Hörkette von #210 (`items.listen_task`, Migration 0077), unverändert: Die App
-- bekommt nur einen Verweis auf die Aufnahme, nie den Text, und `POST /practice/sessions/:id/listen`
-- spielt sie ab, beliebig oft, auch langsamer.
--
-- Regel 0 aus #242 („die Sprachausgabe bekommt den Schlüssel, keinen Modelltext“) steht deshalb
-- hier als Prüfregel und nicht nur im Code: der vorgelesene Text IST `answer`, Zeichen für
-- Zeichen. Wären es zwei Texte, würde ihre Antwort gegen etwas geprüft, das sie nie gehört hat.
-- Und die Prüfung ist streng (Groß/klein, ß/ss): `spelling = 'strict'`, ebenfalls hier fest.
--
-- Die Prüfregel der Arten wird nicht abgeschrieben, sondern ERWEITERT: Anwendungs- und
-- Nummernreihenfolge sind nicht dasselbe (README in diesem Ordner), und parallel arbeitende
-- Bausteine fügen eigene Arten hinzu. Diese Datei liest deshalb die Arten, die die Regel gerade
-- erlaubt, und hängt ihre an — eine Art, die eine andere Migration vorher hinzugefügt hat, bleibt
-- erlaubt. (Andersherum gilt dasselbe für jede spätere Migration: auch sie muss die Liste lesen,
-- nicht abschreiben, sonst verbietet sie diese Art wieder.)
--
-- Kein Backfill: es gibt keine Zeile dieser Art.

do $$
declare
  def text;
  kinds text[];
begin
  select pg_get_constraintdef(c.oid) into def
    from pg_constraint c
   where c.conname = 'items_kind_check' and c.conrelid = 'public.items'::regclass;
  if def is null then
    raise exception '0081_spelling_dictation: items_kind_check not found; nothing was changed.';
  end if;
  select array_agg(m[1] order by ord) into kinds
    from regexp_matches(def, '''([a-z_]+)''', 'g') with ordinality as r(m, ord);
  if kinds is null or array_length(kinds, 1) < 7 then
    raise exception '0081_spelling_dictation: could not read the kinds out of "%"; nothing was changed.', def;
  end if;
  if not ('spelling_dictation' = any (kinds)) then
    kinds := kinds || 'spelling_dictation'::text;
  end if;
  alter table items drop constraint items_kind_check;
  -- Written as `kind in ('…', …)` like every earlier version, so the definition Postgres stores
  -- keeps the form `ARRAY['…'::text, …]` that the reading above (and the next migration's) parses.
  execute format(
    'alter table items add constraint items_kind_check check (kind in (%s))',
    (select string_agg(quote_literal(k), ', ' order by o) from unnest(kinds) with ordinality as u(k, o))
  );
end
$$;

-- Eine Diktatfrage hat IMMER eine Aufnahme, und die Aufnahme ist genau ihr Schlüssel; geprüft wird
-- streng. Keine andere Quelle (Bruchbalken, Notenzeile, Anordnung) daneben.
alter table items add constraint items_dictation_shape
  check (
    kind <> 'spelling_dictation'
    or (
      listen_task is not null
      and listen_task->>'text' = answer
      and spelling = 'strict'
      and task is null
      and bar_task is null
      and staff_task is null
    )
  );

comment on constraint items_dictation_shape on items is
  'Diktat (Issue #242): der vorgelesene Text (listen_task.text) ist genau der Schlüssel (answer), geprüft wird streng. Die Sprachausgabe bekommt nie einen umformulierten Text.';
