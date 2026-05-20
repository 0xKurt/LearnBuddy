# LearnBuddy — Interactive Voice/Text AI Agent: Complete Specification

> **Status:** Canonical. Sourced from doc 01–08, ADR 0002–0003, USER-FLOWS,
> USER-FLOWS-DEEP, LEARNER-EXPERIENCE-PLAN, LIVE-VERIFY-LEARNER-EXPERIENCE,
> UEBEN-ERKLAERT, DESIGN-BRIEF, 10-implementation-order, IMPLEMENTATION-AUDIT.
> No code. No implementation. Pure specification.

---

## Table of Contents

1. [Product Vision & Core Philosophy](#1-product-vision--core-philosophy)
2. [Architectural Laws (L1–L3)](#2-architectural-laws-l1l3)
3. [The Three Analytical Tiers](#3-the-three-analytical-tiers)
4. [Multi-Turn Conversational Tutor — Canonical Design](#4-multi-turn-conversational-tutor--canonical-design)
5. [The Session Lifecycle](#5-the-session-lifecycle)
   - 5.1 Session Start
   - 5.2 Session Progress
   - 5.3 Session End
6. [The LLM Gateway — Four Functions](#6-the-llm-gateway--four-functions)
7. [Prompt Architecture](#7-prompt-architecture)
   - 7.1 P1 — Vision: Extract + Generate
   - 7.2 P2 — Regeneration from Cached Text
   - 7.3 P3 — Answer Evaluation (legacy reference)
   - 7.4 P4 — Explain
   - 7.5 The Conversational Tutor System Prompt
8. [Answer Evaluation — Two-Stage System](#8-answer-evaluation--two-stage-system)
9. [The Hint Cascade & Pedagogy](#9-the-hint-cascade--pedagogy)
10. [Give-Up Handling — Progressive Scaffold](#10-give-up-handling--progressive-scaffold)
11. [The Praise System (Phase A1)](#11-the-praise-system-phase-a1)
12. [Runtime Signal (Phase A3)](#12-runtime-signal-phase-a3)
13. [Dependency Fading — Silent Retry (Phase A5)](#13-dependency-fading--silent-retry-phase-a5)
14. [The Strategy Library — Pedagogical Moves (Phase B)](#14-the-strategy-library--pedagogical-moves-phase-b)
15. [Cross-Session Memory (Phase C)](#15-cross-session-memory-phase-c)
16. [Misconception Detection & Confrontation (Phase C+)](#16-misconception-detection--confrontation-phase-c)
17. [Catching Fake Understanding (Phase D)](#17-catching-fake-understanding-phase-d)
18. [Concept Graph & Curiosity Layer (Phase E)](#18-concept-graph--curiosity-layer-phase-e)
19. [Transfer Test — The North Star Metric (Phase F)](#19-transfer-test--the-north-star-metric-phase-f)
20. [Voice Fixes for Daily Use (Phase G)](#20-voice-fixes-for-daily-use-phase-g)
21. [Long-Session Robustness (Phase H)](#21-long-session-robustness-phase-h)
22. [Voice/ASR Interaction Patterns](#22-voiceasr-interaction-patterns)
23. [The "Erklär mir das" System](#23-the-erklär-mir-das-system)
24. [Content Generation Pipeline](#24-content-generation-pipeline)
25. [FSRS Spaced Repetition Integration](#25-fsrs-spaced-repetition-integration)
26. [Test-Modus — Assessment Without Help](#26-test-modus--assessment-without-help)
27. [Practice Runs — Math Variant Generation](#27-practice-runs--math-variant-generation)
28. [Offline & Sync Interactions](#28-offline--sync-interactions)
29. [Tone, Personality & Voice Rules](#29-tone-personality--voice-rules)
30. [Safety, Grounding & Content Guardrails](#30-safety-grounding--content-guardrails)
31. [Credit Accounting & Cost Model](#31-credit-accounting--cost-model)
32. [Model Tier Split](#32-model-tier-split)
33. [Edge Cases in Agent Behavior](#33-edge-cases-in-agent-behavior)
34. [Roadmap Summary & Phase Dependencies](#34-roadmap-summary--phase-dependencies)
35. [Deliberate Anti-Patterns & Non-Goals](#35-deliberate-anti-patterns--non-goals)

---

## 1. Product Vision & Core Philosophy

### What the Agent Is

The interactive AI agent is the **learning companion itself** — not a quiz engine, not a flashcard app, not an answer key. It is a patient tutor sitting next to the learner. The design principle is: "Das Üben ist ein Gespräch" (Studying is a conversation).

The agent must:

- Accept **paraphrased answers** (not exact-match string comparison)
- Give **hints instead of marking "wrong"**
- **Revisit weak spots automatically** via spaced repetition
- **Never be harsh** — "Fast richtig — fehlt nur noch …" not "Falsch!"
- Scale its **tone** across the entire age range (9-year-old in Klasse 4 through adult)
- Work across **voice, text, multiple choice, and formula input**
- Work **offline** (with local evaluation) and **online** (with LLM-powered feedback)
- Never show the learner stress-inducing counts (due items, credit balance, missed days)

### Learner-Centric Architecture

The agent is **self-led, not app-driven**. The learner opens the app because they choose to. The home screen must never show pending-task counts, obligation numbers, or pressure messaging. The repetition engine (FSRS) picks items silently. The learner sees the first question — never the queue.

### The North Star

> Seven days after a concept is "mastered" by the system, the learner can solve a fresh problem from the same concept family — independently, with no scaffolding.

Everything else is instrumentation. The system optimizes for **transfer**, not streaks, session length, or correctness rates.

---

## 2. Architectural Laws (L1–L3)

These are immutable constraints on every change to the agent.

### L1 — The Wall

The diagnostic layer is allowed to _know_ everything about the learner. It is never allowed to _speak_ about the learner in first-person language.

| Banned                           | Allowed                                                                                                        |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| "Ich merke, du bist frustriert." | "Die Produktregel ist echt hinterhältig wenn man sie zum ersten Mal sieht — lass uns kurz was anderes machen." |
| "Du tendierst zu …"              | "Diese Art von Aufgabe ist tückisch."                                                                          |
| "Du bist heute unkonzentriert."  | "Wir waren heute lange dran — vielleicht probieren wir morgen nochmal weiter."                                 |
| "I notice you're tired."         | "This problem type is tricky."                                                                                 |

Both lines can come from the **same internal inference**. The first analyzes the learner. The second externalizes the difficulty onto the _material_. L1 is enforced by which module produces text, not by post-hoc filtering of LLM output.

### L2 — Three Tiers

| Tier           | Speed                            | What Lives Here                                                                                                                                                    | When It Runs                                      |
| -------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------- |
| **Runtime**    | sub-second                       | Warm conversational moves, intent detection, give-up handling, voice meta-commands, fatigue/ceiling/frustration signals. Only inferences that drive the NEXT turn. | Per turn, blocking the tutor reply.               |
| **Reflective** | minutes, async                   | Misconception classification, session episode summarization, mastery re-estimation, transfer test generation. Output: a state diff loaded by the _next_ session.   | After session ends, off the user's critical path. |
| **Structural** | weeks, manual + offline LLM jobs | Concept graphs, curriculum maps, pedagogical move library, prompt templates, misconception taxonomies.                                                             | Rarely. The "lesson planning" tier.               |

If a piece of analysis can wait until after the session, it **must** wait. The runtime is for what informs the next turn. Nothing else.

### L3 — Invisible Intelligence

Nothing the diagnostic layer infers should ever be visible as "the tutor analyzing the learner." The only visible outputs of inference are:

1. The next problem the learner sees.
2. The next pedagogical move the tutor performs.
3. The opening of the next session.

The learner never reads an analytical sentence about herself.

---

## 3. The Three Analytical Tiers

### Tier 1: Runtime (sub-second, per turn, blocking)

Derived purely from `conversation_turns` metadata. No LLM calls for signal computation. The signal shape:

```ts
type RuntimeSignal = {
  consecutive_wrong: number;
  consecutive_give_ups: number;
  consecutive_correct: number;
  scaffolded_correct_on_concept: Record<string, number>; // for dependency fading
  avg_response_latency_ms: number; // rolling 5
  latency_trend: 'faster' | 'slower' | 'stable';
  message_length_trend: 'growing' | 'shrinking' | 'stable';
  turns_in_session: number;
  minutes_in_session: number;
  fatigue: number; // 0..1, sigmoid of (turns, minutes)
  emotional_temperature: 'engaged' | 'pressured' | 'flat' | 'curious' | 'cratering';
  cognitive_load: 'low' | 'medium' | 'high';
  ceiling_signal: number; // 0..1, fraction of fast+correct on hard items
};
```

**Runtime overrides on FSRS picker:**

- `consecutive_wrong >= 3 AND fatigue > 0.5` → forbid harder items, pull from recently-mastered set
- `consecutive_correct >= 4 AND ceiling_signal > 0.6 AND latency_trend === 'faster'` → unlock harder items
- `fatigue > 0.8 AND emotional_temperature === 'cratering'` → insert `break_suggested` SSE event (UI: dismissible card "Magst du kurz Pause? Wir machen später weiter." once per session)

**Prompt injection (surfaces observations, never labels):**

```
— Recent rhythm —
Last 5 turns: incorrect, incorrect, skipped, skipped, ?
Response latency trend: slower
Time in session: 23 minutes
Hints given on THIS item: 2
```

Never `"The student is frustrated."` — that invites first-person empathy from the model and breaks L1.

### Tier 2: Reflective (minutes, async, after session)

- Runs after `PATCH /sessions/:id/finish`
- One LLM call per ended session → produces a `LearnerEpisode` row
- Fields: `one_sentence_arc`, `concepts_touched`, `high_points`, `low_points`, `hypothesized_misconceptions`, `open_questions`
- The `one_sentence_arc` describes the _work_, never the learner: "the session covered fraction addition with scaffolding" — never "the student struggled with fractions"
- Misconceptions with confidence > 0.6 → fresh rows in `recurring_misconceptions`
- Existing misconceptions with matching concept tag → `seen_count` bumped

### Tier 3: Structural (weeks, manual + offline LLM)

- One-shot LLM concept extraction per `subject_kind` (curated by hand after)
- `concept_nodes` + `concept_edges` tables
- Pedagogical move library: prompt templates, preconditions, forbidden-when rules
- Misconception taxonomies per concept

---

## 4. Multi-Turn Conversational Tutor — Canonical Design

Per ADR 0002, the **multi-turn conversational tutor is the canonical design**, superseding the single-shot evaluator (doc 06 §P3). The legacy `evaluateAnswer`/P3 path remains only as reference.

### Key Properties

1. **The model sees the whole session thread** — replays conversation history for contextual awareness
2. **The model replies in natural language** with a trailing machine-readable control line (not strict JSON `responseMimeType`)
3. **Grading is server-authoritative for the failure case** — a deterministic multilingual give-up detector forces `skipped` for any non-answer/help-request/empty input, regardless of what the model claims
4. **A reveal turn may never be `correct`** — the guard prevents the model from giving full marks when the answer was revealed
5. **An unparseable control line defaults to `incorrect`** (not `partially_correct`)
6. **`skipped` is a first-class verdict** in the shared DB enum

### The Give-Up Detector (`lib/give-up.ts`)

A deterministic, multilingual detector that short-circuits the LLM. Checks for:

- **Explicit non-answers:** "weiß nicht", "keine Ahnung", "I don't know", "je ne sais pas", "no sé", "non lo so"
- **Empty or whitespace-only input**
- **Help requests:** "hilf mir", "kannst du helfen", "Tipp", "tipp"
- **Trailing fillers with no substantive content:** 3+ fillers, no noun/verb detected
- **Trailing `skipped` on same item** (counts how many times give-up has been triggered on the same item in this session)

When the give-up detector fires, the LLM is **not called**. The server generates a stock encouragement response and credits consumed = 0.

### Conversation Turn Structure

Each turn in the conversation thread contains:

- `turn_index`: sequential position
- `speaker`: `'learner'` | `'tutor'`
- `content`: the natural language text
- `verdict` (tutor turns): `'correct'` | `'partially_correct'` | `'incorrect'` | `'skipped'`
- `move_id` (tutor turns): the pedagogical move name
- `hints_used_on_item`: running count
- `trailing_skips_on_item`: running count (for give-up escalation)
- `trailing_wrong_on_concept`: running count per concept tag
- `duration_ms`: response latency
- `credits_used`: credits consumed for this turn

---

## 5. The Session Lifecycle

### 5.1 Session Start

**Entry points:**

- `POST /sessions` with optional `subject_id`, `folder_id`, `test_mode`, `max_items` (default 20)
- FSRS picks items from local DB (online) or server (offline mode from local cache)
- Test-folder bias: if any folder within scope has a `scheduled_for` date, FSRS weights those items more heavily — silently, never communicated to the learner

**Session opener (Phase C):**
If the learner has a prior `learner_episodes` row matching the session's subject, the session starts with an **opener line**:

- Tone templates pre-defined (high/medium/low/curiosity)
- References the **material** ("Letztes Mal hat das mit den Brüchen super geklappt"), never the learner's emotional state
- `null` when no prior episode exists
- Templates are template-driven — the model renders the specific phrasing, the system provides the frame

**First-turn behavior:**

- The tutor's system prompt includes a compact "from last time" block for the first 5 turns
- If there are active `recurring_misconceptions` rows for this learner, the tutor's prompt includes the top-3 active misconceptions to listen for

### 5.2 Session Progress

1. Items presented sequentially
2. Header shows `"5 / 18"` progress — only progress within **this** session, no global counts
3. Per item: stimulus area → question text → answer area
4. The learner answers → local evaluator runs → either correct (advance) or unknown (LLM evaluates) → verdict + feedback + optional hint
5. Up to 2 hints, then reveal
6. "Erklär mir das" available on every item (except Test-Modus)
7. "Überspringen" available as secondary action (Phase A2+)
8. Session exit at any time with confirmation; state preserved

**Silent retry (Phase A5):**
When the same learner has answered correctly _with scaffolding_ on the same concept ≥ 2 times in the same session, the next item from that concept arrives silently — the tutor shows the question and waits. No preamble. The learner must answer independently. If they do within 30s → strong FSRS Good. If they wait/ask for help → FSRS Hard.

### 5.3 Session End

**Normal session end:**

- Items practiced
- Items mastered (correct with solid FSRS signal)
- Items still uncertain
- Streak update ("Heute geübt!" — no shaming if streak broken)
- Primary CTA: "Nochmal mit den schwierigen" → focused re-session on items wrong/partial this run

**Test-Modus end:**

- Score (e.g. "16/20")
- List of missed questions with correct answers revealed
- "Diese 4 nochmal üben" button (normal mode, not Test-Modus)

**Fatigue-driven natural end (Phase H):**
At `fatigue > 0.85`, the next "Weiter" tap is intercepted with "lass uns morgen weiter" message. The app actively pushes the learner to stop.

**Post-session reflective job (Phase C1):**

- `PATCH /sessions/:id/finish` triggers fire-and-forget reflective summary
- ~1 LLM call per ended session → `LearnerEpisode` row
- Misconceptions detected → `recurring_misconceptions` updated

---

## 6. The LLM Gateway — Four Functions

Located at `apps/api/lib/llm/`. The single seam between feature code and the LLM provider.

```ts
type Locale = 'de' | 'en' | 'fr' | 'es' | 'it';

interface LLMGateway {
  // Vision: extract text + generate items from 1-10 images
  visionExtractAndGenerate(input: {
    images: { mimeType: string; base64: string }[];
    locale: Locale;
    gradeLevel: number; // 1..13
    subject: string; // free text label
    subjectKind: SubjectKind;
    targetCount: number; // 1..25
  }): Promise<VisionResult>;

  // Regenerate: produce more items from cached text, no images
  regenerateFromText(input: {
    extractedMarkdown: string;
    locale: Locale;
    gradeLevel: number;
    subject: string;
    subjectKind: SubjectKind;
    targetCount: number;
    style?: 'simpler' | 'harder' | 'more-variety';
    excludeQuestions: string[];
  }): Promise<RegenerateResult>;

  // Evaluate: grade a single answer (legacy — superseded by conversational tutor)
  evaluateAnswer(input: {
    question: string;
    expectedAnswer: string;
    acceptableAnswers: string[];
    answerKind: AnswerKind;
    latexExpected?: string;
    latexAcceptable?: string[];
    units?: string;
    kidAnswer: string;
    parsedKidLatex?: string;
    locale: Locale;
    gradeLevel: number;
    priorHints: string[];
  }): Promise<EvaluationResult>;

  // Explain: produce 4-8 sentence explanation
  explain(input: {
    topic: string;
    context?: string;
    locale: Locale;
    gradeLevel: number;
    style: 'simpler' | 'step-by-step' | 'analogy';
  }): Promise<ExplainResult>;
}
```

Every method returns `creditCost: number` alongside its content. The gateway is the only place that knows token counts and translates them into credits.

**Hard caps:**

- `targetCount` max = 25 (regardless of caller request)
- Output tokens max = 2048 at SDK level
- No retries on success; retries only on transient network errors and `responseMimeType` mismatches
- No model escalation — one model per function

---

## 7. Prompt Architecture

All prompts exported from `apps/api/prompts/`, versioned by `PROMPT_VERSION`. They are concatenated from base + subject branches + output schema at call time.

### Provider Configuration

```
Model: gemini-2.5-flash-lite  (batch/extraction)
       gemini-2.5-flash       (learner-facing pedagogy — see §32)
Region: europe-west3
Paid tier: content not used for training
Safety: BLOCK_MEDIUM_AND_ABOVE (harassment, hate, dangerous)
        BLOCK_LOW_AND_ABOVE   (sexually explicit)
Generation: temperature 0.4, top-p 0.95, max output tokens 2048
Response MIME: application/json (for structured-JSON endpoints)
```

### 7.1 P1 — Vision: Extract + Generate

**Single Vertex call.** Input: 1-10 images + text context. Output: extracted markdown, items, optional diagrams, optional problem templates.

**SYSTEM persona:**

```
You are a careful, patient learning helper for school children. You read
images of learning material and produce study questions in the target
language. You never invent facts beyond what is shown in the images. You
never produce content inappropriate for children.
```

**Five tasks in one call:**

1. **EXTRACTION** — Clean Markdown transcription of all educational content. Preserve headings, lists, tables, formulas as LaTeX. Skip page numbers, student names, decorative marks.

2. **ITEM GENERATION** — `{targetCount}` study items in `{locale}` testing the material. Each item must have:
   - `question`: prompt shown to student
   - `expected_answer`: concise correct answer
   - `acceptable_answers`: 1-4 equivalent phrasings
   - `answer_kind`: one of 7 types
   - `difficulty`: 1-5 for grade level
   - `topic`: short label
   - `source_excerpt`: <200 char quote from material
   - `language`: detected language code

3. **DIAGRAMS** — Labeled figure detection. Each diagram: `page_index`, `bounding_box` (normalized 0..1), `labels[]` with `text`, `label_text_box`, `connector_box`, `target_xy`. Graphs additionally get `graph_meta`. Generate `diagram_label` items per diagram (max 10 labels per diagram, pedagogically most important).

4. **PROBLEM TEMPLATES** — Math/physics only. Up to 3 per material. Each: `template_text` with `{param}` placeholders, `params[]` with type/int/real/min/max/exclude, `constraints[]` (MathLite expressions), `solution_expression`, `answer_kind`, `units`, `topic`, `difficulty`, optional `stimulus_template`. Each must have at least one concrete seed item in `items`.

5. **SAFETY GUARD** — If images do not look educational: return `error: "not_educational"`.

**Subject-specific guidance injected per `subject_kind`:**

- **math:** Prefer formula for verbatim formulas, short/long for definitions, numeric for applications, fill_blank for short definitions. Generate templates aggressively.
- **physics:** Same formula handling. Always set units. Distinguish laws/formulas/applications.
- **chemistry:** Render equations as LaTeX with `\rightarrow`. Prefer MC for nomenclature, short for symbol recall, formula for equation completion, long for explanation. No templates.
- **biology:** Aggressive diagram detection. Prefer short for terms, long for explanations, MC for paired terms. No templates.
- **geography:** Maps are diagrams. Prefer MC for capitals/countries, short for facts. No templates.
- **history:** Short for dates/names/events, long for causes/effects, MC for distinguishing similar facts. Diagrams rare. No templates.
- **language_native / language_foreign:** Prefer fill_blank for grammar, short for vocab, long for translation. No templates.
- **religion_ethics, art_music, general, other:** Prefer short and long, MC where applicable.

**Answer kind mix defaults per subject (guidance, not enforced):**

| Subject          | formula | numeric | short    | long     | MC       | diagram_label | fill_blank |
| ---------------- | ------- | ------- | -------- | -------- | -------- | ------------- | ---------- |
| math             | 30%     | 30%     | 25%      | —        | 5%       | —             | 10%        |
| physics          | 25%     | 35%     | 20%      | 15%      | 5%       | —             | —          |
| chemistry        | 25%     | —       | 30%      | 15%      | 20%      | —             | 10%        |
| biology          | —       | —       | 30%      | 25%      | 15%      | 20%           | 10%        |
| geography        | —       | —       | 30%      | 15%      | 30%      | 25%           | —          |
| history          | —       | —       | 35%      | 30%      | 25%      | —             | 10%        |
| language_native  | —       | —       | 30%      | 25%      | 10%      | —             | 35%        |
| language_foreign | —       | —       | 30%      | 20%      | 10%      | —             | 40%        |
| religion_ethics  | —       | —       | 35%      | 40%      | 25%      | —             | —          |
| art_music        | —       | —       | 40%      | 30%      | 30%      | —             | —          |
| general          | —       | —       | 35%      | 30%      | 25%      | —             | 10%        |
| other            | —       | —       | balanced | balanced | balanced | —             | —          |

### 7.2 P2 — Regeneration from Cached Text

`POST /materials/:id/regenerate-items`. No images. Reuses `extracted_markdown`. Same output shape minus extracted_markdown and diagrams. Templates only if not already present.

**Style hints:**

- `simpler`: "Keep wording short. Prefer factual recall over application. Adjust to a student one grade below {gradeLevel}."
- `harder`: "Include 2-3 transfer or application questions. Use precise terminology where the source allows."
- `more-variety`: "Mix answer kinds: include at least one MC, one numeric (if applicable), and one long explanation."

### 7.3 P3 — Answer Evaluation (LEGACY — reference only)

Per ADR 0002, this single-shot evaluator is superseded by the multi-turn conversational tutor. Kept for reference.

Original design: strict JSON `{verdict, feedback, next_hint}`. Decided partial/incorrect. Up to 2 hints, then reveal. Kind-specific context injected per answer_kind.

### 7.4 P4 — Explain

`POST /explain`. Streams plain text. Hard cap: 400 output tokens.

```
SYSTEM:
You are a patient tutor for school children. You explain concepts in
plain language appropriate to the student's grade level. You never make
things up. If the topic is outside school content for that grade, say
so kindly. You stay close to the student's actual material.

USER:
Target language: {locale}
Student grade level: {gradeLevel}
Style: "simpler" | "step-by-step" | "analogy"
{context}
Topic or question: {topic}

Write an explanation of 4-8 short sentences. Use concrete examples.
Avoid jargon. Adapt to the requested style.
```

**Style instructions per option:**

- **simpler:** Simplest possible language; one short everyday example
- **step-by-step:** Numbered steps, each step one sentence
- **analogy:** Build explanation around one clear everyday analogy

**Grounding in material (ADR 0002):** `lib/material-context.ts` loads `materials.extracted_markdown` (clamped to ~4000 chars) and passes it to the P4 explain prompt with explicit "stay within this material, don't invent facts" instruction.

### 7.5 The Conversational Tutor System Prompt

Layout of `buildTutorSystemInstruction()` (assembled at call time):

```
[SYSTEM_TUTOR — unchanged base persona]
"You are a patient, encouraging tutor for school children..."

— Current question context —
[item.question, item.expected_answer, item.answer_kind, item.topic]
[material_context: ~4000 chars from extracted_markdown]
"Stay strictly within this material. Do not invent facts."

— Recent rhythm —
[from RuntimeSignal — observations only, never labels]
"Last 5 turns: incorrect, incorrect, skipped, skipped, ?"
"Response latency trend: slower"
"Time in session: 23 minutes"
"Hints given on THIS item: 2"

— Pedagogical guard — (conditional)
[from give-up mode + signal-driven constraints]
"Mode for this turn: gentle_scaffold"
"The learner has given up on this item twice. Scaffold one concrete entry point."

— Praise rubric — (only when verdict will be correct)
[from Praise discriminated union — see §11]
"Praise context: effort_after_hints, 2 hints used, topic: 'Brüche'"

— Mode for this turn —
"normal" | "gentle_scaffold" | "gentle_reveal"

— Active misconceptions — (when relevant)
[top-3 active recurring_misconceptions rows]
"Watch for: 'fraction_addition.common_denominator_missing'. If detected, use misconception_confrontation."
```

---

## 8. Answer Evaluation — Two-Stage System

### Stage 1: Local Evaluator (< 50ms, no network)

Runs on-device. Rules per `answer_kind`:

| Answer Kind       | Local Evaluation Rule                                                                                      | Result                                                                        |
| ----------------- | ---------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `multiple_choice` | Exact index match                                                                                          | `correct` or `incorrect` (no unknown)                                         |
| `numeric`         | Parse with `mathjs`, ±1% relative tolerance or ±0.01 absolute, unit normalization, unit alias recognition  | `correct` if match, `unknown` on parse failure or off                         |
| `formula`         | MathLite → AST, canonicalize both sides, compare to `latex_expected` and `latex_acceptable`                | `correct` if canonical match, `unknown` otherwise                             |
| `short`           | NFKC normalize, lowercase, strip punctuation, ß↔ss (de), token-overlap ≥ 0.9 AND length ≥ 70% of reference | `correct` if strong match, `unknown` otherwise                                |
| `long`            | Only checks obvious wrong: empty answer or < 25% of expected length → `incorrect`                          | Always `unknown` otherwise (delegates to LLM)                                 |
| `fill_blank`      | Per-blank normalize-and-compare                                                                            | All correct → `correct`, some correct → `unknown`, none correct → `incorrect` |
| `diagram_label`   | Same as `short`                                                                                            | Same outcomes                                                                 |

### Stage 2: LLM Evaluation (online)

Only when local evaluator returns `unknown`, or for precision grading in conversational tutor mode.

**Flow:**

1. The `kid_answer` (and optional `parsedKidLatex`) is sent to the conversational tutor
2. The model sees the full session thread + material context + runtime signal
3. The model replies in natural language with machine-readable control line
4. The give-up detector runs first — if triggered, LLM is not called, stock response generated
5. Grade is server-guarded: give-up → `skipped` (never `correct`), reveal → never `correct`, unparseable control → `incorrect`

**Kind-specific evaluation context:**

- **numeric:** "Tolerate ±1% relative error or ±0.01 absolute. Tolerate unit aliases."
- **formula:** "Treat mathematically equivalent forms as correct. The student may respond in plain text, spoken language, or LaTeX."
- **multiple_choice:** "Options were: {mcOptions}. Correct index: {mcCorrectIndex}."
- **fill_blank:** "Grade each blank independently and combine."
- **diagram_label:** "The student was asked what number X on a diagram refers to."

**Wrong-language answer handling:**
If learner answers in wrong language (question German, answer English), the LLM feedback should recognize concept equivalence: "Stimmt inhaltlich. Magst du es nochmal auf Deutsch versuchen?" Counted as correct for FSRS but second attempt in target language encouraged.

---

## 9. The Hint Cascade & Pedagogy

The core feedback design: never reveal the answer directly until the third wrong attempt.

```
Wrong/Partial answer
  └── Feedback card: "Fast richtig — fehlt nur noch …"
        └── Hint 1: Broad, directs attention to the gap
              └── Wrong again:
                    └── Hint 2: More specific, addresses the missing piece
                          └── Wrong again:
                                └── Answer revealed kindly
                                      "Die Antwort ist: …"
```

**Never:**

- "Falsch!" — always "Fast richtig" or "Nicht ganz"
- Directly reveal after first wrong attempt
- More than 2 hints before reveal

**Tone:** The persona is a patient older sibling / friendly tutor, not a teacher.

### Voice Tip-of-Tongue Hint Chain (Phase G)

For voice answers specifically, a finer-grained hint escalation:

1. **Stufe 1 — Category hint:** "Es gehört zu den Bestandteilen einer Zelle." (For vocab: "Es ist ein Verb." For numeric: "Es ist eine Zahl.")
2. **Stufe 2 — First letter/syllable:** "Es fängt mit **Mit-** an."
3. **Stufe 3 — Definition without word:** "Es ist der Teil der Zelle, der Energie erzeugt — das 'Kraftwerk'." (LLM crafts definition that intentionally omits target word and all synonyms)
4. **Stufe 4 — Reveal kindly:** "Das Wort ist **Mitochondrium**."

---

## 10. Give-Up Handling — Progressive Scaffold (Phase A2)

When the learner says "weiß nicht" (or equivalent), the system escalates progressively — never repeats the same canned response.

| Trailing Skips            | Server Move                                                                                                                                                                                                                            | Credits  |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| 0 (first give-up on item) | Stock encouragement (current behavior)                                                                                                                                                                                                 | 0        |
| 1 (second give-up)        | Tutor with `mode: 'gentle_scaffold'` — model gets material context + prior hints + directive: "pick one concrete entry point from the material, ask about THAT specifically. Do not ask another open question. Reduce cognitive load." | ≈ actual |
| 2 (third give-up)         | Tutor with `mode: 'gentle_reveal'` — model reveals gently grounded in material, then offers two choices (try once more / move on)                                                                                                      | ≈ actual |
| 3+ (fourth+)              | Item is **paused** for this session. Server pulls a different item. Subject of paused item becomes a recovery hook for reflective layer.                                                                                               | 0        |

The 4th give-up is a **pivot, not a continuation**. The most important pedagogical move in the system is the willingness to stop.

All four produce `verdict: 'skipped'` for the safety net. FSRS treats them differently downstream (dependency fading hooks in here).

---

## 11. The Praise System (Phase A1)

**Current anti-pattern:** `pickPraise(locale)` returns one of 5 strings forever. Same `"Genau!"` whether first try or after 3 hints.

**Target:** Delete `pickPraise`. Replace with `buildPraiseContext(ctx)` returning a discriminated union that the tutor's prompt renders.

```ts
type Praise =
  | { kind: 'first_try_easy'; difficulty: 1 | 2 }
  | { kind: 'first_try_hard'; difficulty: 3 | 4 | 5; topic: string | null }
  | { kind: 'effort_after_hints'; hints: number; topic: string | null }
  | { kind: 'self_corrected'; prior_attempt_summary: string }
  | { kind: 'reasoned_not_recalled'; topic: string | null };
```

**Classification rules (pure, no LLM):**

- `hints_used === 0 AND item.difficulty <= 2` → `first_try_easy`
- `hints_used === 0 AND item.difficulty >= 3` → `first_try_hard`
- `hints_used >= 1 AND verdict === 'correct'` → `effort_after_hints`
- prior wrong attempt by same learner on same item → `self_corrected`
- short answer + conceptual item kind → `reasoned_not_recalled`

**The tutor's SYSTEM_TUTOR prompt** is extended with a praise rubric block mapping each `Praise.kind` to a tone instruction. The model renders the praise; the system shapes it.

**Banned vocabulary:** `smart`, `klever`, `Genie`, `Talent`, `intelligent`, `gifted` — ability-praise words are never allowed. Effort/strategy/content praise only.

---

## 12. Runtime Signal (Phase A3)

Pure rule-based computation from `conversation_turns` metadata. No LLM calls.

**Signal components:**

- `consecutive_wrong`: streak of `incorrect` + `skipped` across items
- `consecutive_give_ups`: streak of explicit give-ups
- `consecutive_correct`: streak of correct first-try answers
- `scaffolded_correct_on_concept`: map of concept → times scaffolded correctly (for A5 fading)
- `avg_response_latency_ms`: rolling window of last 5
- `latency_trend`: `faster` | `slower` | `stable`
- `message_length_trend`: `growing` | `shrinking` | `stable`
- `turns_in_session`: raw count
- `minutes_in_session`: elapsed since session start
- `fatigue`: sigmoid of turns + minutes (0..1)
- `emotional_temperature`: derived from patterns — `engaged` (balanced), `pressured` (fast + wrong), `flat` (slow + sparse), `curious` (fast + correct + varied), `cratering` (slow + consecutive skips)
- `cognitive_load`: derived — `low` (fast corrects on easy), `medium` (mixed), `high` (slow + partials + skips on hard)
- `ceiling_signal`: fraction of fast+correct on items with difficulty ≥ 3 (0..1)

**How signal drives behavior:**

- `consecutive_wrong >= 3 AND fatigue > 0.5` → FSRS picker switches to `recovery_pivot_familiar` — pulls from recently mastered items, easier difficulty
- `consecutive_correct >= 4 AND ceiling_signal > 0.6 AND latency_trend === 'faster'` → FSRS unlocks harder items, `curiosity_hook` eligible
- `fatigue > 0.8 AND emotional_temperature === 'cratering'` → `break_suggested` SSE event
- `fatigue > 0.85` (Phase H) → intercept next "Weiter" tap with "lass uns morgen weiter"

**Signal is injected into the tutor prompt as observations — never labels:**

```
— Recent rhythm —
Last 5 turns: incorrect, incorrect, skipped, skipped, ?
Response latency trend: slower
Time in session: 23 minutes
Hints given on THIS item: 2
```

Never: `"The student is frustrated."` or `"The learner is struggling."`

---

## 13. Dependency Fading — Silent Retry (Phase A5)

The pedagogical move that breaks the "tutor as crutch" trap.

**The move:** When the same learner has answered correctly _with scaffolding_ on the same concept ≥ 2 times in the same session, the next item from that concept is presented **silently** — the tutor shows the question and waits. No preamble.

- Learner answers correctly within 30s → strong FSRS Good ("durable" signal)
- Learner waits / asks for help → tutor responds normally, but FSRS records Hard (not Good)

**Critical UX:** The silent retry must NOT feel like a test. The question just appears. Help is still available if the learner asks for it; the _cost_ is the FSRS signal, not the UX.

**Implementation:**

- `silent_present` flag on item delivery
- Mobile suppresses the tutor preamble bubble when item arrives with `silent: true`
- `scaffolded_correct_on_concept` tracked in runtime signal per concept

---

## 14. The Strategy Library — Pedagogical Moves (Phase B)

The tutor stops doing one thing. It chooses from a library of named pedagogical moves.

### Move Inventory

| Move ID                       | Name                                            | Description                                                                |
| ----------------------------- | ----------------------------------------------- | -------------------------------------------------------------------------- |
| `socratic_question`           | Ask a guiding question instead of giving a hint | "Was passiert mit dem Nenner wenn du …?"                                   |
| `direct_hint_broad`           | Broad direction without specifics               | "Denk an die Regel, die wir vorhin besprochen haben."                      |
| `direct_hint_specific`        | Concrete hint pointing to the missing piece     | "Schau dir die Zahl vor dem x an."                                         |
| `worked_example`              | Show a similar fully-worked example             | "So geht's mit anderen Werten: … Jetzt du mit deinen."                     |
| `analogy`                     | Explain via everyday comparison                 | "Es ist wie beim Kuchenbacken — wenn du die Menge verdoppelst, musst du …" |
| `predict_then_check`          | Ask learner to predict before computing         | "Was denkst du, wird die Steigung größer oder kleiner als 1? Warum?"       |
| `wrong_example_probe`         | Present a wrong answer, ask if it's correct     | "Wenn jemand 2/5 gesagt hätte, wäre das richtig?"                          |
| `self_explanation_prompt`     | Ask learner to explain their reasoning          | "Kannst du sagen, wie du darauf gekommen bist?"                            |
| `recovery_pivot_easier`       | Switch to easier items from same subject        | —                                                                          |
| `recovery_pivot_familiar`     | Switch to previously-mastered items             | —                                                                          |
| `silent_retry`                | Present question without scaffolding (A5)       | —                                                                          |
| `gentle_reveal`               | Reveal answer kindly after hints exhausted      | —                                                                          |
| `curiosity_hook`              | Surface adjacent interesting fact + choice (E1) | —                                                                          |
| `misconception_confrontation` | Directly address a known recurring error (C+)   | —                                                                          |
| `confidence_probe`            | Check if correct answer was understood (D1)     | —                                                                          |
| `transfer_challenge`          | Fresh item with different surface form (F)      | —                                                                          |

### Move Selector

A pure-function selector picks one move per turn from the set whose preconditions hold:

- Each move has `preconditions` (what must be true to use it)
- Each move has `forbidden_when` (when must NOT use it, e.g. "not in Test-Modus", "not after reveal")
- Each move has a `prompt_fragment` injected into the tutor prompt
- Each move has an `expected_cost` range
- Each move has a `cooldown` (e.g. `wrong_example_probe` max once per session)
- Each move has a `variety_penalty` (recently-used moves deprioritized)

Decisions logged to `strategy_decisions` table for later tuning.

---

## 15. Cross-Session Memory (Phase C)

### Session Episode Summary

After `PATCH /sessions/:id/finish`, a fire-and-forget reflective job runs:

1. One LLM call processes the full `conversation_turns` thread of the ended session
2. Produces a `LearnerEpisode` row with:
   - `one_sentence_arc`: "the session covered fraction addition with scaffolding, peaked around the common-denominator breakthrough"
   - `concepts_touched`: array of concept tags
   - `high_points`: moments where the learner showed independence
   - `low_points`: concepts where scaffolding was consistently needed
   - `hypothesized_misconceptions`: patterns suggesting specific errors (with confidence score per misconception)
   - `open_questions`: concepts to probe next time
3. `one_sentence_arc` describes the **work**, never the learner — L1 constraint
4. New misconceptions (confidence > 0.6) → fresh `recurring_misconceptions` rows
5. Existing misconceptions with matching concept tag → `seen_count` bumped

### Session Opener

When a new session starts and the learner has a prior `learner_episodes` row:

1. Template-driven opener references the **material**, never the learner's state
2. Tone templates: `high` (previous session went well), `medium` (mixed), `low` (struggled, framing is encouraging), `curiosity` (if curiosity_hook pending from last session)
3. Example: "Letztes Mal hat das mit den Brüchen super geklappt — sollen wir da weitermachen?"
4. `null` when no prior episode exists → standard first question presentation

### First-5-Turns Context

The tutor's system prompt for the first 5 turns of a new session includes a compact "from last time" block:

```
— From your last session (2 days ago) —
The session covered: fraction addition
Key moment: common-denominator method clicked after a worked example
Open: subtraction with unlike denominators wasn't reached
```

---

## 16. Misconception Detection & Confrontation (Phase C+)

### Detection (Reflective Tier, post-session)

The reflective LLM call analyzes conversation turns for error patterns:

- Same wrong answer pattern across multiple items on same concept
- Specific error signatures (e.g. adding numerators AND denominators directly in fraction addition)
- Multiple hints needed on same concept
- Pattern persists across sessions

### `recurring_misconceptions` Table

Each row:

- `learner_id`
- `concept_tag`: e.g. `'fraction_addition.common_denominator_missing'`
- `description`: "adds numerators and denominators directly" — describes the ERROR, not the learner
- `seen_count`: how many sessions this has appeared
- `first_seen_at`
- `last_addressed_at`: when the tutor last explicitly addressed it
- `resolved_at`: null until cold-corrected without scaffolding

### Confrontation Move (Runtime)

When the active learner has an unresolved `recurring_misconceptions` row whose `concept_tag` matches the current item's topic, and the learner answers wrong:

1. The move `misconception_confrontation` fires
2. The tutor reply uses teacher-vernacular: "Das ist die Stelle, an der wir schon mal waren — denk dran: …" (or locale equivalent)
3. Names the WORK pattern, never the learner: "Man tendiert dazu, die Nenner einfach zu addieren" is BANNED. "Hier passiert oft, dass man die Nenner direkt addiert" is correct
4. Asks ONE concrete question that distinguishes the misconception from the correct rule
5. `last_addressed_at` bumped

### Resolution

When the learner cold-corrects the same topic on a fresh item (no hints, no prior wrong), the misconception is resolved: `resolved_at` set to non-null.

---

## 17. Catching Fake Understanding (Phase D)

### Confidence Probe (`confidence_probe` move)

**Trigger:** Short correct first-try answer to conceptual item + ceiling_signal moderate + no hints used

**The probe:**

- "Kannst du in einem Satz sagen, WARUM das so ist?" (or locale equivalent)
- Framed as curiosity, NOT as a test: "Lass mich prüfen, ob du es wirklich verstanden hast" is BANNED
- Probe verdict is separate from item verdict

**Probe scoring (written to `probe_assessments`):**

- **Substantive reasoning** (actual explanation of underlying principle) → `quality = 'substantive'` → FSRS Good
- **Rephrasing** (restates the answer differently without reasoning) → `quality = 'rephrased'` → FSRS Hard + `pattern_match_signal++`
- **Give-up** (can't explain why) → `quality = 'gave_up'` → FSRS Again + concept escalated to conceptual reframing next time

When `pattern_match_signal` crosses threshold on a concept, the system treats that concept differently — it may `wrong_example_probe` more aggressively or re-enter the concept into active FSRS pool at lower stability.

### Wrong-Example Probe (`wrong_example_probe` move)

**Trigger:** 2+ streak of first-try corrects on conceptual items, after at least one `confidence_probe` in the session

**The probe:**

- "Wenn jemand X gesagt hätte, wäre das richtig?" (where X is a plausible wrong answer for the concept)
- Pattern-matchers (learners who memorized but don't understand) typically fail this

**Constraints:**

- Fires AT MOST ONCE per session
- After `wrong_example_probe`, next correct returns to `confidence_probe` or `continue_natural`

### Probe Assessment Persistence

Each probe generates a `probe_assessments` row:

- `probe_move`: `'confidence_probe'` | `'wrong_example_probe'`
- `quality`: `'substantive'` | `'rephrased'` | `'gave_up'`
- `response_excerpt`: learner's verbatim response
- `cost_usd_micros`: 0 for give-up (short-circuited, no LLM call)

---

## 18. Concept Graph & Curiosity Layer (Phase E)

### Concept Extraction (Structural Tier)

- One-shot LLM concept extraction per `subject_kind`
- Results curated by hand — the LLM proposes, a human approves
- `concept_nodes` table: each concept has `id`, `name`, `description`, `subject_kind`, `grade_range`
- `concept_edges` table: directed edges `prerequisite → dependent` with `strength` (0..1)
- Each item linked to a concept node via `items.concept_node_id`

### Curiosity Hook (`curiosity_hook` move)

**Trigger:** High ceiling signal (3+ correct first-try on hard items with short latency) + concept mastery deep + curiosity_hook variety penalty not exceeded

**The hook:**

1. ONE "Wusstest du, dass …?" fact connected to the current topic (sourced from concept graph metadata, not LLM on the fly)
2. ONE choice question: "Magst du da kurz reinschauen, oder weiter mit dem Stoff?"
3. If learner engages → one-turn exploration (next item from adjacent concept)
4. If learner declines → continue normal flow
5. Does NOT fire twice in the same session

### Prerequisite-Aware FSRS Pickup

If a concept's prerequisites are shaky (based on item_states and mastery_score), the FSRS picker inserts a quick retrieval-practice item from the prerequisite concept first, before presenting the target item.

---

## 19. Transfer Test — The North Star Metric (Phase F)

### Design

- **Weekly** Sunday-night transfer session for each active learner
- **Fresh items generated** per concept currently marked "mastered" (high stability, high mastery_score)
- Items have **different surface form** — never reused from prior sessions
- **No hints, no staircase, no scaffolding** — this is a measurement, not teaching
- **Pass/fail** per item

### Feedback

One visible line after the session:

- "Du hast 7 von 10 unabhängig gelöst." (German)
- Or: "Du konntest 7 von 10 Fragen ganz allein beantworten."

No breakdown, no comparison to prior weeks, no trend line. Just the fact.

### Consequences

- **Transfer pass** → concept promoted to `durable`, exits active FSRS rotation (still appears in periodic review at longer intervals)
- **Transfer fail** → concept de-mastered, re-enters FSRS pool with adjusted difficulty, prerequisite chain re-examined

---

## 20. Voice Fixes for Daily Use (Phase G)

### Voice Intent Classifier

A rule-based (first) + tiny-model fallback classifier that runs on the transcript before evaluation. Handles:

| Intent                      | Example Triggers (de)                      | Action                                          |
| --------------------------- | ------------------------------------------ | ----------------------------------------------- |
| `retry_request`             | "nochmal", "neu", "warte"                  | Cancel transcript, re-enter listening           |
| `switch_to_typing`          | "tippen", "schreiben", "eintippen"         | Switch to keyboard, transcript prefilled        |
| `pause`                     | "pause", "warte kurz"                      | Extend silence threshold                        |
| `repeat_question`           | "nochmal die Frage", "wiederholen"         | Re-read question via TTS                        |
| `confused_meta`             | "verstehe die Frage nicht", "was bedeutet" | Offer "Erklär mir das" immediately              |
| `swear` / `playful_garbage` | Various                                    | Gentle redirect on 2 strikes, session ends on 3 |
| `give_up`                   | "weiß nicht", "keine Ahnung"               | Enter progressive give-up (Phase A2)            |

Zero Vertex cost. Pure rule-based with small fallback model for ambiguous cases.

### STT Confidence Handling

```
ASR returns transcript:
  ├── confidence > 0.7 → evaluate normally
  ├── confidence 0.5–0.7 → show greyed transcript with "Hast du das gemeint?"
  │      ├── confirm → evaluate
  │      └── redo → mic re-opens
  └── confidence < 0.5 OR empty → "Konnte dich nicht verstehen — nochmal?"
```

- 2 consecutive failed mic attempts on the same item → auto-switch to keyboard: "Lieber tippen heute?"

### Adversarial/Playful Detector

- Detects: nonsense strings, repeated words, obvious non-answers, swearing
- Strike 1: gentle redirect ("Das klang eher nach Spielen als nach Mathe — versuch's nochmal?")
- Strike 2: second redirect, same tone
- Strike 3: "Lass uns später weitermachen. Bis morgen!" — session ends, no credit burn

### Tip-of-Tongue Detection (Client-Side)

Heuristics that flag a transcript as a help-request rather than an answer. Runs before sending to evaluator:

- **Filler density:** ≥ 3 fillers per 10 words (de: `äh`, `ähm`, `hmm`, `also`, `halt`, `naja`; en: `uh`, `um`, `like`; fr: `euh`, `ben`, `quoi`; es: `eh`, `bueno`, `o sea`; it: `eh`, `cioè`, `tipo`)
- **Help-phrase regex:** de: `/wie heißt|weiß ich nicht|hilf|kannst du|das ding|das wort|tipp|hinweis/i`
- **Stuck-prefix:** Same 2-4 char prefix repeated ≥ 2 times (e.g. "Mito… Mito… Mit…")
- **Self-referential negation:** `"nicht mehr"`, `"vergessen"`, `"weiß nicht"`, `"ich hab's vergessen"`

If any fire, **do not evaluate** — enter help mode (see §9 voice hint chain).

### Mid-Sentence Self-Correction

- Detect: `"nein"`, `"halt"`, `"warte"`, `"stopp"`, `"neu"`, `"Moment"` followed by new content
- Visual: old text greys out with strikethrough briefly (300ms), then disappears
- Evaluation: only post-correction portion sent
- Edge: if "nein" appears mid-content but no new content follows, treat as cancel → return to mic prompt

### Long Pause Without Audio

- After 8s of silence (no transcript started), mic auto-closes
- UI: "Habe nichts gehört. Magst du es nochmal versuchen oder lieber tippen?"

### Voice + Long Answer Mode

For `long` answer kind, VAD silence threshold extended (3s instead of 1.5s). After 3s pause: soft cue "Noch was?" + additional 5s window.

### Voice + Math Input

Spoken math parsed through MathLite normalizer:

- `"zwei x hoch drei"` → `"2x^3"`
- `"einundzwanzig Komma fünf"` → `"21.5"`
- Spoken-formula vocabulary enumerated per locale

### Voice + Multiple Choice

Spoken: `"die zweite"`, `"B"`, or the answer text itself. Match priority: explicit option label > option index > content match.

---

## 21. Long-Session Robustness (Phase H)

### Rolling Within-Session Digest

Every 5 items, the conversation history is compacted:

- A 2-sentence summary replaces those 5 turns in the bounded history sent to the model
- Token cost stays sane on 60-turn sessions (bounded context window)
- Summary preserves: concepts touched, verdict pattern, key struggle points — enough for the model to maintain conversational coherence

### Re-Entry from Digest After Pause

If the learner resumes a session after significant pause (> 5 min inactivity):

- Show "Möchtest du fortsetzen?" prompt (not auto-resume)
- The digest serves as the re-entry context for the model

### Fatigue-Driven Natural Session End

At `fatigue > 0.85`, the next "Weiter" tap is intercepted:

- "Das war eine tolle Runde heute — lass uns morgen weitermachen!"
- The app actively encourages the learner to stop
- Session closes naturally; result screen shows summary so far

---

## 22. Voice/ASR Interaction Patterns

### Complete Voice Flow

```
Learner taps mic icon
  └── VoiceButton enters listening state
        ├── Pulsing ring animation (static "Hört zu" label if Reduce Motion)
        ├── Live transcript field becomes active
        ├── Learner speaks
        │     ├── Fluent answer → 1500ms silence → VAD auto-stop
        │     ├── Mid-sentence self-correction → auto-detect → strip old
        │     ├── Tip-of-tongue → auto-detect → help mode
        │     ├── "Warte, neu" → auto-detect → restart
        │     ├── "Ich weiß es nicht" → auto-detect → offer tip/skip
        │     ├── 8s silence without transcript → auto-close
        │     └── Adversarial/playful → gentle redirect
        └── Transcript captured
              ├── Submit → local evaluator
              ├── "Nochmal sprechen" → discard, re-open mic
              └── "Tippen" → switch to keyboard, transcript prefilled
```

### Voice Redo Affordance

After mic auto-stops, before submission:

- "Nochmal sprechen" button (discard, re-open mic)
- "Tippen" button (switch to keyboard, transcript prefilled)
- Submit button (evaluate)

Redo affordance must be visible, not hidden in a menu.

### Re-Prompt vs. Guess Rule

- Transcript has high confidence but local evaluator says "unknown" → go to LLM. Don't re-prompt. User said what they said.
- Transcript has low confidence → re-prompt. Don't make user defend a transcript the app isn't sure it captured.

### Voice Toggle Persistence

Per session, not per item. Profile's `preferredAnswerMode` is the default starting state.

---

## 23. The "Erklär mir das" System

Available on every item (except Test-Modus). The learner taps "Erklär mir das" and a modal opens.

### Two-Tab/Card Design (recommended)

**Tab 1: "Was bedeutet die Frage?"**

- LLM gets prompt P4 with special style `decompose-question`
- Breaks down what the question is asking without giving the answer
- Example: "Du sollst die Steigung herausfinden. Die Steigung ist die Zahl vor dem x. Schau dir y = 3x − 4 an."

**Tab 2: "Erklär das Konzept"**

- Standard P4 with three styles: simpler / step-by-step / analogy

### Style Options

| Style                              | Description                                      | Output                           |
| ---------------------------------- | ------------------------------------------------ | -------------------------------- |
| Einfacher (simpler)                | Simplest possible language, one everyday example | 4-5 sentences                    |
| Schritt für Schritt (step-by-step) | Numbered steps, each one sentence                | 4-8 numbered sentences           |
| Analogie (analogy)                 | One clear everyday analogy                       | 4-5 sentences around one analogy |

### Grounding

Per ADR 0002, the explain call is grounded in the real worksheet: `lib/material-context.ts` loads `materials.extracted_markdown` (clamped to ~4000 chars) and passes it to the P4 prompt with explicit "stay within this material, don't invent facts" instruction.

### UX

- Streams text token-by-token via SSE
- Modal preserves session state — when closed, the original question remains where it was
- Closes with X button
- Hard cap: 400 output tokens

---

## 24. Content Generation Pipeline

### From Photo to Items (Vision Pipeline)

1. Mobile captures N photos with live quality scoring (resolution ≥ 800×600, blur Laplacian ≥ 60, brightness 50–220, tilt ≤ 25°)
2. Photos resized to 1024px longest side, JPEG quality 80
3. `POST /materials/upload-url` reserves signed PUT URLs (10-min expiry)
4. Mobile uploads each photo directly to Supabase Storage
5. `POST /materials` triggers:
   a. Atomic credit debit by estimate
   b. Insert material with `extraction_status='pending'`
   c. Call `llm.visionExtractAndGenerate` (single Vertex call)
   d. Post-processing: validate items, validate problem templates (5-sample feasibility ≥ 60%), run diagram image processor
   e. Persist items, templates, study_assets
   f. Settle credit to actual cost
   g. Schedule photo deletion at T+7 days

### Progress Phases (SSE stream)

```
event: phase → {"phase":"reading_images"}      "Bilder werden gelesen …"
event: phase → {"phase":"generating_items"}     "Fragen werden erstellt …"
event: phase → {"phase":"processing_diagrams"}  "Letzter Schliff …"
event: done  → {material_id, items, templates, study_assets, credits_used}
```

### Post-Processing Rules

- Items with `question.length < 5` OR `expected_answer.length < 1` → rejected
- Items with `answer_kind = 'formula'` but empty `latex_expected` → rejected
- Items with non-`none` `stimulus_kind` but `stimulus_data` fails validation → downgraded to `none`
- Items with `diagram_label` but referenced `study_asset_id` failed processing → dropped
- Problem templates: parse all params/constraints/solution_expression with MathLite parser, sample 5 random combos
  - If passes/5 < 0.6 → drop template (log as `template_validation_dropped`)
  - Validate solution with one passing sample → must return finite, well-typed value
- Items with `problem_template_ref` → index reference replaced with validated template's DB id after insert
- Diagrams: mask-safety fallback — if label area > 8% of crop, skip masking but still place markers; < 2 valid labels after processing → items reference as study_asset instead of diagram_label

### Regeneration Without Re-Upload

`POST /materials/:id/regenerate-items` reuses cached `extracted_markdown`. No images. Lower credit cost.

### Failure Modes

| Condition                                   | Action                               | Credits          |
| ------------------------------------------- | ------------------------------------ | ---------------- |
| Valid JSON, items pass post-processing      | Persist, settle to actual            | charged actual   |
| Invalid JSON twice                          | `extraction_failed`, refund estimate | refunded         |
| Safety blocks all candidates                | `extraction_failed`, refund estimate | refunded         |
| Network/5xx after 2 retries (1s/3s backoff) | `extraction_failed`, refund estimate | refunded         |
| `error: "not_educational"`                  | `not_educational`, refund estimate   | refunded         |
| Some items rejected but ≥ 3 valid remain    | Persist valid items only             | settle to actual |
| < 3 valid items after post-processing       | `extraction_failed`, refund estimate | refunded         |

---

## 25. FSRS Spaced Repetition Integration

### What FSRS Does

FSRS (Free Spaced Repetition Scheduler) models when a learner is likely to have forgotten an item and prioritizes those items. It runs silently — the learner never sees the queue, never sees due counts, never sees scheduling.

### How It Integrates with the Agent

- **Session start:** Server picks due items using FSRS state, capped at 20 by default. Test-folder bias applied silently.
- **Per attempt:** The agent's verdict → FSRS rating mapping:
  - `correct` on first try, no hints → Good (4)
  - `correct` after 1 hint → Hard (3)
  - `correct` after 2 hints → Hard (2)
  - `correct` after revealing answer → Again (1)
  - `partially_correct` → Hard (2)
  - `incorrect` → Again (1)
  - `skipped` → Again (1) — returns sooner
- **Silent retry correct within 30s** → Good (4) with "durable" flag
- **Silent retry asked for help** → Hard (3)
- **Server is authoritative on FSRS state** — mobile discards local state and re-pulls
- **FSRS runs on every online attempt** (per ADR 0002 fix — previously only offline batch did)

### Item States Table

Each `item_state` row (one per item per learner):

- `stability`: how well the item is retained (float)
- `difficulty`: FSRS difficulty estimate (float)
- `elapsed_days`: days since last review
- `scheduled_days`: interval until next review
- `reps`: total review count
- `lapses`: times forgotten
- `state`: 0=New, 1=Learning, 2=Review, 3=Relearning
- `mastery_score`: derived 0-100
- `due`: next scheduled review timestamp

---

## 26. Test-Modus — Assessment Without Help

### Mode Properties

- No hints
- No "Erklär mir das"
- No per-item feedback during session
- Progress bar only (no verdict display)
- Result only at end

### Entry Point

Recommended: small "Test-Modus üben" link on folder screen, below the main Üben button, only visible when the folder has a `scheduled_for` within the next 7 days and ≥ 10 items available.

### Length Picker

"10 / 20 / Alle" — learner picks how many items.

### Result Screen (different from normal)

- Score: "16/20"
- List of missed questions with correct answers revealed
- "Diese 4 nochmal üben" button → normal session (not Test-Modus) on only the missed items

### Offline Support

Fully works offline. Local evaluator handles all grading.

---

## 27. Practice Runs — Math Variant Generation

### What It Is

For math/physics items with a linked `problem_template`, the learner can generate fresh variants of the same problem type. Zero LLM cost, zero credits, fully client-side.

### Entry Point

After answering a template-linked item, result screen shows: "10 ähnliche Aufgaben üben →"

### Variant Generation Algorithm

```
function generateVariant(template, alreadyShown):
  for attempt in 1..200:
    values = {}
    for p in template.params:
      values[p.name] = sampleFromRange(p)
    if anyConstraintFails(template.constraints, values): continue
    key = serializeValues(values)
    if alreadyShown.has(key): continue
    text = substituteParams(template.template_text, values)
    solution = evaluateMathLite(template.solution_expression, values)
    stimulus = template.stimulus_template
      ? buildStimulus(template.stimulus_template, values)
      : null
    return { text, solution, stimulus, values_key: key }
  throw new Error('cannot_generate_variant')
```

If 200 attempts fail: UI shows "Aufgabe variiert nicht weit genug — probier etwas anderes." Template disabled for this run.

Three consecutive variant failures across sessions → template flagged internally, stops being offered until server validates again.

### Adaptive Difficulty

After each practice run:

- Success rate ≥ 90% AND avg time < 12s per problem → `difficulty_adjustment += 1` (capped +2)
- Success rate < 50% → `difficulty_adjustment -= 1` (capped -2)
- Otherwise no change

Adjustment biases parameter sampling: higher difficulty → upper half of each param's range; lower difficulty → narrower band around midpoint.

### Stimulus Templates

Templates can include parameterized stimuli (graphs, SVGs) that change per variant. Placeholders like `{m}` and `{b}` in the stimulus data are substituted with sampled values.

---

## 28. Offline & Sync Interactions

### Offline Session Flow

1. Mobile detects no network (HEAD probe, not OS state)
2. FSRS picks items from local SQLite mirror
3. Voice/text answering works fully (on-device ASR)
4. Local evaluator handles all grading
5. Items evaluator can't decide (`long`, parse failures) → `verdict='pending'` → "wartet auf Internet"
6. All writes enqueue in `outbox_local` table
7. Result screen shows three buckets: "Sicher", "Wartet noch auf Bewertung", "Noch unsicher"

### Agent Behavior During Offline

- "Mehr Fragen" → disabled: "Geht nur online"
- "Erklär mir das" → disabled: "Geht nur online"
- Photo capture → allowed, deferred upload
- Practice runs → fully work (mathjs on-device)
- Test-Modus → fully works

### Reconnection Sync

On reconnect (probe succeeds), sync engine drains outbox in order:

1. `attempts_batch` → `POST /attempts/batch`
2. `pending_attempt_eval` → `POST /attempts` per item
3. `practice_run_summary` → `PATCH /templates/:id/practice-run/:run_id`
4. Other writes → subject/folder/material/item endpoints

**Server is authoritative.** Conflict resolution:

- Attempts: append-only by `client_id` — no conflict possible
- Item states (FSRS): server-recomputed from replayed attempts → mobile discards local, re-pulls
- Subjects/folders/materials/items: LWW by `updated_at`

---

## 29. Tone, Personality & Voice Rules

### Personality

The voice persona is a **patient older sibling / friendly tutor**, not a teacher. Same personality across the entire age range — tone scales, but the character stays consistent.

### Age-Based Tone Scaling

| Profile Age                       | Tone                             | Density                               | Vocabulary                        |
| --------------------------------- | -------------------------------- | ------------------------------------- | --------------------------------- |
| 9-11 (Klasse 4-5)                 | Warmer, slower, more reassurance | Less per screen, larger touch targets | Simpler words, more encouragement |
| 12-14 (Klasse 6-8)                | Moderate warmth                  | Standard density                      | Grade-appropriate                 |
| 15-17 (Klasse 9-12)               | More direct                      | Standard density                      | Precise terminology               |
| 18+ (Studium, Erwachsenenbildung) | Direct, dense                    | More per screen                       | Full technical vocabulary         |

The personality NEVER changes — only the density and warmth level.

### Hard Tone Rules

- **Never harsh:** "Fast richtig — fehlt nur noch …" not "Falsch!"
- **Never ability-praise:** No "schlau", "begabt", "Genie", "Naturtalent", "smart", "clever", "Talent", "gifted"
- **Effort praise only:** Credit the work, not the person
- **Never shaming:** No "you missed X days", no "you haven't opened this in 3 weeks"
- **Never pressure:** No countdown timers, no "Hurry!", no "you'll lose your streak"
- **Du/Sie:** Profile-dependent — `du` for learners up to ~16, `Sie` for adults (configurable)
- **German default:** All copy written in German first; English/French/Spanish/Italian translated
- **No emojis in core UI** — a small set of celebration animations (confetti, check) at session-end only
- **All copy short:** Questions one line if possible, feedback one or two sentences

### Banned Vocabulary (L1 Enforcement)

The following patterns must NEVER appear in any tutor reply:

| Banned Pattern                                       | Reason                                |
| ---------------------------------------------------- | ------------------------------------- |
| "ich merke, du …"                                    | First-person analytical about learner |
| "du bist …" (with emotional label)                   | Labels the learner                    |
| "du tendierst zu …"                                  | Analyzes learner's pattern            |
| "I notice you …"                                     | Same, English                         |
| "du scheinst …"                                      | Speculation about learner state       |
| "du wirkst …"                                        | Same                                  |
| Any ability-praise word (schlau, smart, Genie, etc.) | Ability praise                        |
| "heute warst du …" (with judgment)                   | Retrospective labeling                |

**Allowed patterns:**
| Allowed Pattern | Why |
|----------------|-----|
| "Die Aufgabe ist gemein" | Externalizes difficulty onto material |
| "Diese Art von Aufgabe ist tückisch" | Same |
| "Bei diesem Thema passiert es schnell, dass man …" | Describes the work pattern, not the learner |
| "Das hat super geklappt — vor allem nach dem dritten Anlauf" | Effort praise |
| "Lass uns morgen weitermachen" | Fatigue-aware without labeling |

---

## 30. Safety, Grounding & Content Guardrails

### Provider-Level Safety

- Vertex AI safety filters: `BLOCK_MEDIUM_AND_ABOVE` (harassment, hate speech, dangerous content), `BLOCK_LOW_AND_ABOVE` (sexually explicit)
- Paid tier: content not used for training
- Region: `europe-west3` (EU data residency)
- Vertex logs auto-purged at 30 days

### Content Guardrails (Prompt-Level)

**The SYSTEM persona for all prompts includes:**

```
You never invent facts beyond what is shown in the images.
You never produce content inappropriate for children.
```

**The vision prompt includes a safety guard:**
If images don't look educational (chat screenshots, photos of people unrelated to textbook, advertisements, personal documents), return `error: "not_educational"`. Credit refunded, no material created.

**Grounding in material (ADR 0002):**

- Tutor system prompt includes `extracted_markdown` from the item's material (clamped to ~4000 chars)
- Explicit instruction: "stay within this material, don't invent facts"
- P4 explain prompt same grounding
- This replaced the old ≤200-char `source_excerpt` which produced shallow, generic hints

### The Give-Up Safety Net

The deterministic give-up detector is the ultimate safety guard:

- Cannot be overridden by model's output
- `skipped` return signal forces correct state
- Prevents the model from "hallucinating" a correct verdict for a non-answer
- Prevents credit waste on speaking empty noise to the model

---

## 31. Credit Accounting & Cost Model

### Credit Unit

**1 credit = $0.0001 USD** of underlying LLM spend. 10,000 credits = $1.00 provider cost.

### Estimated Costs Per Action

| Action                                          | Estimate (credits) | Typical Actual | Cap |
| ----------------------------------------------- | ------------------ | -------------- | --- |
| Vision extraction (2 photos, 10 items)          | 20                 | 15-25          | 60  |
| Regenerate (10 items from cached text)          | 8                  | 6-12           | 25  |
| Evaluate answer (one conversation turn)         | 1                  | 0.5-2          | 5   |
| Explain (one call)                              | 3                  | 2-5            | 8   |
| Local-evaluated attempt                         | 0                  | 0              | 0   |
| Practice-run variant                            | 0                  | 0              | 0   |
| Stock give-up response (give-up detector fires) | 0                  | 0              | 0   |

### Atomic Debit Pattern

1. **Pre-debit** the estimate from `credit_buckets.current_balance`. If insufficient → 402.
2. **Make the LLM call.**
3. **Settle** to actual cost. Refund or additional debit as needed.
4. **Record** `credit_events` row.
5. On **failure**: refund full estimate.

All wrapped in a transaction with `FOR UPDATE` on the bucket row.

### Monthly Allotments

| Tier           | Credits/Month | Rollover Cap |
| -------------- | ------------- | ------------ |
| Trial (14-day) | 1,500         | n/a          |
| Standard       | 4,000         | 12,000       |
| Plus           | 10,000        | 30,000       |

### Model Tier Split (ADR 0002)

| Model                                        | Used For                                       | Rationale                                    |
| -------------------------------------------- | ---------------------------------------------- | -------------------------------------------- |
| `gemini-2.5-flash-lite` (`VERTEX_MODEL_ID`)  | Vision extraction, regeneration, transcription | High-volume, batch, cheap                    |
| `gemini-2.5-flash` (`VERTEX_TUTOR_MODEL_ID`) | Conversational tutor turns, explain calls      | Learner-facing, pedagogy, stronger reasoning |

Per-turn token cost rises (full material in context, stronger model) but is bounded by the 4000-char clamp. The cheap tier still covers the high-volume extraction calls.

### What the Learner Sees

- **Credits are never shown to the learner** — internal accounting only
- Soft-cap UX thresholds appear in admin surface only:
  - Balance 10-25% of allotment: "Credits werden knapp" admin banner
  - Balance < 10%: "Heute noch wenige neue Fragen möglich" admin banner
  - Balance = 0: "Diesen Monat ist Schluss" admin banner; learner sees "Heute haben wir genug geübt — bis morgen!"
- Framing: "today's quota," not "credits left"

---

## 32. Model Tier Split

Per ADR 0002:

| Function                                | Model                   | Env Var                     |
| --------------------------------------- | ----------------------- | --------------------------- |
| visionExtractAndGenerate                | `gemini-2.5-flash-lite` | `VERTEX_MODEL_ID`           |
| regenerateFromText                      | `gemini-2.5-flash-lite` | `VERTEX_MODEL_ID`           |
| evaluateAnswer (legacy)                 | `gemini-2.5-flash-lite` | `VERTEX_MODEL_ID`           |
| **converseTurn (conversational tutor)** | **`gemini-2.5-flash`**  | **`VERTEX_TUTOR_MODEL_ID`** |
| **explain**                             | **`gemini-2.5-flash`**  | **`VERTEX_TUTOR_MODEL_ID`** |

The two learner-facing pedagogy calls use the stronger model. Batch/extraction stays on the cheap tier. Prompt versions bumped (`tutor.3`, `p4.1`) so analytics can segment before/after.

---

## 33. Edge Cases in Agent Behavior

### Running out of credits mid-session

- Existing items + practice continue
- "Mehr Fragen" / "Erklär mir das" disabled
- Admin banner shows status

### Subscription expired during active session

- Session continues
- Next new-material attempt: blocked with message
- Existing items + practice: still work

### AI fails after upload

- Refund + retry from capture
- Material marked `extraction_status='failed'`
- Learner sees: "Hmm, die Bilder sind nicht gut genug. Versuchen wir's nochmal?"

### Vision returns `not_educational`

- Credit refunded
- UI: "Das sieht nicht nach Lernstoff aus. Magst du was anderes fotografieren?"
- Two buttons: "Nochmal versuchen" / "Zurück zur Übersicht"

### Vision returns `unreadable`

- Credit refunded
- UI: "Wir konnten den Text nicht lesen. Vielleicht mit mehr Licht?"

### Learner has no prior episodes

- Session starts normally, no opener
- First-time coaching tips fire (one-time, contextual, per feature)

### Learner returns after 3 weeks away

- Warm welcome, no shaming
- No "you missed 28 days" messaging
- FSRS state has aged — items are more "due" internally, but UI says nothing
- Streak counter resets silently — no "you lost your streak"

### Learner repeatedly says "weiß nicht"

- Progressive give-up escalates (Phase A2)
- After 3 skips on same item → item paused, recovery pivot to different item
- Subject becomes recovery hook for reflective layer

### Learner swears or inputs garbage

- Voice intent classifier detects (Phase G)
- 2 strikes: gentle redirect
- 3 strikes: session ends, no credit burn

### Learner answers in wrong language

- LLM recognizes concept equivalence
- Feedback: "Stimmt inhaltlich. Magst du es nochmal auf Deutsch versuchen?"
- Counted as correct for FSRS

### Two devices using same account simultaneously

- Both produce attempts → append-only, no conflict
- Item states: server-recomputed authoritative
- Within ~60s of foreground, pulls sync

### Complex formula mis-parsed

- MathLite parser returns position of failure
- UI underlines offending token
- Prompt: "Wir verstehen es trotzdem — bitte abschicken" (LLM can still grade fuzzy input)

---

## 34. Roadmap Summary & Phase Dependencies

| Phase  | Days | What Changes for the Learner                                             | Prerequisites                                                          |
| ------ | ---- | ------------------------------------------------------------------------ | ---------------------------------------------------------------------- |
| **A1** | 0.5  | Praise stops being generic; 5 different praise contexts                  | None                                                                   |
| **A2** | 1    | Give-up loop terminates; 4-stage progressive escalation                  | None                                                                   |
| **A3** | 1.5  | Tutor pivots when struggling; runtime signal drives picker               | None                                                                   |
| **A4** | 0.5  | All A1-A3 wired into tutor prompt; L1 audit                              | A1, A2, A3                                                             |
| **A5** | 1    | Crutch starts breaking; silent retry on scaffolded concepts              | A3 (scaffolded_correct_on_concept)                                     |
| **B**  | 5    | Tutor chooses from 10+ pedagogical moves; no longer one-note             | A3 (runtime signal drives move selection)                              |
| **C**  | 5    | Tomorrow's session opens referencing yesterday; recurring mistakes named | B (moves defined), A's episode-summary substrate                       |
| **D**  | 4    | Fake understanding caught; confidence probes + wrong-example probes      | B (probe moves are selector moves)                                     |
| **E**  | 7    | Sharp kids find depth; concept graph → curiosity hooks                   | B (curiosity_hook is a selector move), C (concept graph from episodes) |
| **F**  | 5    | Weekly transfer test — the one metric we trust                           | E (concept graph is substrate for transfer item generation)            |
| **G**  | 3    | Voice stops eating credits on "warte" / mumbles; intent classifier       | A2 (give-up), A3 (signal), B (moves)                                   |
| **H**  | 5    | 50-turn sessions stay coherent; app tells learner to stop                | A3 (fatigue signal), C (digest), E (concept graph)                     |

**Phase order matters.** B's moves depend on A3's signal. C's memory needs A's episode-summary substrate (learner_episodes rows). D's probes are moves in B's library. E's concept graph is the substrate F queries. F can't begin before E ships. G and H build on everything before them.

---

## 35. Deliberate Anti-Patterns & Non-Goals

### What the Agent Will NEVER Do

- **Never generate answers to homework.** The app quizzes; it does not produce answers to assigned exercises.
- **Never show XP, levels, virtual currency, leaderboards.** No gamification.
- **Never show pending task counts to the learner.** No "12 Fragen warten auf dich."
- **Never send streak-loss notifications.** No "you'll break your streak."
- **Never use ability praise.** "Schlau", "Genie", "smart", "clever" are banned.
- **Never reveal the answer before the third wrong attempt.** The hint cascade is sacred.
- **Never use first-person language about the learner's state.** L1 is forever.
- **Never label the learner emotionally.** "Du bist frustriert" is forbidden.
- **Never call the LLM for signal computation.** Runtime signal is pure rule-based on metadata.
- **Never escalate models for extraction.** One model (flash-lite) for batch work.
- **Never expose credit balance to the learner.**
- **Never gamify the streak.**
- **Never use a mascot or avatar for the tutor.** The tutor is a voice and a chat.
- **Never ask for ratings or surveys.**
- **Never do comparative metrics** ("better than yesterday"). Never exposed to the learner.
- **Never block the learner from quitting mid-session.** State preserved, no penalty.
- **Never show "due item counts."** The FSRS queue is invisible.

### What the Agent MAY Do

- Show a quiet streak number on session result screen
- Show a small "Test in 3 Tagen" chip on a subject tile
- Gently suggest a break after extended effort
- Use confetti/check animation at session end (small, calm)
- Count correct answers in a row as a quiet inline marker ("🔥 5")
- Reference the material's difficulty, never the learner's

---

## Appendix A: Prompt Version Reference

| Prompt        | Version     | Model      | Purpose                                           |
| ------------- | ----------- | ---------- | ------------------------------------------------- |
| Vision P1     | `p1.0`      | flash-lite | Extract + generate from photos                    |
| Regenerate P2 | `p2.0`      | flash-lite | Generate additional items from cached text        |
| Evaluate P3   | `p3.0`      | flash-lite | Legacy single-shot evaluator (superseded)         |
| Explain P4    | `p4.1`      | flash      | Explain concepts (grounded in material)           |
| Tutor System  | `tutor.3`   | flash      | Conversational tutor (with ADR 0002 improvements) |
| Reflect       | `reflect.1` | flash      | Post-session episode summary                      |

---

## Appendix B: Answer Kind Reference

| Kind              | Input                     | Local Eval                        | LLM Eval Context                   |
| ----------------- | ------------------------- | --------------------------------- | ---------------------------------- |
| `short`           | Text or voice             | Token overlap + normalization     | (none extra)                       |
| `long`            | Text or voice             | Only obvious wrong (< 25% length) | Always delegates                   |
| `numeric`         | MathInput numeric         | ±1% tolerance, unit normalization | Units, tolerance                   |
| `multiple_choice` | Tappable cards            | Exact index match                 | Options + correct index            |
| `formula`         | MathInput formula + KaTeX | MathLite canonicalization         | LaTeX expected + acceptable        |
| `diagram_label`   | Text or voice             | Same as short                     | "What is number X on the diagram?" |
| `fill_blank`      | Inline text inputs        | Per-blank normalize               | Template + blank answers           |

---

## Appendix C: Locale Reference

| Code | Language | Supported                                                   |
| ---- | -------- | ----------------------------------------------------------- |
| `de` | German   | Lead language, all namespaces complete                      |
| `en` | English  | Complete                                                    |
| `fr` | French   | Legal namespace human-reviewed, rest machine + human review |
| `es` | Spanish  | Legal namespace human-reviewed, rest machine + human review |
| `it` | Italian  | Legal namespace human-reviewed, rest machine + human review |

---

## Appendix D: Subject Kind Reference

| Kind               | Default Name   | Templates? | Diagrams? | Primary Answer Mix                     |
| ------------------ | -------------- | ---------- | --------- | -------------------------------------- |
| `math`             | Mathematik     | Yes        | Sometimes | formula 30%, numeric 30%, short 25%    |
| `physics`          | Physik         | Yes        | Sometimes | numeric 35%, formula 25%, short 20%    |
| `chemistry`        | Chemie         | No         | Yes       | short 30%, formula 25%, MC 20%         |
| `biology`          | Biologie       | No         | Yes       | short 30%, long 25%, diagram_label 20% |
| `geography`        | Geografie      | No         | Yes       | short 30%, MC 30%, diagram_label 25%   |
| `history`          | Geschichte     | No         | Rare      | short 35%, long 30%, MC 25%            |
| `language_native`  | Deutsch        | No         | No        | short 30%, long 25%, fill_blank 35%    |
| `language_foreign` | Englisch/...   | No         | No        | fill_blank 40%, short 30%, long 20%    |
| `religion_ethics`  | Religion/Ethik | No         | No        | long 40%, short 35%, MC 25%            |
| `art_music`        | Kunst/Musik    | No         | Sometimes | short 40%, long 30%, MC 30%            |
| `general`          | Sachunterricht | No         | Rare      | short 35%, long 30%, MC 25%            |
| `other`            | (custom)       | No         | Rare      | balanced                               |

---

_End of specification. This document captures everything in the docs about how the interactive voice/text AI agent should work. Any change that diverges requires an ADR._
