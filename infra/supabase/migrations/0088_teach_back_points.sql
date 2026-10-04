-- „Erklär mal" (issue #236): welche Kernpunkte ihrer Erklärung in diesem Lauf schon belegt sind.
--
-- Eine Erklärfrage hat keinen Schlüssel, sondern 3–6 Kernpunkte (`items.rubric`, Prüfart
-- `key_point`, packages/shared-types/src/contracts/rubric.ts). Sie erklärt, Buddy hakt ab, was
-- belegt ist, und stellt EINE Nachfrage zum ersten fehlenden Punkt; ihre Antwort darauf ergänzt
-- die Erklärung, statt sie zu ersetzen.
--
-- Warum eine Spalte und nicht jedes Mal neu urteilen: ein Punkt gilt nur mit einem Zitat aus
-- ihren eigenen Worten, das der Server nachgeschlagen hat. Ist er einmal so belegt, darf ihn kein
-- späteres Urteil wieder wegnehmen — ein „✓", das bei der nächsten Antwort verschwindet, wäre eine
-- Behauptung, die die App zurücknimmt, ohne dass sich an ihren Worten etwas geändert hat
-- (CLAUDE.md Regel 1 und 5). Also merkt sich CODE die belegten Punkte, und das Modell wird zu
-- ihnen gar nicht mehr gefragt (`askedElements`, apps/api/src/modules/practice/rubric.ts).
--
-- Je Frage im Lauf, nicht je Frage: kommt dieselbe Frage in einem späteren Lauf wieder, erklärt sie
-- von vorn. Nur Kürzel, die der Server aus der Position vergibt (`r1` …), nie Text vom Modell
-- (Regel 2). Additiv, mit Vorgabewert; kein Backfill nötig.

alter table session_items add column explained text[] not null default '{}';

comment on column session_items.explained is
  'Only for a teach_back question (issue #236): the server refs (r1 …) of the key points her explanation has covered in this run, each confirmed by a quote the server found in her own words. Only ever grows; the model is not asked about these again.';
