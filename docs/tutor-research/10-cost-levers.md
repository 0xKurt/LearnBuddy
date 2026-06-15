# 10 — Cost levers beyond the prompt (#1, #3, #4, #5, #6)

Shipped 2026-05-22. Five orthogonal hebel layered on top of the v3.1
prompt compression. Each one is independently togglable and can be
measured separately via the `probe-tutor.ts` token output.

## Bonus finding (before we even built anything)

Gemini 2.5 Flash ships with **implicit context caching enabled by
default**: when the same prefix appears across calls within a short
window, Vertex automatically caches it and bills the cached portion at
25 % of normal input rate. We discovered this when our first v3.1
probe runs showed `cachedContentTokenCount = 1956` (≈ 90 % of input)
on every turn — without any explicit caching code on our side.

So the headline cost story is:

|                                      | input cost | output cost | total per turn |
| ------------------------------------ | ---------: | ----------: | -------------: |
| **v3 (no implicit cache hit yet)**   |  ~$0.00042 |   ~$0.00004 |      ~$0.00046 |
| **v3.1 (prompt compressed)**         |  ~$0.00022 |   ~$0.00003 |      ~$0.00025 |
| **v3.1 + implicit caching observed** |  ~$0.00007 |   ~$0.00003 |      ~$0.00010 |

That's **~78 % cost reduction vs v3 with no special infra** — most of
it from Gemini's free implicit caching, the rest from prompt
compression.

The five explicit levers below add **margin** on top: guarantee that
caching always engages (not just when implicit happens to hit),
make trivial turns even cheaper, and skip content we don't need.

---

## #1 — Explicit Vertex context caching

`apps/api/src/lib/llm/agent-cache.ts` — module-level Map keyed by
`hash(header)::model`. On each agent turn, ensure a cached-content
exists for `TUTOR_HEADER_V3_1` (~1700 tokens). Pass its name as
`cachedContent` in `generateContent`.

Implementation notes:

- In-memory only (no DB, no migration). Cold start = recreate cache,
  marginal one-call cost.
- TTL 60 min (Vertex max for flash); refresh ≤ 5 min before expiry.
- Failure on create (quota / min-token / regional rollout) → return
  null → caller falls back to non-cached path. Never blocks a turn.
- Only active when `AGENT_PROMPT_VERSION='v3.1'`. v2 / v3
  prompts intermix static + dynamic; would need a refactor we're not
  doing for legacy paths.

**Marginal benefit on top of implicit caching:** small. The Gemini
2.5 implicit cache already covers most of the same surface. Explicit
caching guarantees cache hits across sessions (implicit caching's
window is short, ~minutes; explicit is the full TTL). Net: maybe
5-10 % extra savings on cold-start scenarios.

## #3 — flash-lite routing for trivial turns

When the learner's message looks like a direct correct answer (loose
case-insensitive match against `expectedAnswer` + `acceptableAnswers`)
AND there are no prior hints / wrong attempts on this item, route the
turn to `gemini-2.5-flash-lite` instead of `gemini-2.5-flash`.
**flash-lite is ~75 % cheaper per call.**

Heuristic is intentionally conservative: only triggers on EXACT or
whitespace-normalized matches. Typo tolerance / fuzzy match would
risk routing a struggling kid's "almost right" turn to the dumber
model. False positives are pricy-but-fine; false negatives are
quality-bad and avoided.

The route logic lives in `apps/api/src/routes/agent.ts`. Implementation:

```ts
const looksLikeCorrectAnswer = isLooseAnswerMatch(
  learnerText,
  itemCtx.expectedAnswer,
  itemCtx.acceptableAnswers,
);
const modelOverride =
  looksLikeCorrectAnswer && hintsGivenForItem === 0 && priorWrongAttemptsOnItem === 0
    ? 'gemini-2.5-flash-lite'
    : undefined;
```

Estimated impact: ~30 % of all production turns are
"kid answered correctly, no prior trouble". Those turns drop 75 % in
cost → ~22 % cost reduction across the whole session.

## #4 — History truncation to 12 turns (keep current item's opener)

