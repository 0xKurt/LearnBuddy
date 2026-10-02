-- Strukturierte Aufgaben: Antworten, die eine FORM haben statt eines Satzes (issues #228–#232).
--
-- Vier Arten teilen sich ein Fundament, und alle vier kommen jetzt in die Prüfregel, damit
-- die nächsten (#229 Zuordnen, #230 Tabelle füllen, #232 Lückentext) keine Constraint-
-- Migration mehr brauchen:
--   order       — Elemente in die richtige Reihenfolge tippen (#228)
--   match       — Paare verbinden, Elemente in Gruppen sortieren (#229)
--   table_fill  — Lücken einer Tabelle füllen (#230)
--   cloze       — mehrere Lücken in einem Text (#232)
--
-- `task` ist die EINE geprüfte Definition der Aufgabe, MIT Schlüssel (`StructuredTask`,
-- packages/shared-types/src/contracts/structured.ts). Für `order`: die Elemente in der
-- gemischten Reihenfolge, in der sie sie sieht, mit Ids vom Server, und der Schlüssel als
-- Folge dieser Ids. Das Modell schreibt die Elemente; Ids, Mischung und Schlüssel setzt Code
-- (CLAUDE.md Regel 2), und Code prüft vor dem Speichern, was sich mechanisch prüfen lässt
-- (#224 „Regel 0", apps/api/src/modules/practice/structured.ts): 3–8 Elemente, keine
-- Dubletten, der Schlüssel ist eine Permutation, eine Zahlenfolge ist wirklich sortiert.
-- Scheitert eine Prüfung, entsteht keine Frage — repariert wird nichts.
--
-- Warum eine Spalte und nicht die vorhandenen:
--   * die App bekommt daraus `ItemView.task_view` — dieselbe Aufgabe OHNE Schlüssel. Der
--     Schlüssel verlässt den Server nie (#162 hat es für `bar_task` genauso gemacht);
--   * die Bewertung vergleicht `AnswerRequest.parts` mit ihr, exakt und ohne Modell;
--   * `answer` bleibt trotzdem gefüllt — mit der Lösung, wie sie sie lesen kann („A → B → C").
--     Damit laufen Lösung zeigen, Tipps, Tutor, Probetest-Auswertung und Zusammenfassung
--     unverändert weiter.
--
-- Die Prüfregeln halten die beiden Seiten zusammen: eine strukturierte Art hat IMMER eine
-- Aufgabe, jede andere NIE, und der `type` der Aufgabe ist die Art der Frage. Kein Backfill:
-- alte Zeilen sind keine strukturierten Fragen und haben keine Aufgabe.

alter table items add column task jsonb;

alter table items drop constraint items_kind_check;
alter table items add constraint items_kind_check
  check (kind in ('short','long','numeric','multiple_choice','formula','vocab','speak',
                  'order','match','table_fill','cloze'));

alter table items add constraint items_task_matches_kind
  check (
    (kind in ('order','match','table_fill','cloze')) = (task is not null)
    and (task is null or task->>'type' = kind)
  );
