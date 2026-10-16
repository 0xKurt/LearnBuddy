-- Fremdschlüssel vom Kern in die Lern-Domain gehören der Domain (issue #107, Schnitt 9).
--
-- Neun Tabellen des allgemeinen Buddy-Kerns zeigen auf Tabellen der Lern-Domain: ihr Ziel auf
-- das Fach, ihre Nachricht auf das Blatt, ihr Löschvorschlag auf die Frage, … Diese Constraints
-- heißen jetzt `domain_…`, damit ein Buddy ohne Lern-Domain (`create-buddy`, Schnitt 10) genau
-- sie aus seinem Kern-Schema weglässt. Spalten, Ziele und ON DELETE bleiben exakt, wie sie waren
-- (geprüft im echten Katalog: apps/api/src/__tests__/domain-foreign-keys.int.test.ts).
--
-- Je Constraint: der alte fällt und der neue entsteht in einem ALTER, `NOT VALID` (kein Scan
-- unter der Sperre), danach `VALIDATE CONSTRAINT` (prüft die Zeilen mit einer schwächeren
-- Sperre). Lücken gibt es keine: die Zeilen erfüllten den alten Constraint schon.

alter table buddy_focus
  drop constraint buddy_focus_material_id_fkey,
  add constraint domain_buddy_focus_material_id_fkey foreign key (material_id) references materials(id) on delete set null not valid;
alter table buddy_focus validate constraint domain_buddy_focus_material_id_fkey;

alter table buddy_focus
  drop constraint buddy_focus_subject_id_fkey,
  add constraint domain_buddy_focus_subject_id_fkey foreign key (subject_id) references subjects(id) on delete set null not valid;
alter table buddy_focus validate constraint domain_buddy_focus_subject_id_fkey;

alter table buddy_goals
  drop constraint buddy_goals_subject_id_fkey,
  add constraint domain_buddy_goals_subject_id_fkey foreign key (subject_id) references subjects(id) on delete set null not valid;
alter table buddy_goals validate constraint domain_buddy_goals_subject_id_fkey;

alter table buddy_lookbacks
  drop constraint buddy_lookbacks_subject_id_fkey,
  add constraint domain_buddy_lookbacks_subject_id_fkey foreign key (subject_id) references subjects(id) on delete set null not valid;
alter table buddy_lookbacks validate constraint domain_buddy_lookbacks_subject_id_fkey;

alter table buddy_messages
  drop constraint buddy_messages_material_id_fkey,
  add constraint domain_buddy_messages_material_id_fkey foreign key (material_id) references materials(id) on delete cascade not valid;
alter table buddy_messages validate constraint domain_buddy_messages_material_id_fkey;

alter table buddy_messages
  drop constraint buddy_messages_rehearsal_id_fkey,
  add constraint domain_buddy_messages_rehearsal_id_fkey foreign key (rehearsal_id) references rehearsals(id) on delete set null not valid;
alter table buddy_messages validate constraint domain_buddy_messages_rehearsal_id_fkey;

alter table buddy_messages
  drop constraint buddy_messages_roleplay_id_fkey,
  add constraint domain_buddy_messages_roleplay_id_fkey foreign key (roleplay_id) references buddy_roleplays(id) on delete set null not valid;
alter table buddy_messages validate constraint domain_buddy_messages_roleplay_id_fkey;

alter table buddy_pending_actions
  drop constraint buddy_pending_actions_item_id_fkey,
  add constraint domain_buddy_pending_actions_item_id_fkey foreign key (item_id) references items(id) on delete cascade not valid;
alter table buddy_pending_actions validate constraint domain_buddy_pending_actions_item_id_fkey;

alter table buddy_pending_actions
  drop constraint buddy_pending_actions_material_id_fkey,
  add constraint domain_buddy_pending_actions_material_id_fkey foreign key (material_id) references materials(id) on delete cascade not valid;
alter table buddy_pending_actions validate constraint domain_buddy_pending_actions_material_id_fkey;
