# LearnBuddy — instructions for Claude (Cowork / Claude Code)

> This file is loaded automatically. It encodes the rules that keep the codebase from drifting back into stub-and-scaffold land. **Read it before you touch any code.**

## Sources of truth

The code IS the spec. Schema lives in `infra/supabase/migrations/`,
types in `packages/shared-types/`, API in `apps/api/src/routes/`,
screens in `apps/mobile/app/`, prompts in `apps/api/src/prompts/`.
The docs below cover what the code can't: strategic vision, design
identity, legal compliance, live work, and open backlog.

- `docs/01-product.md` — strategic product vision (user model, pricing, journeys)
- `docs/09-privacy.md` — DSGVO inventory + subprocessor list (legal evidence)
- `docs/DESIGN-BRIEF.md` — visual identity + tone (timeless reference)
- `docs/AGENT-REBUILD-PLAN.md` — the active build plan
- `docs/IDEAS.md` — open features + mobile-polish backlog + salvaged design questions
- `docs/SETUP-VERTEX.md` — one-shot GCP setup reference
- `docs/README.md` — index
- `docs/adr/` — Architecture Decision Records (immutable)

If your change involves an irreversible architectural choice, write an
ADR. Code comments may still cite old "Doc 04 §…" tombstones; treat
those as "look it up in git history" markers — don't add new ones.

## Hard rules

1. **Never leave `notImplemented()` in a route you touched.** If you opened a file, you finish it or you don't open it.
2. **Never mock the database in tests.** Use a real Supabase local instance (`pnpm db:start` once it exists) or, if injecting deps in unit tests, mark the test file with a banner: `// requires live verification in Claude Code session`.
3. **Never use `any`.** TypeScript strict is non-negotiable. If you can't type it, the data model is wrong — fix the type, not the type-check.
4. **Never skip migrations.** A migration once merged is immutable. Need a change? New migration.
5. **Never hardcode demo data in production code paths.** Use mock data only inside `__fixtures__/` files referenced by tests.
6. **Never ship a screen with `useState('hardcoded')` as its primary content.** The skeleton was OK; the next touch wires it.
7. **Never use raw `<Pressable>` for a CTA button.** Always use `<Btn>` from `components/lb/`. Raw Pressables with inline `backgroundColor` bypass the design system and have broken the welcome screen CTAs repeatedly. `_layout.tsx` modals are not exempt — they must use `<Btn>` too.
8. **Never block user interaction with a transparent modal overlay.** Any `Modal` with a full-screen dismiss `Pressable` must be dismissible via an obvious, correctly-styled in-sheet button using `<Btn>`. The outer Pressable intercepts all taps on screens underneath it.
9. **Never put `backgroundColor` directly on `<Pressable>`.** In React Native, `backgroundColor` on `Pressable` silently fails to render in some versions (RN 0.73+). The `Btn` component already uses the correct pattern: `backgroundColor` lives on an inner `<View>` inside the `Pressable`, and the `Pressable` only holds `alignSelf` + `opacity`. Never revert this to put background styles on the Pressable itself — this is what caused the "white text on paper background, no button visible" bug that broke the welcome screen multiple times.
10. **Never remove `KeyboardAvoidingView` from `welcome.tsx`.** The CTA button must be pinned OUTSIDE the `ScrollView` and INSIDE a `KeyboardAvoidingView` (`behavior="padding"` on iOS, `"height"` on Android). Without this, the keyboard covers the CTA and users cannot submit the form. This has been broken and re-fixed multiple times — do not touch the layout structure of welcome.tsx without understanding this constraint.

## Required quality gates

**Run after every change** (the pre-commit hook enforces these — don't bypass with `--no-verify`):

```bash
pnpm typecheck   # all workspaces
pnpm lint
pnpm test        # at minimum the workspace you touched
```

If any gate fails, fix it before continuing. Don't pile work on a red bar.

## Work pattern — vertical slices

Resist horizontal sweeps ("implement all 14 routes"). Pick one vertical from `docs/AGENT-REBUILD-PLAN.md` (active work) or `docs/IDEAS.md` (open backlog), finish it, ship it.

A vertical slice is **done** when:

1. **Types** — input/output zod schemas exist in `packages/shared-types/src/`.
2. **Migration** — table exists in `infra/supabase/migrations/`. Already done for v1 of every entity.
3. **API** — handler implemented, returns the right shape, error codes correct.
4. **Test** — at minimum: happy path + one validation failure + one auth/permission failure. Vitest, Hono test client.
5. **Mobile** — the screen(s) that consume this endpoint actually call it. No stub buttons. TanStack Query for caching.

If any of those steps are missing, the slice is **not done** — even if `pnpm test` is green.

## Design system rules

LearnBuddy's UI is **not** flat slate-50 / blue-600 / shadcn. See `docs/DESIGN-BRIEF.md` and the `design-examples/` reference set. Soft pastel maximalism, iridescent backgrounds, italic display serif headlines, multi-pastel-tinted cards, black-pill primary CTAs, floating black capsule bottom-nav. If your first UI sketch looks like every other AI-generated React Native app — discard and re-read.

Tailwind / NativeWind tokens live in `apps/mobile/tailwind.config.js` and `apps/mobile/lib/theme/colors.ts`. Extend them, don't ad-hoc-hex values inside components.

## Tone & copy rules

- German default. English/French/Spanish/Italian must exist for all i18n keys.
- **Never harsh.** "Fast richtig — fehlt nur noch …" beats "Falsch!"
- Never show count of "due items" or "missed days" to the **learner**. Account holders may see weekly minutes / streak / mastered topics in admin only.
- Voice/tone scales by profile age (minor profiles get the warmer, slower variant).

## Folder conventions

- `apps/api/src/routes/*.ts` — one file per resource. Real handlers, not re-exports of stubs.
- `apps/api/src/routes/__tests__/*.test.ts` — colocated tests. Vitest + Hono test client.
- `apps/api/src/lib/*.ts` — cross-cutting (supabase client, llm gateway, idempotency, cost).
- `apps/mobile/lib/api/*.ts` — typed fetch wrappers that return zod-validated shared-types.
- `apps/mobile/lib/auth/*.ts` — token storage (expo-secure-store), refresh logic.
- `apps/mobile/components/lb/*.tsx` — design system primitives.
- `infra/supabase/migrations/NNNN_*.sql` — numbered, monotonic. Never edit a merged one.

## Anti-patterns we've already paid for

- Routes that say `notImplemented()`. Audit: 14 of them. Replace, don't add to the count.
- Screens with `useState('x = 4')` as the visible answer (see `session/[sessionId].tsx`). Wire it.
- "kommt in Schritt 14" copy in `capture.tsx`. Either implement or delete the file.
- Empty `infra/supabase/functions/` folder. Edge functions are real ship requirements (photo-wipe, RevenueCat reconcile, DSGVO worker).

## When you genuinely don't know

Stop, ask, document. Don't fabricate. The user has been burned by tools that confidently ship half-built things.

If a flow looks ambiguous, check `docs/IDEAS.md` (Part 3) for salvaged open design questions before inventing a design. Surface the ambiguity rather than silently shipping one interpretation.
