-- Die Formenwahl eines Blatts, gespeichert für seine nächsten Lesungen (KI-Audit F5-2, issue #657).
-- docs/architecture.md §Schema budget.
--
-- Seit #627 wählt vor jeder Lesung ein kleiner Modellaufruf („forms“), welche Aufgabenformen und
-- Figurtypen das Antwortschema der Lesung enthält — mit allen Fotos des Blatts im Aufruf. Innerhalb
-- eines Lese-Laufs wird schon nur einmal gewählt; eine Klärung („Was steht da?“, #164) oder ein
-- erneuter Lauf desselben Blatts ist aber ein eigener Job und wählte jedes Mal neu: dieselben Fotos,
-- dieselbe Frage, ein Aufruf mehr.
--
-- Gespeichert wird, was gewählt wurde, mit dem Schlüssel, unter dem es gilt: die Version des
-- Lese-Prompts samt Schema und die in dieser Umgebung abgeschalteten Formen (`FORMS_OFF`). Ändert
-- sich eins davon, gilt die Wahl nicht mehr und wird neu getroffen — nie eine veraltete Wahl.
-- Kein Backfill: ein Blatt ohne gespeicherte Wahl wählt wie bisher.
alter table materials add column if not exists form_choice jsonb;

comment on column materials.form_choice is
  'Die Formenwahl der letzten Lesung dieses Blatts: {key, forms, figures}. key = Prompt-Version der Lesung + FORMS_OFF; nur bei gleichem key wiederverwendet (modules/materials/reader.ts). Issue #657.';

alter table materials add constraint materials_form_choice_shape
  check (form_choice is null or (jsonb_typeof(form_choice) = 'object'
    and jsonb_typeof(form_choice -> 'key') = 'string'
    and jsonb_typeof(form_choice -> 'forms') = 'array'
    and jsonb_typeof(form_choice -> 'figures') = 'array'));
