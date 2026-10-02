-- Die Rubrik einer Schreibaufgabe: ihre Pflichtelemente (issue #211, Schritt 2 aus #197).
--
-- Seit #197 behauptet die App bei einem freien Text keine Musterlösung mehr — kein „Die Lösung
-- ist", kein `Again`, kein wackliges Thema. Was fehlte, war das, was STATTDESSEN gesagt wird:
-- bei einer Inhaltsangabe, einem Bericht, einer Erörterung, einer Quellenanalyse, einem
-- Versuchsprotokoll zählt, ob die geforderten ELEMENTE da sind. Genau das steht in dieser
-- Spalte: die Liste, die eine Lehrkraft abhakt, geschrieben beim Einlesen des Blattes aus dem
-- Operator der Aufgabe und der Textsorte (`Rubric`, packages/shared-types/src/contracts/rubric.ts).
--
-- Warum eine Spalte und nicht ein Absatz im Prompt: weil sie entscheidet, was die Lernende zu
-- hören bekommt, und weil sie der einzige Grund ist, aus dem ein Element „fehlt" genannt werden
-- darf. Eine Liste im Prompt wäre ein Vorschlag, der bei jedem Aufruf anders ausfallen kann;
-- hier ist sie eine geprüfte, gespeicherte Struktur, die der Server bei JEDER Antwort gegen
-- denselben Maßstab hält (CLAUDE.md Regel 1). Dasselbe Mittel wie `items.bar_task` (0064) und
-- `materials.not_practicable` (0067): was eine Entscheidung trägt, steht im Code und in der
-- Datenbank, nicht in einer Formulierung.
--
-- Was die Spalte NICHT enthält, und das ist der Kern:
--
--   * kein Gewicht und keinen Punktwert. Es gibt keinen Gesamtwert, in den ein Element einginge
--     — die Rückmeldung ist die Liste der Elemente und EIN nächster Schritt, nie eine Note
--     (Abnahme von #211: „kein Gesamturteil und keine Note"). Ein Bruchteil hätte auch kein
--     Ziel: FSRS kennt drei Noten und keine Zwischennote (`practice/fsrs.ts`), und eine
--     erfundene wäre die Behauptung, sie beherrsche das Thema zu drei Vierteln.
--   * keine Musterformulierung. Jedes Element sagt nur, WIE es entschieden wird — eine Wortzahl,
--     eine Pflichtangabe, die Zeitform, oder (nur wo nichts zählbar ist) eine Beurteilung.
--     Drei der vier Prüfungen gehören damit dem Code, und eine vorhandene Angabe wird nie auf
--     das Wort des Modells hin als fehlend genannt.
--
-- Kein Backfill, und das ist kein Rückstand: eine Frage ohne Rubrik verhält sich genau wie seit
-- #197 — Buddy beurteilt, was sie geschrieben hat, und behauptet keine Lösung. Die Rubrik ist
-- das Mehr, nicht die Voraussetzung. Eine Rubrik, deren Form nicht hält, wird beim Anlegen
-- verworfen (`usableItems`, apps/api/src/modules/practice/items.ts) — die Frage bleibt, nur ohne
-- Rubrik; das ist derselbe Umgang, den eine nicht haltbare Figur schon bekommt.

alter table items add column rubric jsonb;

comment on column items.rubric is
  'Only for kind = ''long'': the required elements of this writing task, as `Rubric` (packages/shared-types/src/contracts/rubric.ts). Each element names HOW it is decided — a word count, a piece of information that must be named, the tense (all three counted by the server) or, where nothing can be counted, a judgement that must point at a verbatim quote from her text. No weight, no score, no grade: the feedback is the list of elements and ONE next step. Issue #211.';
