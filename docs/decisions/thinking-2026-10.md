# How much the model thinks, per call (issue #670, KI-Audit F13 / M2), 16.10.2026

The audit found that the budgets were not backed by measurements. The chat turn at 512 was neither
a cap nor evidenced, and has run at `minimal` since #635/#626. Reading a sheet and writing a
practice run sent a 2048 budget, backed only by "one run each" (`ab6ad37a`), while thought tokens
come **before** the first question streams.

Decision rule, fixed before measuring: the lowest level without a worse result.

## Measured

`evals/content` (two photographed sheets, math fractions and German cases; reading, then "more of
it"; every question judged by a second model pass). Model `eu/gemini-3.6-flash`, same code, same
evening. The only change is `thinking` on the `extraction` and `explain` calls.

| thinking (reading + practice)   | questions without finding      | reading, end to end | practice start | metered cost |
| ------------------------------- | ------------------------------ | ------------------- | -------------- | ------------ |
| `high` (budget 2048, as before) | **26/28** (german-cases 10/12) | 19.8 s / 15.9 s     | 2.8 s / 7.8 s  | 7.64 ct      |
| `off` (budget 0)                | **31/31**                      | 18.6 s / 14.8 s     | 3.3 s / 2.6 s  | 7.61 ct      |
| baseline 15.10. (`high`)        | 28/29                          | 14.2 s / 13.5 s     | 4.5 s / 7.9 s  | —            |

## Decision

- **Reading a sheet (`extraction`) and writing a practice run (`explain`) think `off`.** No worse,
  same cost, and the first question no longer waits for thinking. Two sheets are a small sample; the
  rule asks only "not worse", and none of the three runs shows the 2048 budget ahead.
- **Buddy's chat turn stays `minimal`** (#626: 0 thought tokens, 52/54 vs the same two failures at 512).
- **Hints stay `high`.** They are not measured yet, so they are not changed blind.
- **On Gemini 3.8** every level goes out as LOW anyway (`docs/decisions/provider-2026-10.md`). This
  decision is for today's model; the matrix is repeated with the next provider's own control.

## Cost of the measurement

Two `evals/content` runs, about $0.32 (ledger). The full M2 matrix from the audit (buddy 55 × 3 at
three levels, about $17) was not run: the chat is already at its lowest level, and the budget for
these issues is $4.
