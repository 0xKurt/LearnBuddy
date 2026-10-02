-- Vormachen statt nur abfragen (issue #298): ein geführtes Beispiel in der Übung, und eine
-- Erklärung, die eine Figur zeigen darf.
--
-- ─────────────── das geführte Beispiel ───────────────
--
-- Gute Nachhilfe zeigt einen Schritt, lässt das Kind den nächsten machen, prüft ihn und führt
-- weiter. Bisher gab es nach dem dritten Fehlversuch nur den fertigen Lösungsweg als Text.
--
-- Eine Zeile je Frage und Sitzung: das Beispiel wird einmal angeboten und einmal geführt. Was hier
-- steht, ist der GEPRÜFTE Plan (`modules/practice/guide.ts`):
--   * `steps` — Rechnen: die Zeilen des Lösungswegs, die `steps.ts` als lückenlosen Weg gelesen hat
--     und deren letzte Zeile der Schlüssel ist; Textfächer: die Kernpunkte mit Buddys Beispielsatz.
--     Ein Plan, der das nicht erfüllt, wird verworfen und nie gespeichert (Regel 0: verwerfen, nie
--     reparieren).
--   * `at` — der Index des Schritts, den SIE als Nächstes schreibt. Code führt ihn weiter, nicht
--     das Modell.
--   * `misses` — ihre Fehlversuche an genau diesem Schritt; nach zwei zeigt Buddy ihn vor.
--   * `status` — active · done · stopped · unavailable. `stopped` heißt: sie hat selbst
--     weitergemacht; `unavailable`: der Plan wurde verworfen, das Beispiel gibt es hier nicht.
--
-- Die Schritte sind KEINE Antworten auf die Frage: sie zählen nicht als Versuch, lösen keine
-- Aufdeckung aus und gehen nicht in FSRS ein. Erst eine Zeile, die beim Schlüssel ankommt, schließt
-- die Frage — als „mit Hilfe" gelöst, nie als „auf Anhieb".
create table guided_examples (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references practice_sessions(id) on delete cascade,
  learner_id uuid not null references learners(id) on delete cascade,
  item_id uuid not null references items(id) on delete cascade,
  kind text not null check (kind in ('steps', 'points')),
  -- Null nur bei `unavailable`: der Plan des Modells hielt der Prüfung nicht stand und wurde
  -- verworfen. Die Zeile bleibt, damit das Angebot nicht wiederkommt und kein zweiter Aufruf
  -- dasselbe noch einmal versucht.
  steps jsonb check ((steps is null) = (status = 'unavailable')),
  at int not null check (at >= 0),
  misses int not null default 0 check (misses >= 0),
  -- Rechnen: die letzte Zeile, die hält — Buddys oder ihre. Gegen sie prüft `steps.ts` ihren
  -- nächsten Schritt; ihr eigener Weg ist erlaubt, solange er folgt. Textfächer: null.
  prev text check (length(prev) <= 400),
  status text not null check (status in ('active', 'done', 'stopped', 'unavailable')),
  -- Vom App-Takt, nicht von `now()` (Regel 7).
  created_at timestamptz not null,
  updated_at timestamptz not null,
  unique (session_id, item_id)
);
create index guided_examples_learner_idx on guided_examples(learner_id);
-- Jeder Fremdschlüssel hat einen Index: das Löschen einer Frage sucht ihre Beispiele, ohne die
-- Tabelle ganz zu lesen (`scale.int.test.ts`). session_id deckt das unique oben ab.
create index guided_examples_item_idx on guided_examples(item_id);

comment on table guided_examples is
  'Ein geführtes Beispiel zu einer Frage einer Übung (issue #298): der geprüfte Plan (Zeilen eines lückenlosen Rechenwegs bis zum Schlüssel, oder Kernpunkte mit Beispielsatz), der Schritt, den sie als Nächstes schreibt, und ihre Fehlversuche daran. modules/practice/guide.ts.';
comment on column guided_examples.steps is
  'Der geprüfte Plan: GuidePlan in modules/practice/guide.ts. Rechnen: { kind: steps, lines: [{ line, say, hint }] }, von steps.ts als Weg bestätigt und am Schlüssel angekommen. Text: { kind: points, points: [{ name, missing, demo }] }.';
comment on column guided_examples.at is
  'Index des Schritts, den sie als Nächstes schreibt. Rechnen: Index in lines; Text: Index in points.';

alter table guided_examples enable row level security;

-- ─────────────── eine Erklärung mit Figur ───────────────
--
-- Eine Erklärung von Buddy in der Übung („Anders erklären", das geführte Beispiel) darf eine Figur
-- aus der vorhandenen Bibliothek zeigen (`ModelFigure` in packages/shared-types/src/contracts/
-- figure.ts): eine Parabel, die sich mit a verändert, ein Zahlenstrahl, eine Tabelle. Das Modell
-- liefert nur Daten; Code prüft sie (`modules/practice/explainFigure.ts`) und die App zeichnet sie.
-- Eine Figur, an der irgendetwas nicht stimmt, wird ganz verworfen — die Erklärung bleibt.
alter table practice_turns add column figure jsonb;

comment on column practice_turns.figure is
  'Nur Buddy-Züge: eine geprüfte Figur zur Erklärung (ModelFigure), sonst null. Vom Modell als Daten geliefert, von explainFigure.ts geprüft, von der App gezeichnet. Issue #298.';

-- ─────────────── ein eigenes Tageslimit für den Plan ───────────────
--
-- Der Plan eines geführten Beispiels ist ein eigener Modellaufruf (purpose `guide`, Tageslimit in
-- `config.ts` DAILY_LIMITS). Die Liste ist die aus 0054 plus `guide` — wer sie später neu setzt,
-- muss `guide` mitnehmen, sonst scheitert jeder Plan an dieser Prüfung.
alter table usage_daily drop constraint usage_daily_kind_check;
alter table usage_daily add constraint usage_daily_kind_check
  check (kind in ('buddy_turn','buddy_check','tutor','explain','extraction','pronounce',
                  'transcribe','hints','reexplain','summary','figures','consolidate',
                  'embedding','guide'));
