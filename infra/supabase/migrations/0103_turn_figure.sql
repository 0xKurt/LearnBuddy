-- Erklärung mit Bild (issue #298): eine Erklärung von Buddy darf eine Figur zeigen.
--
-- „Anders erklären" (practice/reexplain.ts) darf neben dem Text EINE Figur aus der vorhandenen
-- Figuren-Bibliothek liefern — eine Parabel, die sich mit a verändert, einen Zahlenstrahl, ein
-- Dreieck mit seinen Seiten. Das Modell liefert nur Daten; der Server prüft sie mit denselben
-- Prüfungen wie die Figur einer Frage (practice/explainFigure.ts) und verwirft, was nicht genau so
-- zu zeichnen ist. Gespeichert wird sie am Tutor-Turn, damit sie nach dem Neuladen wieder dasteht.
--
-- Nullable und ohne Default: jeder bestehende Turn hat keine Figur. Gelesen wird sie durch den
-- Vertrag (`PracticeTurnView.figure`, packages/shared-types/src/contracts/learning.ts); eine Zeile,
-- die dieser Build nicht lesen kann, zeigt den Turn ohne Figur.

alter table practice_turns add column if not exists figure jsonb;

alter table practice_turns add constraint practice_turns_figure_shape check (
  figure is null or (role = 'tutor' and jsonb_typeof(figure) = 'object' and figure ? 'type')
);

comment on column practice_turns.figure is
  'Die Figur einer Erklärung (Issue #298): Daten einer Figur der Bibliothek (contracts/figure.ts), vom Server geprüft (practice/explainFigure.ts); nur an Tutor-Turns, sonst null.';
