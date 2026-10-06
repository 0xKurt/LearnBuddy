-- Lange Texte (issue #258, Schritt 2): ein Aufsatz passt in ihren Turn.
--
-- Der Vertrag und der Server nehmen für eine Frage der Art `essay` bis zu 12 000 Zeichen an
-- (`ESSAY_TEXT_MAX`, packages/shared-types/src/contracts/essay.ts; jede andere Antwort bleibt bei
-- 2000, `admitText` in apps/api/src/modules/practice/essay.ts antwortet sonst 422). Die Tabelle
-- `practice_turns` hielt aber seit 0001 jeden Text bei höchstens 4000 Zeichen fest: ein Aufsatz
-- über etwa 600 Wörter scheiterte beim Speichern an `practice_turns_text_check` — gefunden vom
-- Browser-Walkthrough mit 1700 Wörtern (tests/web/essay.spec.ts); der Integrationstest von
-- Schritt 1 schickte nur gut 2000 Zeichen.
--
-- Die Grenze der Datenbank wird die des Vertrags. Welche Frage wie viel nimmt, entscheidet
-- weiterhin der Server je Art; die Tabelle hält nur fest, dass nie mehr als das Längste
-- ankommt. Alle bestehenden Zeilen haben höchstens 4000 Zeichen, die neue Prüfung gilt für sie.

alter table practice_turns drop constraint if exists practice_turns_text_check;

alter table practice_turns
  add constraint practice_turns_text_check check (length(text) between 1 and 12000);
