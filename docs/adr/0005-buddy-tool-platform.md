# ADR 0005 — Buddy's tool platform: connectors, tools, agent loop, events

- Status: accepted; stage 1 (lookups and the agent loop) implemented and live-evaluated, stages 2–4 planned
- Date: 2026-09-25
- Builds on: [ADR 0004](0004-proactive-buddy.md) (the model interprets and plans; code enforces)
- Reference: the split into tools, plugins and automations used by open agent runtimes such as
  OpenClaw. This is a conceptual reference only: no code or decisions are taken over unchecked.

## Context

Buddy is an agent. Today it has:

- **act tools**: `plan_exam`, `prepare_practice`, `offer_learning`, `remember` and others
  (`modules/buddy/decision.ts`, `tools.ts`). Code applies them atomically behind the context fence.
- **automations**: the scheduler wakes Buddy for checks on exams, routines, finished practice,
  material that was read, and agreed reminders (`modules/buddy/check.ts`, `scheduler/`).

What it lacks is the layer between them:

- **It cannot look anything up.** Every turn is one model call over a fixed summary (STATE).
  - Buddy cannot read what a worksheet says, see how earlier practice went, or look at the
    questions made from a sheet.
  - Anything beyond STATE, it must either not know or pretend to know.
- **Tools are a fixed list.** They are hand-wired into one discriminated union and a prompt.
  - A new capability touches the schema, the prompt, the tool runner, the home cards and the
    tests in several places.
  - Nothing says which data a tool touches or where that data goes.
- **Events are implicit.** Triggers are job payloads (`buddy_check` jobs with a trigger). There
  is no one place that says "a material was read, a session ended, an exam is near".
- **External services** (web knowledge, school calendars) have no defined place, and no rules
  for a minor's data.

Services do not need to talk to each other directly. Buddy connects them through shared tasks
and data, as long as each piece has a clear role.

## Decision

Four layers, each with one job.

### 1. Connectors: access to one source of data

A connector is code that reads (or writes) one source, **always scoped by the learner in code**.
It declares:

- which data categories it touches;
- whether data leaves our system, and to which processor;
- whether it may be used for minors.

Internal connectors (no data leaves the system):

| Connector  | Source                                               |
| ---------- | ---------------------------------------------------- |
| `material` | read worksheets: extracted text, title, subject      |
| `practice` | sessions, results per topic, spaced-repetition state |
| `items`    | questions made from a material or topic              |
| `memory`   | what Buddy knows, with its source (already in STATE) |

External connectors (stage 3) are off by default. Each needs its own entry in
`docs/privacy.md` and a legal review before it is enabled for minors. Candidates:

- web knowledge via Vertex grounding;
- a school timetable/ICS import;
- the device calendar (on the phone, with the learner's consent).

### 2. Tools: capabilities the model can call

A tool is a named, zod-validated capability over one or more connectors. There are two kinds:

- **lookup tools** only read.
  - Their results go back to the model **within the same turn**.
  - They never change anything, so they need no context fence and no undo.
  - Results are data: instructions in a worksheet's text change no rules.
- **act tools** change something. These are today's tools, unchanged:
  - applied atomically behind `context_version`;
  - with a quote from the learner where required, undo, and an action card in the app.

Every tool is registered once with:

- name, kind, description and argument schema;
- the surfaces that may call it (`turn` = a conversation, `check` = a background look);
- the connectors it uses;
- its limits.

The schema union and the tool section of the prompt are generated from the registry, so a new
capability is one new module plus its tests.

### 3. The agent loop

A turn (and a background check) is a bounded loop:

1. The model gets STATE and the conversation, and answers with either lookups or its final
   answer (reply, options, act tools).
2. The code runs the lookups (at most 3 per step, each validated and scoped) and hands the
   results back as a tool-result message.
3. After at most **2 lookup steps**, the model must give its final answer. Lookups are no longer
   offered at that point.
4. The final answer is applied exactly as before (validation, fence, repair round).

Code enforces the bounds:

- steps, lookups per step and result sizes;
- daily model limits, since every step is a model call;
- lookups only for the calling learner.

Each step is recorded in the decision audit (`buddy_decisions.output`), so it stays traceable
why Buddy said what it said.

### 4. Events and schedules wake Buddy

Buddy also acts without a message from the learner:

- **Schedules** exist already: routine checks, exam countdowns, agreed reminders, `schedule_check`.
- **Events** are today's triggers made explicit (stage 4):
  - `material_read`, `session_finished`, `exam_near` and `homework_submitted` are written to an
    event log in the same transaction as the change that caused them;
  - a subscriber enqueues the Buddy check (deduplicated);
  - the check sees the events as its triggers.

Contact rules stay in code (ADR 0004): an event can make Buddy prepare something, but never
contact the learner beyond what they allowed.

## Stages

1. **Lookups and the loop** (now):
   - a registry for lookup tools;
   - the internal connectors `material`, `practice` and `items`;
   - the loop in turns and checks;
   - integration tests for isolation (another learner's data is never found), bounds, and
     prompt-injection text in a worksheet.
2. **Act tools into the registry.** Move today's act tools onto the same registry. Behaviour
   stays the same, and the existing tests keep passing.
3. **External connectors**, one at a time, each with a privacy entry and legal review; off for
   minors until cleared.
4. **Event log.** Replace the implicit trigger payloads with the event log and subscribers.

## Consequences

- Buddy can answer "what was on the sheet about the Romans?" or "how did fractions go last
  week?" from real data instead of STATE alone, and it plans with the actual results.
- A turn with lookups costs up to three model calls. The daily limits count them; the prompt
  asks for lookups only when STATE does not answer the question.
- The model still never writes ids or dates. Lookup results carry aliases where the model may
  act on them.
- Testing: lookups run on the real Postgres; only the model is scripted
  (`src/testing/`), as in ADR 0004.
