# Which model replaces Gemini 3.6 Flash (issue #647, KI-Audit F1-c), 15.10.2026

`eu/gemini-3.6-flash` is switched off on **19.11.2026**. The owner (15.10.): there is no
candidate, choose by evidence. Measured against `docs/decisions/baseline-2026-10.md` on the four
axes (Speed, Qualität, Kosten, Anwendungsfall). Eval spend for this decision ≈ **$4.4 of the $15**
allowed (ledger `BUDGET-LEDGER.md` of the audit round).

## Recommendation (two steps; ADR 0011)

1. **Survive 19.11. on `eu/gemini-3.8-flash`, with every thinking level sent as LOW.** Of what can
   be measured with the credentials configured, it is the only candidate that keeps children's data
   in the EU on the processor already in `docs/privacy.md`, serves our schemas unchanged, answers
   as well as 3.6 on every suite and costs the same per token. It is **slower** (Buddy's first
   words p50 3.4 s instead of 1.6 s; a sheet reading about twice as long), which misses the
   ≤ 2.5 s goal (#447). It does **not** fix #758: Vertex's harassment filter holds back the insult
   on 3.8 as on 3.6 (0/20 both), and the owner keeps the thresholds. The switch is a config value
   (`VERTEX_MODEL_SMART`), off until the owner sets it.
2. **Measure one EU provider outside Vertex before deciding where Buddy lives after that.** The
   owner plans to leave Vertex (14.10.) and #758 needs a provider whose filter does not hold back a
   child's insult. Two are reachable from the EU and fit the seam (`GatewayProfile`, #755): Mistral
   (La Plateforme, Paris) and Azure OpenAI in an EU data zone. Neither can be measured here — no
   account, no key, no DPA — so no adapter is built on guesswork. What the owner must provide is
   listed at the end.

## Requirements every candidate is held to

From `docs/privacy.md` §Processors and `apps/api/src/config.ts`: a minor's data (her words,
photos of her sheets, her voice) is processed **only in the EU**; non-EU and `global` endpoints
are refused at startup. A new processor needs a DPA and an entry in `docs/privacy.md` and
`docs/dpia.md` before launch. From the code: audio and images in the same call as structured
output (`LlmPart.inlineData`), response schemas up to 269 properties / 43 216 characters (Buddy's
turn, `evals/schema/budgets.ts`), JSON streamed while it is written (`partial.ts`), properties in
declared order (`GatewayProfile`, #646).

## Candidates

| candidate                                  | EU processing                                   | audio + image + schema                                                                                   | lifetime                          | price (eu, per 1M)                                                 | verdict                                                                                             |
| ------------------------------------------ | ----------------------------------------------- | -------------------------------------------------------------------------------------------------------- | --------------------------------- | ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| **eu/gemini-3.8-flash**                    | yes, `eu` multi-region, same processor (Vertex) | yes; the 269-property turn schema is served                                                              | GA 02.09.2026, no switch-off date | $0.825 / $4.125 net until 31.12. (50 % credit), then $1.65 / $8.25 | **GO as the bridge past 19.11.** (does not fix #758)                                                |
| eu/gemini-3.7-flash                        | yes                                             | yes                                                                                                      | **switched off 28.01.2027**       | as 3.8                                                             | no-go: a second migration in 3 months; 01.10. run had a 10 s outlier (`model-choice-2026-10-01.md`) |
| eu/gemini-3.1-flash-lite for the chat turn | yes                                             | yes                                                                                                      | to 07.05.2027                     | $0.275 / $1.65                                                     | no-go for the chat: **58/65** (7 cases fail)                                                        |
| eu/gemini-4-argon                          | yes (`eu` since 13.10.)                         | yes                                                                                                      | new                               | **$2.20 / $11** until 30.11., then $4.40 / $22                     | no-go: 6.5–10.2 s per turn, 2.7× (from Dec 5.3×) the price                                          |
| Mistral (La Plateforme, EU)                | EU hosting stated                               | audio only in the Voxtral models, images in others: two models per feature; schema limits not documented | —                                 | not compared                                                       | not tested: new account, DPA, privacy/DPIA entries; JSON-schema size limits unknown                 |
| Azure OpenAI (EU Data Zone)                | EU data zone                                    | structured outputs up to 5 000 properties; audio-input models not listed for Data Zone Standard          | —                                 | not compared                                                       | not tested: new account, DPA; audio path unclear                                                    |

Sources: Vertex model cards, locations and pricing pages read 14.10.2026 (KI-Audit F §1–2,
`reports/ki-audit-2026-10-14/F-pricing.md`); Gemini 4 Argon id and price:
https://www.eesel.ai/blog/gemini-4-argon-pricing ; Mistral Voxtral and EU residency:
https://opper.ai/mistral/voxtral-small-latest , https://www.eurouter.ai/models/voxtral-mini ;
OpenAI schema limits: https://www.codewords.ai/blog/openai-structured-outputs-json-schema ;
Azure data zones: https://learn.microsoft.com/azure/ai-services/openai/whats-new . The two
non-Google options were only researched: neither is reachable with the credentials configured,
and either would add a processor for children's data 35 days before the deadline.

## Measured (same suites as the baseline, same code; `eu/gemini-3.8-flash` as smart model)

| suite                                        | 3.6 baseline                           | 3.8 (all LOW)                                                          | note                                                                                                                                                |
| -------------------------------------------- | -------------------------------------- | ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| buddy (65 cases, 84 runs)                    | 64/65                                  | **64/65** (same failing case, #758)                                    |                                                                                                                                                     |
| ↳ first speakable reply p50 / p90            | 1.56 s / 2.36 s                        | **3.37 s / 5.14 s**                                                    | over the 2.5 s goal                                                                                                                                 |
| ↳ model call p50 / p90 / max                 | 1.52 / 1.96 / 3.04 s                   | 3.12 / 4.71 / 12.9 s                                                   |                                                                                                                                                     |
| ↳ thought tokens, prefix cache               | 0, 78 % cached                         | 7 484, 24 % cached                                                     | 3.8 cannot think less than LOW                                                                                                                      |
| ↳ cost                                       | $2.184 ($0.023/call)                   | $2.190 ($0.023/call)                                                   | same                                                                                                                                                |
| tutor (22 cases)                             | 19/22, median 1.18 s                   | **22/22**, median 1.89 s, max 3.53 s                                   | same code: the fix for #747 is not on main yet, so 3.8 itself gets the two safeguarding cases right (3.6 wrote `concern` with an empty reply, #747) |
| content (2 sheets)                           | 28/29, reading ≈ 14 s, start 4.5–7.9 s | **31/33**, reading ≈ 31 s, start 6.9–8.5 s                             |                                                                                                                                                     |
| ↳ with MEDIUM/HIGH (the old budgets' levels) | —                                      | readings 68–86 s, ~10k thought tokens each, practice run **timed out** | why everything goes LOW                                                                                                                             |
| speak (pronounce)                            | on 3.1-flash-lite in both              | —                                                                      | pronounce does not use the smart model                                                                                                              |
| speed walk (2 rounds)                        | 15/18 within budget                    | **9/18**                                                               | chat 3.7–13.9 s, tutor 2.1–2.6 s                                                                                                                    |

Controlled A/B (interleaved, same minute, whole turn schema, not streamed, 6 calls each):
3.6 **1.5–3.3 s**, 3.8 **3.1–11.4 s**, most 3.8 calls with 0 thought tokens. So the gap is not
only thinking: 3.8 in `eu` answers slower today. The machine was heavily loaded during the later
runs (load 130–230), which inflates every absolute latency above; the A/B pair and the thought
tokens are the load-independent evidence.

**Quota (re-checked):** on 01.10. 3.8 had almost no quota in `eu` (429s,
`model-choice-2026-10-01.md`). Today none of 120+ calls was throttled (`attempts = 1`
throughout). That blocker is gone.

## The four axes

- **Speed: worse.** ~2× on the chat turn and the reading. Mitigations, in order: (1) the prompt
  diet already in flight (F3/F5: fewer input tokens), (2) Vertex **Priority PayGo** in `eu` (×1.8
  price, the audit's lever for shared-capacity latency; not measured here, needs the owner's cost
  decision), (3) re-measure in production with `llm_calls.first_token_ms` (#652) instead of this
  loaded machine.
- **Quality: equal or better.** Same buddy result, tutor and content as good or better.
- **Cost: equal** per token (the eu list price is the same). Thought tokens add ≈ 0.3 % on the
  chat. From 2027 every Flash costs double — that is the same for 3.6's successors.
- **Use case: met, except one thing.** EU processing on the processor already in `docs/privacy.md`;
  audio, images, schemas and streaming unchanged; no switch-off date. Not met: an insult from a
  child is still held back by the provider's filter (#758, 0/20 on 3.8).

## What this PR changes (ADR 0011)

- `llm/vertex.ts`: Gemini 3.8 and Gemini 4 take a thinking **level** only — a budget can be refused
  with 400, MINIMAL is a validation error on 3.8 — so every neutral level goes out as **LOW** there.
  3.6 is untouched (wire test pins both).
- The tutor, speak and modes evals pass the real gateway's `profile` (they failed with 0/22 after
  #646 because the cast hid the missing field).

## Migration steps (owner, then code)

1. Merge this PR (no effect on 3.6).
2. **Owner:** set `VERTEX_MODEL_SMART=eu/gemini-3.8-flash` on the Vercel API project (production)
   and redeploy. The canary (#650) then checks 3.8 hourly; `/v1/health` turns red if it fails.
3. Watch 7 days: `llm_calls` per purpose for `refused`/`invalid_output` (alarm #650),
   `first_token_ms` and `total_ms` (#652) for the chat turn.
4. After 7 green days, change the default in `config.ts` to 3.8 and remove the 3.6 notes.
5. Before 19.11.: decide Priority PayGo on the measured production latency.

**Rollback:** set `VERTEX_MODEL_SMART` back to `eu/gemini-3.6-flash` — possible until 19.11.;
after that the only like-for-like fallback is `eu/gemini-3.7-flash` (until 28.01.2027). It is
**not** a config-only switch: 3.7 refuses Buddy's turn with 400 (measured 23.10., see the last
section) and needs one line in `llm/vertex.ts` first.

## Insults and the provider's filter (#758)

Vertex holds back a streamed turn for an insult at Buddy with HARASSMENT HIGH (p = 0.99, finish
reason SAFETY; measured on 3.6 in #758). The same case on 3.8: **0/20**, the same block. Code now
answers a held-back turn with the calm line when the distress check finds nothing (#781), but the
filter holds back that check too. The owner keeps the thresholds (15.10.). A provider fixes this
only if its own moderation lets an insult through to the model while distress still reaches the
fixed help answer (rule 18, which is code and stays). That is the first thing to measure on a
non-Vertex candidate: `evals/buddy` `de_insult_stays_calm` plus the five distress cases.

## What the owner must provide to measure a non-Vertex candidate

For **either** candidate, ≈ $3–4 of eval budget for the five suites (same as for 3.8), then:

- **Mistral (La Plateforme):** an API key of an organisation with **EU data residency** and the
  **DPA** signed (`console.mistral.ai`), the key put in `apps/api/.env.local` as
  `MISTRAL_API_KEY`. Open before building: Mistral reads audio only with its Voxtral models and
  sheets with its vision models, so one feature may need two models; its JSON-schema size limits
  are not documented and must be tried with our 269-property turn schema.
- **Azure OpenAI (EU Data Zone):** an Azure subscription with an Azure OpenAI resource in an EU
  region (Sweden Central or Germany West Central), a **Data Zone Standard** deployment of a current
  GPT model, endpoint + key in `apps/api/.env.local` (`AZURE_OPENAI_ENDPOINT`, `AZURE_OPENAI_KEY`),
  and Microsoft's DPA (part of the subscription terms). Open: which audio-input model is offered
  as Data Zone Standard in the EU; strict structured outputs require every field `required` and
  `additionalProperties: false`, which `json-schema.ts` would emit per gateway.

Either one then needs entries in `docs/privacy.md` §Processors and `docs/dpia.md` before
production — the owner's (legal) call. Model Garden partners on Vertex (Claude, Mistral on
`europe-west*`) were listed for the project but are Vertex again and need enabling in the
console; Claude reads no audio.

## Bridge re-check: 3.7 against 3.8, 23.10.2026

The owner wants another Gemini for now and the provider change later. 3.7 had been set aside for
its switch-off date (28.01.2027) and one 10 s outlier on 01.10., but its speed had never been
measured on Buddy's turn. Both were measured the same way, interleaved (A/B; from 17:00 A/B/C
with 3.6 as control; order rotating per case), on the same machine (load 3.5–9), with the code
of `main` (`eu/gemini-3.8-flash`: every level LOW; `eu/gemini-3.7-flash`: see the first
finding). Spend ≈ **$0.34** of the $1.50 allowed (ledger `bridge37`).

### 1. 3.7 is not a config-only switch

On `main`, Buddy's turn (also the learning turn and the canary) sends `thinkingLevel: MINIMAL`
to every model before 3.8. 3.7 refuses it: **HTTP 400 "Thinking level is unsupported:
THINKING_LEVEL_MINIMAL"**, so with `VERTEX_MODEL_SMART=eu/gemini-3.7-flash` alone every chat
turn fails. 3.7 accepts `thinkingBudget: 0` (one turn 3.7 s, 0 thought tokens) and
`thinkingLevel: LOW` (one turn 8.4 s). The runs below used `minimal → thinkingBudget: 0` for 3.7
as a local, uncommitted change; making 3.7 usable needs that one line in `thinkingConfigOf`.
`off` (budget 0: sheet reading, tutor, practice) is accepted; budgets 512/1024/2048 (roleplay,
consolidation, figures, hints) could not be checked, because from 17:00 the quota refusal came
before validation.

### 2. Neither had capacity in `eu` on 23.10.

From 15:18 to 17:37 the project got almost no answers from 3.7 or 3.8 in `eu`, while 3.6 answered
every call. A tiny raw call ("Say ok.", no schema, straight to the `eu` endpoint, 150 s cap), once
per model about every 5 min:

| model         | answered             | 429 RESOURCE_EXHAUSTED | no answer within 150 s / 503 |
| ------------- | -------------------- | ---------------------- | ---------------------------- |
| eu/gemini-3.6 | **17/17**, 1.0–1.7 s | 0                      | 0                            |
| eu/gemini-3.7 | 3/17, 6.7–63 s       | 11 (most within 1 s)   | 3                            |
| eu/gemini-3.8 | 1/17, 2.6 s          | 7 (1–89 s)             | 9                            |

3.7 and 3.8 are not served in `europe-west1/3/4` (404), so `eu` is the only EU route. From 17:00
3.7's refusal read "Resource has been exhausted (e.g. check quota)" instead of "try again later",
which reads like a project quota rather than shared capacity; the Quotas page in the Cloud
Console says which (owner).

### 3. Buddy's turn, the same cases interleaved

| round                                 | model | passed | first speakable reply p50 / p90 (n) | model call p50 / p90 / max (n) | cost   |
| ------------------------------------- | ----- | ------ | ----------------------------------- | ------------------------------ | ------ |
| 15:29–15:45, 15 cases (5 distress)    | 3.7   | 5/15   | 4.3 s (n = 1)                       | 4.1 / 17.3 / 17.3 s (n = 6)    | $0.065 |
|                                       | 3.8   | 4/15   | 6.7 / 22.2 s (n = 4)                | 9.4 / 22.2 / 22.2 s (n = 7)    | $0.081 |
| 17:00–17:08, 10 cases, 3.6 as control | 3.6   | 10/10  | **3.3 / 4.8 s** (n = 10)            | 3.5 / 4.8 / 5.4 s (n = 10)     | $0.160 |
|                                       | 3.7   | 0/10   | —                                   | —                              | $0     |
|                                       | 3.8   | 0/10   | —                                   | —                              | $0     |

Every failure but one is `model_unavailable` (the 30 s turn timeout, or the throttle). Distress
(`*_distress_safeguarding`): 3.7 4/5 with the helpline, the fifth unavailable; 3.8 0/5, all
unavailable — a child then sees the generic failure line, not her helpline. The one quality miss
was 3.8's `de_test_nerves_not_concern`: test nerves answered with the held-back line and 116 111
(one run). So the ~10 turns per model for p50/p90 were **not reached**: 1 and 4 measured first
replies prove nothing about 3.7 against 3.8. `evals/tutor` and a sheet reading on 3.7 were not
run, since 3.7 answered 0 of 10 turns in that hour; 3.8's 22/22 from 15.10. stands.

### Recommendation for the bridge

**Stay with `eu/gemini-3.8-flash`** (ADR 0011), and treat capacity, not speed, as the open risk.

- Today's runs give 3.7 no speed edge: its few answers came under the same throttle, and on
  01.10. its tutor median equalled 3.8's (2065 vs 2056 ms, `model-choice-2026-10-01.md`).
- 3.7 needs a code change before it works at all, and it goes away on 28.01.2027 — a second
  migration if the provider change is not done by then. 3.8 has no switch-off date.
- On 23.10. **neither** could carry the chat for over two hours while 3.6 answered in ~1.3 s.
  Switching production that afternoon would have failed nearly every turn. Before 19.11. the
  owner decides (a) the quota for 3.8 in `eu` (Cloud Console, Quotas) and (b) Provisioned
  Throughput or Priority PayGo for 3.8 in `eu` (cost); then the turn is re-measured on a day with
  capacity — the ~10-turn interleaved A/B here (`evals/buddy`, 3.6/3.8) costs ≈ $0.35.
- Keep 3.7 only as a last fallback, with the one-line mapping (`minimal` → `thinkingBudget: 0`
  for 3.7) built and tested first.
