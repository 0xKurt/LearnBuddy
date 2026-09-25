# LearnBuddy

A proactive learning companion. The learner tells Buddy what's coming up and photographs their
worksheets; Buddy keeps track, prepares short practice, follows up at sensible moments and
adapts to feedback — on one calm screen, without pressure.

- Why and how: [`docs/buddy/01-prinzip-und-diagnose.md`](docs/buddy/01-prinzip-und-diagnose.md) (German),
  [`docs/adr/0004-proactive-buddy.md`](docs/adr/0004-proactive-buddy.md)
- Architecture: [`docs/architecture.md`](docs/architecture.md) · Privacy: [`docs/privacy.md`](docs/privacy.md)

## Workspace

- `apps/api` — Hono API on Node (Vercel), direct Postgres, Vertex AI (Gemini, EU), Expo push
- `apps/mobile` — Expo SDK 54 / React Native app (one Buddy screen + practice, capture, memory, settings)
- `packages/shared-types` — zod contracts shared by API and app (`@learnbuddy/shared-types/contracts`)
- `packages/shared-math` — numeric/short-answer normalisation for rule-based checks
- `infra/supabase/migrations` — the schema (`0001_baseline.sql`, `0002_scheduler.sql`)

## Develop

```bash
pnpm install
pnpm typecheck && pnpm lint && pnpm test
```

API integration tests run against a real Postgres 16 on `127.0.0.1:5432` (user/password
`postgres`, or set `LB_TEST_DATABASE_URL`); each test file gets its own throwaway database built
from the real migrations. Without Postgres they are skipped locally (`LB_REQUIRE_TEST_DB=1`
makes that a failure, as in CI).

Run the API (`apps/api/.env.local`, template `apps/api/.env.example`):

```bash
pnpm --filter @learnbuddy/api dev
```

Try the whole app in a browser without Supabase or a model account (real API and scheduler,
stand-ins for auth/storage, scripted model answers):

```bash
scripts/web-walkthrough.sh          # builds the web app and runs tests/web in Chromium
pnpm --filter @learnbuddy/api dev:stack   # or just the stack, on http://localhost:8787
```

Mobile app: `pnpm --filter @learnbuddy/mobile start` (template `apps/mobile/.env.example`).

## Deploy (fresh start)

1. Reset the Supabase database and apply `infra/supabase/migrations` (ADR 0004 §Transition).
2. In Supabase Vault set `lb_api_url` (`https://<api>/v1`) and `lb_tick_secret` (= `TICK_SECRET`):
   pg_cron then calls `POST /internal/tick` every minute.
3. Configure the API environment (`apps/api/.env.example`); `GET /health` must report the
   scheduler as running.

## Rules

`CLAUDE.md` — hard rules for anyone (human or AI) changing this repo. The pre-commit hook and CI
run typecheck, lint and tests; never bypass them.

## License

Proprietary — see `LICENSE`.
