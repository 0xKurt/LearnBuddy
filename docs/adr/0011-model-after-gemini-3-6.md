# ADR 0011 — The model after Gemini 3.6: Gemini 3.8 as the bridge, one EU provider outside Vertex measured next

- Status: proposed (switching production is the owner's call)
- Date: 2026-10-15
- Issue: #647 (KI-Audit F1-c); related #758 (insult held back by the provider's filter)
- Evidence: [`docs/decisions/provider-2026-10.md`](../decisions/provider-2026-10.md) against
  [`docs/decisions/baseline-2026-10.md`](../decisions/baseline-2026-10.md)
- Builds on: the provider-neutral gateway contract (#646, `llm/profile.ts`)

## Context

`eu/gemini-3.6-flash` stops answering on 19.11.2026. Every Buddy turn, practice run, sheet
reading, tutor reply and transcription runs on it. The owner (14./15.10.) wants to leave Vertex,
named no candidate, and asked for a choice by evidence on speed, quality, cost and the concrete use:
a learning companion for children, data processed in the EU (`docs/privacy.md`), structured output
with our schema sizes, images and audio in the same call, and an insult from a child answered
calmly instead of being held back by the provider's filter (#758).

## Decision

1. **Bridge: `eu/gemini-3.8-flash`, every thinking level sent as LOW** (`llm/vertex.ts`). It passed
   every suite at 3.6's quality and price, in the EU, with today's schemas, and with no throttling
   any more. It is about twice as slow and does not fix #758. It goes live only when the owner sets
   `VERTEX_MODEL_SMART=eu/gemini-3.8-flash`; rollback is the same variable set back, until 19.11.
2. **No adapter for a non-Vertex provider yet.** None could be measured: Mistral (La Plateforme, EU)
   and Azure OpenAI (EU data zone) need an account, a key and a DPA first. The seam is ready
   (`GatewayProfile`, wire test per gateway); the adapter is built once one candidate has been
   measured on the same five suites, `de_insult_stays_calm` first.
3. **Not chosen:** Gemini 3.7 (switched off 28.01.2027), Gemini 3.1 Flash-Lite for the chat (58/65),
   Gemini 4 Argon (6.5–10 s per turn, 2.7× the price, 5.3× from December).

## Consequences

- Before 19.11. the owner sets the variable and watches `llm_calls` for 7 days (refusals,
  `first_token_ms`, `total_ms`, #652). The chat's first words move from ~1.6 s to ~3.4 s p50
  unless the prompt diet (F3/F5) or Priority PayGo (×1.8 price) wins it back.
- #758 stays open until a non-Vertex provider is measured; the code path of #781 (calm line when
  the distress check finds nothing) keeps working on any provider.
- The owner provides, for one candidate: key + EU data residency + DPA, and ≈ $3–4 eval budget
  (`provider-2026-10.md`, last section). Adding it as a processor in `docs/privacy.md` and
  `docs/dpia.md` is the owner's legal call.
