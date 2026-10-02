-- Bilder in Antwortoptionen: „Welcher Graph passt zu f(x) = …?“ (issue #231).
--
-- Eine Multiple-Choice-Frage darf je Option eine Abbildung tragen (`Figure`,
-- packages/shared-types/src/contracts/figure.ts, alle Typen). Die Abbildungen stehen als
-- Liste PARALLEL zu `choices`: Option i ist `choices[i]` (ihr Text — was der Tutor liest, was
-- gesprochen erkannt wird, was als Lösung steht) und `choice_figures[i]` (was die App zeigt).
-- Warum eine eigene Spalte und keine neue Form für `choices`:
--   * `choices text[]` bleibt, wie es ist — alte Zeilen, alte App-Versionen, die
--     Index-Bewertung (`correct_choice`), Tutor, Sprachmodus und Zusammenfassung laufen
--     unverändert weiter;
--   * die Abbildungen sind Daten, die die App zeichnet, kein Schlüssel: sie dürfen zur App.
--
-- Was Code vor dem Speichern prüft, steht in apps/api/src/modules/practice/choiceCheck.ts
-- (#224 „Regel 0“, #227 Nr. 2): keine zwei gleichen Optionen (auch nicht wertgleich, auch
-- nicht als gleich aussehende Graphen), genau eine Option passt zum Schlüssel, und es ist
-- die, auf die `correct_choice` zeigt. Scheitert das, entsteht keine Frage.
--
-- Die Prüfregel hält die beiden Listen zusammen: nur bei Multiple Choice, und dann genau
-- eine Abbildung je Option. Kein Backfill: alte Fragen haben keine.

alter table items add column choice_figures jsonb;

alter table items add constraint items_choice_figures_shape
  check (
    choice_figures is null
    or (kind = 'multiple_choice'
        and jsonb_typeof(choice_figures) = 'array'
        and jsonb_array_length(choice_figures) = coalesce(array_length(choices, 1), 0))
  );
