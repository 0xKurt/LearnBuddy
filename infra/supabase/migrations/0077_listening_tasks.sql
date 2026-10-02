-- Hörverstehen: eine Frage, deren Aufgabenstoff GESPROCHEN wird (Issue #210).
--
-- Keine zweite Sprachkette. Die Sprachausgabe (ADR 0008), die Stimme, die Geschwindigkeit,
-- der 24-Stunden-Audiocache und die langsamere Stufe gab es schon; es fehlte die Frage, die
-- aus dem HÖREN beantwortet wird — in Englisch, Französisch und Spanisch eine eigene
-- Kompetenz, in NRW einmal im Schuljahr Teil einer Klassenarbeit.
--
-- Deshalb genau eine Spalte und keine neue Tabelle: die Antwortformen bleiben die, die es
-- gibt (`multiple_choice`, `short`), die Bewertung bleibt dieselbe, FSRS bleibt dasselbe,
-- die Fragekarte bleibt dieselbe. Neu ist nur, woher die Frage ihren Stoff hat.
--
-- Was in der Spalte steht, ist GENAU der Text, den die Sprachausgabe bekommt — keine
-- Fassung davon für den Bildschirm (`ListenTask`, packages/shared-types/src/contracts/listen.ts,
-- Regel 0 aus #210). Wären der vorgelesene und der geprüfte Text zwei Texte, würde jede
-- Antwort gegen etwas geprüft, das sie nie gehört hat.
--
-- Warum der Text an JEDER Frage steht und nicht einmal pro Satz: die Wiederholung
-- (`item_states`) bringt eine einzelne Frage in drei Wochen allein zurück. Eine Frage, deren
-- Text woanders liegt, ist dann nicht mehr beantwortbar. Eine Frage trägt alles, was sie
-- zum Gestelltwerden braucht — so wie `bar_task` (0064) und `figure` auch.
--
-- Der Text verlässt den Server nicht, solange die Frage offen ist: die App bekommt Audio
-- (`POST /practice/sessions/:id/listen`), die Wörter erst, wenn die Frage geschlossen ist
-- (`SessionItemView.listen_transcript`). Er ist die Quelle jeder Antwort — mitgeschickt wäre
-- er die Lösung auf dem Gerät.
--
-- Kein Backfill: alte Zeilen haben keinen Hörtext und werden genau wie bisher behandelt.

alter table items add column listen_task jsonb;

comment on column items.listen_task is
  'Hörverstehen (Issue #210): der gesprochene Text, aus dem diese Frage beantwortet wird, und seine Sprache — {"text": …, "lang": …}, geprüft als `ListenTask`. Genau das, was die Sprachausgabe bekommt; nie eine Umformulierung. null für jede Frage, die gelesen statt gehört wird.';
