-- Ein Vortrag, dessen Mitschrift an ihrer Grenze abbrach, wird gemessen statt verworfen
-- (KI-Audit K7 / D-F9, issue #681).
--
-- Bisher kostete eine Mitschrift über 16 000 Zeichen oder eine Antwort, die an der Grenze der
-- Ausgabe-Tokens abbrach, die ganze Aufnahme (503; die Aufnahme wird nicht gespeichert, sie war
-- also verloren). Jetzt wird gemessen, was aufgeschrieben ist, und die Messung heißt „teilweise“.
-- Welchen Anteil der Aufnahme dieser Teil abdeckt, weiß niemand: das Tempo bleibt dann leer
-- (`words_per_minute` null), statt eine zu niedrige Zahl zu behaupten (Regel 5).
--
-- Kein Backfill: jede bisherige Messung war vollständig (`partial` false).
alter table rehearsals
  add column partial boolean not null default false,
  alter column words_per_minute drop not null,
  add constraint rehearsals_pace_unless_partial check (partial or words_per_minute is not null);

comment on column rehearsals.partial is
  'Only the first part of the recording was written down (the transcript broke off at its limit, #681): the numbers are that part''s; words_per_minute is then null.';
