-- Ihr Foto als ihre Nachricht im Gespräch (issue #632, Folge von #630 Punkt 4).
-- docs/architecture.md §Material, docs/privacy.md §Conversation.
--
-- Ein Blatt, das sie über die Chat-Leiste schickt, war bisher nur eine Zeile in `materials`: im
-- Gespräch stand von ihr nichts, und 10–20 s lang zeigte nichts, dass etwas passiert. Jetzt
-- schreibt das Abschicken (submit) in derselben Transaktion ihre Nachricht — eine Zeile in
-- `buddy_messages` mit der Rolle `learner`, OHNE Text, die auf das Material zeigt. Die App zeigt
-- die Seite aus ihrer eigenen Kopie auf dem Telefon; wo das Blatt gerade steht (wird gelesen,
-- gelesen, nicht lesbar), liefert der Server bei jedem Lesen aus der EINEN Zeile des Materials.
-- Kopiert wird nichts: kein Bild, kein Pfad, kein Text des Blatts.
--
-- Wie 0091 (`roleplay_id`) und 0104 (`rehearsal_id`): eine Spalte, additiv, nur auf diesen
-- Nachrichten gesetzt. Gelöscht wird die Nachricht mit dem Gespräch oder dem Konto; eine
-- Materialzeile, die verschwindet, nimmt ihre Nachricht mit (on delete cascade) — eine Nachricht,
-- die auf nichts mehr zeigt, sagt nichts.
--
-- Kein Backfill: ältere Blätter bekommen keine nachträgliche Nachricht (ihr Zeitpunkt im
-- Gespräch wäre geraten).
alter table buddy_messages add column if not exists material_id uuid
  references materials(id) on delete cascade;

-- Höchstens eine Nachricht je Blatt: ein wiederholtes Abschicken schreibt keine zweite.
create unique index if not exists buddy_messages_material_idx on buddy_messages (material_id)
  where material_id is not null;

-- Die Nachricht zu einem Blatt hat keinen Text; jede andere weiterhin 1–4000 Zeichen. Die alte
-- Bedingung wird ersetzt, nicht ergänzt (zwei Bedingungen für eine Regel ändert man beim nächsten
-- Mal nur zur Hälfte).
alter table buddy_messages drop constraint if exists buddy_messages_text_check;
alter table buddy_messages drop constraint if exists buddy_messages_sheet_text_check;
alter table buddy_messages add constraint buddy_messages_sheet_text_check check (
  (material_id is null and length(text) between 1 and 4000)
  or (material_id is not null and role = 'learner' and text = '')
);

comment on column buddy_messages.material_id is
  'Only on her message for a sheet she sent through the chat (issue #632): the material it is. The message has no text and holds no image; the app shows the page from its own copy on the phone, the server says where the reading stands from the material row. Null everywhere else.';
