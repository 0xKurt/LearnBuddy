# ADR 0010 — The smallest schema that carries the decision

- Status: accepted (decided where evidence decides, CLAUDE.md "How we work" 2; KI-Audit F18, #676)
- Date: 2026-10-15
- Builds on: [ADR 0005](0005-buddy-tool-platform.md) (one registry for the tools),
  `docs/architecture.md` §Schema budget (#627)

## Context

Every call that changes something answers with structured output: one JSON schema holding every
tool, task form and figure the call may use. On 14 October the Buddy turn stood at 268 of the 269
properties Vertex serves, a practice run at 774, a sheet reading at 700 (KI-Audit F18). The two
large ones only go out because a first, small call chooses the forms and figures they need (#627);
the turn went out because each new field was paid for by folding another one (#724).

The audit named three options: (a) offer tools, forms and figures from code and state, (b) declare
tools as function declarations instead of one answer union, (c) a second call only where code
cannot decide beforehand. Every provider has such a bound, and the owner plans to leave Vertex
(14.10.) — so the strategy may not hang on this provider's number, and nothing Vertex-specific is
built for it.

## Decision

1. **Code decides what a call may use, from facts, before the call** (option a). A tool that
   needs something to name is offered only when STATE has one (#668, `offeredTools`); a run is told
   only the rules of the forms and figures its schema offers (#669, `generateSystem`). The model
   never chooses its own schema.
2. **A call's shape costs nothing it does not need.** Tool calls are flat (`{ tool, ...args }`,
   #726, `buddy/calls.ts`); a description says a field's form once, and its use stands once in the
   prompt (#667).
3. **A second call only where code cannot know the answer** (option c): the form choice before a
   run or a reading stays, because which forms a sheet or a topic needs is a judgement about its
   content. It reads a catalogue of what it can choose, not the main call's prompt (#669).
4. **Function declarations (option b) are not adopted now.** Whether a provider counts them against
   the same bound is provider-specific and must be measured on the provider that follows Vertex —
   it is part of that provider's acceptance (`docs/decisions/baseline-2026-10.md`), not built ahead
   for Vertex.
5. **The bound is a guard, not a target.** Every schema we send stays under the gateway's bound
   (`schemaBudget.test.ts`), the Buddy turn at least 20 properties under it (`offer.test.ts`), and
   every purpose's prompt and schema under a budget that only shrinks (`evals/schema/budgets.ts`).

## Consequences

- The turn went from 269 to 242 properties (181 for a learner with nothing yet to name), the run's
  prompt from 37 963 characters to what its schema can hold (5 149 for vocabulary).
- Each offer is its own prompt-cache variant for the schema; the system prompt stays one static
  block, so the cached prefix is unchanged.
- A new tool or form costs a registry entry with its `needs`, not a fold elsewhere.
- Open: the provider after Vertex is measured for its own bound and for function declarations
  before this ADR is revisited.
