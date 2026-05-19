# Live-verify checklist — LearnerExperience plan slices

Use this after deploying a branch that lands any Phase A-E slice. The
unit + integration tests prove the wiring; this proves the BEHAVIOR
against real Vertex + Supabase.

Prerequisites:

- `apps/api/.env.local` populated with live `SUPABASE_*` and `GCP_*` /
  `VERTEX_*` credentials.
- `infra/supabase/migrations/00*` applied to the live project. Check:
  ```sh
  pnpm db:start                                  # local supabase, if testing locally
  # OR for live:
  supabase db push --project-ref <your-ref>      # applies pending migrations
  ```
- API running locally: `pnpm -F api dev` (uses real Vertex by default).
- A throw-away learner profile you can spam without polluting prod data.

Capture each section's HTTP request + response (or SSE stream) into a
small text file under `scratch/live-verify-<date>/` for later review.

---

## 1. Phase C2: warm session opener

**Goal.** A learner with a prior `learner_episodes` row sees a tone-
appropriate opener line on the next session start.

Steps:

1. Manually insert a `learner_episodes` row for your test learner (or
   use the SQL fixture in `infra/supabase/seeds/learner-episode-warm.sql`
   if present).
2. `POST /sessions` with `subject_id` matching the prior episode's topic.
3. Confirm the response body includes `opener: "Letztes Mal hat das mit
…"` (tone "high" template) or another tone variant matching the
   row.

Acceptance:

- Opener references **the material** ("Brüche", "Photosynthese"), never
  the learner's emotional state.
- `null` when no prior `learner_episodes` row exists.

---

## 2. Phase A1: praise context (specific, not pattern-locked)

**Goal.** Praise lines vary by effort context and never repeat verbatim.

Steps:

1. Start a new session, answer 3 items first-try correct.
2. Observe each tutor reply.

Acceptance:

