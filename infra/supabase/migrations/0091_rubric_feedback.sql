-- Die Rückmeldung je Kernpunkt als Struktur neben Buddys Satz (issues #236, #258).
--
-- Seit #211 verließ die Rückmeldung zu einer Schreibaufgabe den Server als EIN Satz: die
-- Elemente mit ihrem Stand in einer Zeile („Einleitung: steht · Präsens: noch nicht"), darunter
-- der nächste Schritt. Mit der Erklärfrage („Erklär mal", #236: bis zu sechs Kernpunkte und eine
-- Nachfrage) und dem Aufsatz (#258: Elemente der Textsorte und drei Stellen aus ihrem Text) wird
-- aus dieser Zeile ein Absatz, den sie entziffern muss. Also steht die Liste jetzt NEBEN dem Satz,
-- wie die Ausspracherückmeldung neben einer Sprechantwort (`pronunciation`): der Satz sagt den
-- einen nächsten Schritt und wird vorgelesen, die Liste zeigt, was schon trägt.
--
-- Was die Spalte trägt, ist das, was der SERVER gemessen hat (`RubricFeedback`,
-- packages/shared-types/src/contracts/rubric.ts), nicht was das Modell gesagt hat:
--
--   * je Element nur `met` oder nicht — ein Element, über das niemand etwas gemessen hat, steht
--     gar nicht drin (Regel 5);
--   * je Stelle zum Verbessern ein Zitat, das der Server in IHREM Text gefunden hat, und ein Satz
--     ohne Ziffer (`spotsIn`, apps/api/src/modules/practice/rubric.ts).
--
-- Und was sie bewusst NICHT trägt: keine Zahl, keinen Anteil, keine Note (CLAUDE.md Regel 6,
-- Abnahme von #258 „es gibt nie eine Note in der Antwort").
--
-- Kein Backfill: ältere Antworten tragen ihre Liste im Satz, wie sie geschrieben wurden, und
-- bleiben so lesbar. Null für jede Antwort, die keine Schreibaufgabe und keine Erklärfrage war.
-- Die Spalte gehört zu `practice_turns`, also gilt für sie, was für die Zeile gilt: sie wird mit
-- der Lernenden exportiert und gelöscht (docs/privacy.md, identity/privacy.ts).

alter table practice_turns add column rubric_feedback jsonb;

-- Ein Aufsatz passt in eine Antwort (issue #258). Der Text einer Runde war seit der Baseline auf
-- 4000 Zeichen begrenzt, das Doppelte des alten Antwortfelds; ein Aufsatz darf bis zu 15 000
-- haben (`ESSAY_CHARS_MAX`, packages/shared-types/src/contracts/learning.ts — warum 15 000 und
-- nicht 12 000, steht dort). Die Grenze bleibt eine Grenze, nur weiter: 16 000, damit ein
-- Aufsatz an der vollen Länge nicht an einem Zeichen scheitert, das die App anders zählt als
-- Postgres. Additiv im Sinn von §Migrations: jede Zeile, die die alte Prüfung bestand, besteht
-- die neue.
alter table practice_turns drop constraint practice_turns_text_check;
alter table practice_turns add constraint practice_turns_text_check
  check (length(text) between 1 and 16000);

comment on column practice_turns.rubric_feedback is
  'Only on a tutor turn about a free text with a rubric (items.rubric): which elements or key points stand in her words (met true/false — an element nobody measured is left out) and, for an essay, up to three places from her own text to improve, each a quote the server found in her text. `RubricFeedback` in packages/shared-types/src/contracts/rubric.ts. No count, no share, no grade. Issues #236, #258.';