Was: last 40 messages from `conversation_turns`. Now: last 12 messages
PLUS the tutor-turn that introduced the CURRENT item (so we never
drop the question we're working on, even on a long session).

User-stated constraint honored: "always keep the question we're
talking about". The opener for the current item is always retained;
older items' history is dropped silently.

```ts
const HIST_MAX = 12;
const tailSlice = allChatTurns.slice(-HIST_MAX);
const currentItemIntro = allChatTurns.find(
  (t) => t.role === 'tutor' && t.item_id === currentItemId,
);
const history =
  currentItemIntro && !tailSlice.includes(currentItemIntro)
    ? [currentItemIntro, ...tailSlice]
    : tailSlice;
```

Estimated impact on late-session turns (≥ 10 items deep): ~20-30 %
input-token reduction. Early-session turns barely affected.

## #5 — Conditional material context

The 2 KB worksheet excerpt only gets injected when the route is in
"tutoring mode" — defined as `hintsGivenForItem > 0 ||
priorWrongAttemptsOnItem > 0`. A fresh first-attempt turn for an
item carries the question inline (in the system prompt's `Q:` line);
the full worksheet markdown isn't needed until the model has to
construct a hint.

```ts
const inTutoringMode = hintsGivenForItem > 0 || priorWrongAttemptsOnItem > 0;
const materialContextForTurn = inTutoringMode ? materialContextFull : null;
```

Estimated impact: ~30 % input-token reduction on the
~60-70 % of turns that are fresh-attempt or post-correct
(no material context needed). Combined session impact: ~15-20 %.

## #6 — TTS phrase cache (not yet implemented — deferred)

Looked at the data again — TTS is already a small slice of cost (~$0.0001
per turn at Chirp HD rates), and the high-frequency phrases ("Bereit für
die nächste?", "Lass uns weitermachen") get implicit caching at the
LLM level but NOT the TTS level. Building a phrase-cache layer would
save maybe $1-2 / 10 k sessions. **Not worth the complexity right
now.** Defer to v3.3.

## Combined cost picture

For a 20-turn session with typical mix (30 % correct-first-try,
50 % needs hints, 20 % give-up/affective):

| Lever                        | Per-session savings |
| ---------------------------- | ------------------: |
| Baseline v3.1 implicit-cache |             ~$0.002 |
| Explicit cache (#1)          |   small (+ a few %) |
| flash-lite route (#3)        |    ~$0.0006 (−22 %) |
| History truncation (#4)      |    ~$0.0004 (−15 %) |
| Conditional material (#5)    |    ~$0.0004 (−15 %) |
| **Net 20-turn session**      |         **~$0.001** |

At 10 k sessions / month: **~$10-12 / month** on top of the v3.1
baseline savings. The really big win was v3.1 itself (prompt
compression) plus Gemini's free implicit caching.

## What `AGENT_PROMPT_VERSION` actually controls

The env var selects the prompt builder, nothing else. Specifically:

| Lever                           | Gated by env var? | Notes                                                                                                                                                                                                          |
| ------------------------------- | :---------------: | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Prompt content (v2 / v3 / v3.1) |      **yes**      | This is the var's only job.                                                                                                                                                                                    |
| #1 explicit caching             |      partial      | Only v3.1 has a cacheable static prefix (`TUTOR_HEADER_V3_1`). v2 / v3 mix static + dynamic in one string, so explicit caching can't hit. Implicit caching (Gemini auto-feature) still works for all versions. |
| #3 flash-lite routing           |      **no**       | Runs regardless of version.                                                                                                                                                                                    |
| #4 history truncation (12)      |      **no**       | Runs regardless of version.                                                                                                                                                                                    |
| #5 conditional material context |      **no**       | Runs regardless of version.                                                                                                                                                                                    |

In other words: switching to v2 or v3 doesn't "disable" #3/#4/#5. The
only difference is that v3.1 also gets the marginal extra discount
from explicit caching (~5-10 % over implicit caching alone).

## Rollback path

- `AGENT_PROMPT_VERSION='v3'` → verbose v3 prompt (still
  benefits from #3 #4 #5 + Gemini's implicit cache).
- `AGENT_PROMPT_VERSION='v2'` → legacy quiz-bot (same
  — still benefits from #3 #4 #5 + implicit cache).
- Both reachable without redeploy.