- First-try-easy items: warm acknowledgement, NO "stark!", NO "großartig!"
- Effort-after-hints items: explicit credit for the WORK ("hast dich
  durchgebissen"), not the kid.
- No two consecutive praise lines are identical.
- Banned ability vocabulary absent: "schlau", "begabt", "Genie",
  "Naturtalent", "Mathe-Genie", "smart". (Search the SSE stream.)

---

## 3. Phase A2: progressive give-up

**Goal.** Say "weiß nicht" four times in a row on the same item; observe
escalation.

Steps:

1. New item. Send `text: "weiß nicht"` four times.
2. Observe each tutor reply.

Acceptance:

- Strike 0 — stock encouragement ("kein Stress, denk in Ruhe nach")
  with 0 credits consumed.
- Strike 1 — Vertex called in `gentle_scaffold` mode. ONE concrete
  entry point from the material, not another open question.
- Strike 2 — Vertex called in `gentle_reveal` mode. Reveals the answer
  kindly + offers two choices.
- Strike 3 — stock pivot ("lass uns das nächstes Mal nochmal") with
  0 credits consumed.

`SELECT verdict, content FROM conversation_turns WHERE session_id = $1
ORDER BY turn_index;` to verify the four tutor turns + verdicts
('skipped' on each).

---

## 4. Phase C+: misconception_confrontation

**Goal.** A learner with an active `recurring_misconceptions` row whose
tag matches the current item's topic gets a misconception-confronting
reply on a wrong answer.

Steps:

1. Insert a `recurring_misconceptions` row for the test learner with
   `concept_tag: 'fraction_addition.common_denominator_missing'`,
   `description: 'adds numerators and denominators directly'`,
   `seen_count: 3`, `resolved_at: NULL`.
2. Start a session and pick an item on topic "Brüche" or "Bruchaddition".
3. Submit a WRONG answer ("2/5" for "1/2 + 1/3").
4. Inspect the tutor's reply.

Acceptance:

- Reply uses teacher-vernacular ("Das ist die Stelle, an der wir schon
  mal waren …" or locale equivalent) — not a generic broad hint.
- Names the WORK pattern, never the learner ("du tendierst dazu" is
  BANNED).
- Asks ONE concrete question that distinguishes the misconception from
  the correct rule.
- `SELECT last_addressed_at FROM recurring_misconceptions WHERE
learner_id = $1` is non-null (bumped by sessions.ts).

Then COLD-correct the same topic on a fresh item (no hints, no prior
wrong) and verify:

- `SELECT resolved_at FROM recurring_misconceptions WHERE learner_id =
$1` is non-null. The misconception is now resolved.

---

## 5. Phase D1: confidence_probe + wrong_example_probe

**Goal.** Sharp first-try corrects on conceptual items trigger a probe.

Steps:

1. Answer a conceptual short-answer item correctly on the first try (no
   hints, no prior wrong attempts). Use a low-pressure response so
   `ceiling_signal` stays moderate.
2. Inspect tutor's reply.

Acceptance:

- Reply asks "Kannst du in einem Satz sagen, WIESO das stimmt?" or a
  locale equivalent. Framed as curiosity, NOT as a test
  ("Lass mich prüfen, ob du es wirklich verstanden hast" is BANNED).
- `SELECT move_id FROM strategy_decisions WHERE session_id = $1 ORDER
BY turn_index DESC LIMIT 1;` returns `'confidence_probe'`.

Then continue with a 2+ streak of first-try corrects on conceptual
items. On the next correct, expect `wrong_example_probe` ("Wenn jemand
X gesagt hätte, wäre das richtig?"). Verify it fires AT MOST ONCE per
session (next correct returns to `confidence_probe` or `continue_natural`).

---

## 6. Phase D2: probe_assessments persistence

**Goal.** Each probe response generates a `probe_assessments` row.

Steps:

1. After a `confidence_probe` (step 5), reply with a substantive
   reasoning sentence.
2. Reply with a one-word restatement on the NEXT probe.
3. Reply with "weiß nicht" on a future probe.

Acceptance:

```sql
SELECT probe_move, quality, response_excerpt
FROM probe_assessments
WHERE learner_id = $1
ORDER BY created_at;
```

- Row 1: `quality = 'substantive'`
- Row 2: `quality = 'rephrased'`
- Row 3: `quality = 'gave_up'` — written even though the give-up
  short-circuited the LLM (verify by checking `cost_usd_micros = 0`
  on the corresponding `attempts` row).

---

## 7. Phase E1: curiosity_hook

**Goal.** On a high-ceiling 3+ streak, the tutor surfaces an adjacent
curiosity with a real choice.

Steps:

1. Answer 3 conceptual items first-try correct on the same topic with
   short response latencies (the signal computes `ceiling_signal` from
   latency + accuracy).
2. On the 3rd correct (or 4th, depending on the curiosity_hook variety
   penalty), inspect the tutor's reply.

Acceptance:

- ONE "Wusstest du, dass …?" fact connected to the current topic.
- ONE choice question: "Magst du da kurz reinschauen, oder weiter mit
  dem Stoff?"
- Does NOT fire twice in the same session.
- `move_id = 'curiosity_hook'` on the corresponding `strategy_decisions`
  row.

---

## 8. Phase C1: reflective episode written on /finish

**Goal.** `PATCH /sessions/:id/finish` triggers a fire-and-forget
reflective summary that ends up in `learner_episodes`.

Steps:

1. End a session you just exercised: `PATCH /sessions/:id/finish`.
2. Wait ~10 seconds (the Vertex reflect call is async).
3. Query:

```sql
SELECT id, one_sentence_arc, concepts_touched, high_points, low_points,
       hypothesized_misconceptions, open_questions
FROM learner_episodes
WHERE session_id = $1;
```

Acceptance:

- Row exists.
- `one_sentence_arc` describes the work, not the learner ("the session
  covered …" — never "the student was …").
- `hypothesized_misconceptions` may be empty for a smooth session;
  populated for sessions with multiple wrong-on-same-concept turns.
- New misconceptions (confidence > 0.6) appear as fresh rows in
  `recurring_misconceptions`; existing ones bump `seen_count`.

---

## L1 invariant final pass

Search every captured tutor reply across the session for first-person
analytical phrases about the learner. ALL of these are bugs:

- "ich merke, du …"
- "du bist heute frustriert"
- "du tendierst zu …"
- "I notice you …"

The model is allowed to react to the WORK ("die Aufgabe ist gemein",
"diese Art von Aufgabe ist tückisch") but never to LABEL the learner.

If any leak is found, file a bug citing the exact turn + the slice
that produced it.

---

## Cost sanity check

After exercising all sections:

```sql
SELECT model, prompt_version, COUNT(*), SUM(cost_usd_micros) / 1000000.0 AS usd
FROM attempts
WHERE learner_id = $1
GROUP BY model, prompt_version
ORDER BY usd DESC;
```

Watch for:

- `prompt_version = 'tutor.4'` on the new turns (the version bump for D2).
- `prompt_version = 'reflect.1'` on the reflective call.
- Total session cost per kid-minute stays within the credit budget
  (see docs/08-cost-and-credits.md).
