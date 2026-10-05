-- Die Rückmeldung nach dem Rollenspiel als Ergebniskarte (issue #384, Folge von #244/#334).
--
-- Bisher bekam die App die Rückmeldung nur als Text der Abschlussnachricht; die geprüfte,
-- strukturierte Fassung lag in `buddy_roleplays.feedback`, aber ohne Verbindung zu der Nachricht,
-- die sie im Gespräch trägt. Die App sollte sie nie aus dem Text zurückparsen.
--
-- Eine Spalte, additiv: die Abschlussnachricht, die die Rückmeldung eines Rollenspiels trägt,
-- zeigt auf dieses Rollenspiel. Der Server liefert die Rückmeldung dann aus der EINEN gespeicherten
-- Fassung (`buddy_roleplays.feedback`) mit der Nachricht aus — nichts wird kopiert. Gesetzt nur,
-- wenn es eine Rückmeldung gibt (nach den Zügen, auf ihren Wunsch oder ihren Tipp, mit gespielten
-- Zügen); bei einer Sorge, einem verlassenen oder leeren Spiel bleibt sie leer.
--
-- Kein Backfill: ältere Abschlussnachrichten bleiben Text, wie sie waren.
alter table buddy_messages add column if not exists roleplay_id uuid
  references buddy_roleplays(id) on delete set null;

create index if not exists buddy_messages_roleplay_idx on buddy_messages (roleplay_id)
  where roleplay_id is not null;

comment on column buddy_messages.roleplay_id is
  'Only on Buddy''s closing message after a roleplay that has feedback (issue #384): the roleplay whose checked feedback (buddy_roleplays.feedback) the app shows as the result card. Null everywhere else.';
