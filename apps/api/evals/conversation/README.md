# Conversation scope (#937)

`run.ts` exercises the production Buddy prompt, schema and EU transport with synthetic German
conversation. Five cases: smalltalk, requested detail, broad overview, spoken explanation and
multi-turn summary. No learner data, database writes or actions are applied. Word bounds distinguish
scope; coverage, structure, compression and sentence-ending checks catch truncated replies.
Review the saved replies too: these checks are not a complete semantic grader.

Run from `apps/api` with the provider environment, under `scripts/test-lock.sh`.
The runner writes `result.json`; costs are conservative gateway estimates (cache discounts ignored).

The first batch exposed the 700-character schema limit: all four substantive replies were
exactly 700 characters, and explanations ended mid-word (smalltalk was only 88 characters).
The second batch with 6,000 characters completed explanations, but the summary repeated facts in
several sections. The final prompt asks for each fact once, shorter than the source. The summary
fixture now uses actual alternating conversation turns through `buildContents`, rather than a
single pre-written summary and an informal STATE prefix. `before.json` and `length-fixed.json`
record those exploratory batches; compare their explanations for the length-limit regression.
