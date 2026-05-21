# LearnBuddy — docs

The code is the spec. These docs cover what the code can't: strategic
vision, design identity, legal compliance, the active build plan, and
the open backlog. If something here disagrees with the code, the code
wins — file an ADR and fix the doc.

## What lives here

**Reference (timeless):**

- [`01-product.md`](01-product.md) — strategic vision, user model, pricing, journeys
- [`09-privacy.md`](09-privacy.md) — DSGVO inventory + subprocessor list (legal evidence)
- [`DESIGN-BRIEF.md`](DESIGN-BRIEF.md) — visual identity + tone

**Live work + backlog:**

- [`AGENT-REBUILD-PLAN.md`](AGENT-REBUILD-PLAN.md) — the active build plan
- [`IDEAS.md`](IDEAS.md) — open features, mobile-polish backlog, salvaged design questions
- [`adr/`](adr/) — Architecture Decision Records (immutable)

**Operational:**

- [`SETUP-VERTEX.md`](SETUP-VERTEX.md) — one-shot GCP / Vertex setup reference

## What you won't find here

- API surface → `apps/api/src/routes/*.ts` + `packages/shared-types/`
- Database schema → `infra/supabase/migrations/`
- Prompts → `apps/api/src/prompts/`
- Screen tree → `apps/mobile/app/`
- Architecture diagram → the repo layout _is_ the diagram

If you want to know what something does, read the code. If you want to
know _why_ it was built that way, look in `adr/` first, then `git log`.

## Working conventions

- **Code, comments, identifiers, schema, prompts: English.** UI: German
  primary; English/French/Spanish/Italian wired through i18n.
- **Single LLM provider:** Gemini 2.5 Flash-Lite via Vertex AI in
  `europe-west3`. Provider behind one gateway in `apps/api/src/lib/llm/`.
- **Single DB:** Supabase Postgres in `eu-central-1`. RLS on every table.
- **Single hosting target:** Vercel (API), Supabase (data + storage),
  Expo EAS (mobile).
- **No web app, no admin web app.** Anything an administrator needs is a
  protected route in the mobile app.

## Core principles

1. **Cheap by default.** One LLM tier. Native on-device STT/TTS where
   possible. Practice variants client-side.
2. **Local-first evaluation.** Answer checked locally first; LLM called
   only when the local check is uncertain.
3. **Offline-first.** Studying works fully offline; capture needs network.
4. **Learner-first UX.** A nine-year-old uses the app without help.
5. **Account-holder-owned.** Adult holds the account, gives consent, pays.
6. **EU-resident.** All durable data + inference in EU regions.
