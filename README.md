# LearnBuddy

AI-powered learning companion. Pastel-maximalist UX, German-first, photo → AI
question generation → adaptive review.

See `docs/` for the full spec — `01-product.md` is the entry point.

## Quickstart

```bash
pnpm install
pnpm typecheck
pnpm lint
pnpm test
```

Run the API locally:

```bash
pnpm -F @learnbuddy/api dev
```

Run the mobile app (Expo, requires Xcode/Android Studio):

```bash
pnpm -F @learnbuddy/mobile start
```

## Workspace layout

- `apps/api` — Hono on Vercel (Node 22, fra1)
- `apps/mobile` — Expo SDK 54 / React Native
- `packages/shared-types` — Zod schemas shared between API and mobile
- `packages/shared-math` — MathLite parser, numeric normalize, units
- `infra/supabase/migrations` — numbered, monotonic SQL migrations
- `infra/supabase/functions` — Edge Functions (Deno)

## Required quality gates

The Husky pre-commit hook runs `pnpm typecheck && pnpm lint && pnpm test` plus
an `expo export ios` bundle smoke. CI (`.github/workflows/check.yml`) does the
same on every PR. Do not bypass with `--no-verify`.

## Documentation

- `CLAUDE.md` — rules for AI assistants editing this repo (also useful for
  humans new to the codebase).
- `docs/04-api.md` — the API contract. Cite the relevant section in commit
  messages.
- `docs/CODEBASE-AUDIT.md` — current state, gaps, priorities.
- `docs/IMPLEMENTATION-PLAN.md` — slice-by-slice build order.

## License

Proprietary — see `LICENSE`.
