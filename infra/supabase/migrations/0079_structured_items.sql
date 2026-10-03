-- Strukturierte Aufgaben: Antworten, die eine FORM haben statt eines Satzes (issues #228–#230).
--
-- Zwei Umsetzungen derselben drei Formen lagen nebeneinander: `items.parts_task` (Migration 0072,
-- auf main und in Produktion angewendet) und die des Merge-Trains (`items.task`). Ein neutraler
-- Prüfer hat beide ausgeführt und angegriffen; entschieden in #224 („Entscheidung: zwei
-- Umsetzungen …“): diese hier bleibt, `parts_task` geht. Gründe, belegt: bei
-- `parts_task` waren die Kürzel nach der RICHTIGEN Position vergeben — eine Reihenfolge und eine
-- Paarung ließen sich allein aus der API-Antwort lösen —, beim zweiten ganz falschen Versuch wurde
-- ein Modell gefragt, und Zahlenmauer und Vierfeldertafel wurden nicht nachgerechnet.
--
-- `items.parts_task` bleibt ab hier als tote Spalte stehen: kein Code liest oder schreibt sie mehr.
-- Gelöscht wird sie erst im nächsten Release, wenn kein ausgelieferter Code sie mehr liest
-- (docs/architecture.md §Testing, „erst nicht mehr schreiben, im nächsten Release löschen“) —
-- mit der dann nächsten freien Nummer.
--
-- `task` ist die EINE geprüfte Definition der Aufgabe, MIT Schlüssel (`StructuredTask`,
-- packages/shared-types/src/contracts/structured.ts). Für `order`: die Elemente in der gemischten
-- Reihenfolge, in der sie sie sieht, mit Ids vom Server, und der Schlüssel als Folge dieser Ids.
-- Das Modell schreibt die Elemente; Ids, Mischung und Schlüssel setzt Code (CLAUDE.md Regel 2),
-- und Code prüft vor dem Speichern, was sich mechanisch prüfen lässt (#224 „Regel 0“,
-- apps/api/src/modules/practice/structured.ts, table.ts). Scheitert eine Prüfung, entsteht keine
-- Frage — repariert wird nichts.
--
-- Warum eine Spalte und nicht die vorhandenen:
--   * die App bekommt daraus `ItemView.task_view` — dieselbe Aufgabe OHNE Schlüssel. Der
--     Schlüssel verlässt den Server nie (#162 hat es für `bar_task` genauso gemacht);
--   * die Bewertung vergleicht `AnswerRequest.parts` mit ihr, exakt und ohne Modell;
--   * `answer` bleibt trotzdem gefüllt — mit der Lösung, wie sie sie lesen kann („A → B → C“).
--     Damit laufen Lösung zeigen, Tipps, Probetest-Auswertung und Zusammenfassung unverändert.
--
-- Die Arten: `order`, `match` und `table_fill` stehen seit 0072 in der Prüfregel. Neu ist `cloze`
-- (#232, mehrere Lücken in einem Text) — mit Absicht schon jetzt, obwohl noch kein Code eine
-- solche Frage schreibt: die nächste strukturierte Art braucht dann keine Constraint-Migration.
-- Erlaubt ist damit nur ein Wert, den niemand schreibt; `items_task_matches_kind` unten
-- verlangt für ihn trotzdem eine Aufgabe, eine leere `cloze`-Zeile ist also nicht möglich.
--
-- Die Reihenfolge der Anwendung ist nicht die der Nummern (README in diesem Ordner). Deshalb
-- prüft diese Datei ihre Voraussetzung selbst: liegen schon Zeilen mit `parts_task` vor, wäre die
-- neue Prüfregel für sie falsch (sie haben keine `task`). Dann bricht sie laut ab, statt an einer
-- Constraint-Meldung zu scheitern, die niemand zuordnen kann. Laut einer Leseabfrage gegen die
-- Produktion am 02.10.2026 gibt es dort keine solche Zeile.

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
        '0079_structured_items: % row(s) in items carry parts_task (migration 0072). They must be converted to items.task before this migration may run; nothing was changed.',
        n;
    end if;
  end if;
end
$$;

alter table items add column task jsonb;

comment on column items.task is
  'Die geprüfte Aufgabe einer strukturierten Frage (ordnen, zuordnen, Tabelle füllen) MIT Schlüssel: StructuredTask in packages/shared-types/src/contracts/structured.ts. Ids, Mischung und Schlüssel setzt Code (practice/structured.ts, table.ts). Verlässt den Server nie; die App bekommt ItemView.task_view ohne Schlüssel. Issues #228–#230.';

-- Die Prüfregel aus 0072, nach der jede `order`-, `match`- und `table_fill`-Zeile ein `parts_task`
-- tragen muss, verbietet genau die Zeilen, die ab jetzt geschrieben werden. Sie geht hier, nicht
-- erst mit der Spalte im nächsten Release: eine Prüfregel zu entfernen erweitert nur, was erlaubt
-- ist, und so braucht der neue Code nichts als diese Datei.
alter table items drop constraint if exists items_parts_shape;

alter table items drop constraint items_kind_check;
alter table items add constraint items_kind_check
  check (kind in ('short','long','numeric','multiple_choice','formula','vocab','speak',
                  'order','match','table_fill','cloze'));

-- Eine strukturierte Art hat IMMER eine Aufgabe, jede andere NIE, und der `type` der Aufgabe ist
-- die Art der Frage. Das ist die Bedingung dafür, dass `structured.ts` die einzige Stelle ist, die
-- so eine Frage beurteilt: ohne Aufgabe gäbe es nichts zu vergleichen, und eine Reihenfolge als
-- Textantwort würde als Zeichenkette gegen die gerenderte Lösung geprüft.
alter table items add constraint items_task_matches_kind
  check (
    (kind in ('order','match','table_fill','cloze')) = (task is not null)
    and (task is null or task->>'type' = kind)
  );
