-- Lange Texte — Aufsatz, Erörterung, Interpretation (issue #258): eine Rückmeldung je Kernpunkt
-- der Textsorte und drei Stellen zum Verbessern, keine Note.
--
-- Zwei Dinge, beide additiv:
--
--   1. die Frageart `essay` (packages/shared-types/src/contracts/learning.ts `ItemKind`). Ihre
--      Kernpunkte stehen in `items.rubric` wie die einer Schreibaufgabe (0075) und einer
--      Erklärfrage (0088), mit der Prüfart `essay_point`, die nur Code schreibt
--      (apps/api/src/modules/practice/essay.ts);
--   2. `practice_turns.essay_feedback`: die Rückmeldung als Struktur (`EssayFeedback`), damit die
--      App jeden Kernpunkt und jede Stelle für sich zeigen kann — wie `pronunciation` (0003) für
--      eine gesprochene Antwort. Nur Zitate, die der Server in ihrem Text gefunden hat.
--
-- Ihr Turn trägt das Urteil `not_an_attempt` (nichts wurde benotet, CLAUDE.md Regel 5); die
-- Prüfregel für `verdict` bleibt also, wie sie ist.
--
-- Die Prüfregel für die Art wird wie in 0085/0087 NICHT neu hingeschrieben, sondern aus der Regel
-- gebaut, die gerade in der Datenbank steht: eine andere Migration, die zur selben Zeit eine
-- weitere Art erlaubt, darf hier nicht still wieder verboten werden. Steht `essay` schon drin,
-- ändert die Datei nichts.

do $$
declare
  def text;
begin
  select pg_get_constraintdef(oid) into def
    from pg_constraint
   where conrelid = 'public.items'::regclass and conname = 'items_kind_check';
  if def is null then
    raise exception '0089_essay_feedback: items_kind_check is missing; nothing was changed.';
  end if;
  if position('''essay''' in def) = 0 then
    if position('ARRAY[' in def) = 0 then
      raise exception '0089_essay_feedback: items_kind_check has an unexpected form (%); nothing was changed.', def;
    end if;
    alter table items drop constraint items_kind_check;
    execute 'alter table items add constraint items_kind_check '
         || replace(def, 'ARRAY[', 'ARRAY[''essay''::text, ');
  end if;
end
$$;

alter table practice_turns add column if not exists essay_feedback jsonb;

comment on column practice_turns.essay_feedback is
  'Only on the tutor turn after a long text (kind essay, issue #258): EssayFeedback in packages/shared-types/src/contracts/essay.ts — each key point of the text type (met with her own quote the server found, or open with a prepared line) and up to three places to improve, each quoted from her text and found there by the server. No score, no grade.';
