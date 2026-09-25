# LearnBuddy — instructions for Claude (Cowork / Claude Code)

> This file is loaded automatically. It encodes the rules that keep the codebase honest.
> **Read it before you touch any code.**

## What this is

LearnBuddy is a proactive learning companion ("Buddy"): it gets to know the learner, keeps
context, prepares practice, thinks ahead and reaches out at sensible moments — while the learner
sees one calm screen. Minimal surface in front, explicit modules behind; the system carries the
complexity.

## Sources of truth

Cite the relevant section in commit messages and PR bodies (e.g. `docs/architecture.md §Delivery`).

- `docs/buddy/01-prinzip-und-diagnose.md` — the Buddy principle, needs vs. grown complexity, why the rebuild
- `docs/adr/0004-proactive-buddy.md` — the decision (modular monolith, fresh start)
- `docs/architecture.md` — modules, API, decisions, tools, proactivity, delivery, limits, testing
- `docs/privacy.md` — data, retention, minors, export/deletion, processors
- `docs/DESIGN-BRIEF.md` — how the product must feel (still valid)
- `docs/UX-PRINCIPLES.md` — hide system complexity, keep understanding and control (intent → result; examples, not feature catalogs; progressive disclosure; undo over confirmation)
- `docs/SETUP-VERTEX.md` — model setup
- `docs/legacy/` — the previous app's specs and audits: history, **not** requirements

If a change diverges from these docs, update the doc in the same change or write an ADR.

## Hard rules

1. **The model interprets and plans; code enforces.** Permissions, tenant isolation, time rules,
   versions, contact rules and limits live in code (`modules/buddy/tools.ts`, `policy.ts`,
   `apply.ts`), never only in a prompt.
2. **The model never writes ids, dates or instants.** Aliases (`g1`, `st2`, `m3`, `f1`) and
   DaySpec/UntilSpec, resolved server-side in the learner's zone. Clock-change ambiguities are
   rejected, not guessed.
3. **No word lists or hardwired answers as fake language understanding**, no test-data special
   cases. Decisions come from structured model output validated with zod, or from explicit taps.
4. **Every model decision is applied atomically behind the context fence** (`context_version`).
   Anything a decision depends on bumps it (`bumpContext`) in the same transaction.
5. **Never claim what isn't proven.** Delivery status only from provider tickets/receipts; "opened"
   only from the app; an uncertain external result is never repeated blindly. The UI shows
   planned / prepared / done / confirmed as different states.
6. **Contact is opt-in; Buddy can only reduce it.** For minors, loosening needs the adult's PIN
   (server-side admin token). Never show counts of due items or missed days to learners.
7. **One clock.** Code uses `deps.now()`; SQL never decides "due" with `now()`; rows whose
   timestamps drive behaviour get `created_at` from the app clock.
8. **Never mock the database.** Integration tests run on a real Postgres (`apps/api/src/testing/`);
   only the outside world (model, push, auth, storage) is replaced. A file that injects fakes
   carries the banner `// requires live verification in Claude Code session`.
9. **Never use `any`.** TypeScript strict.
10. **Migrations are immutable once merged.** The baseline is `infra/supabase/migrations/0001_baseline.sql`
    (fresh start, ADR 0004); every change after it is a new numbered migration.
11. **No demo data in production code paths.** Fixtures and scripted scenarios live in `src/testing/`.
12. **Never leave a stub** (`notImplemented`, "kommt später" copy, buttons without a handler). Finish it or don't ship it.
13. **CTAs are `<Btn>`** from `apps/mobile/components/lb/`; never a raw `<Pressable>` CTA and never
    `backgroundColor` on a `Pressable` (put it on an inner `View`).
14. **Every modal is closable by an obvious in-sheet `<Btn>`** (see `components/lb/Sheet.tsx`).
15. **Screens with a form pin the CTA outside the `ScrollView`, inside a `KeyboardAvoidingView`**
    (`behavior="padding"` on iOS, `"height"` on Android) — `app/welcome.tsx` is the reference.

16. **Simplicity is the first rule.** Buddy is the interface: the learner talks, taps a suggestion
    or takes a photo — no dashboards, tile grids, lists or forms to learn. Anything complex is
    handled behind Buddy (tools, defaults, the conversation). A new feature first asks "can Buddy
    do this in the chat?"; a new screen, menu or setting needs a reason it cannot. Parents' and
    rare settings stay closed until opened. Check new UI against `docs/UX-PRINCIPLES.md` §31–32.

## Required quality gates

Run after every change (the pre-commit hook enforces them — never `--no-verify`):

```bash
pnpm typecheck
pnpm lint
pnpm test        # API integration tests need a local Postgres 16 (LB_TEST_DATABASE_URL)
```

Browser walkthrough of the real app against the real API (scripted model):
`scripts/web-walkthrough.sh` (see `docs/architecture.md` §Testing).

## Work pattern

Build vertical and finish: contract (`packages/shared-types/src/contracts/`) → migration (if
needed) → module code → integration test incl. failure paths (duplicates, stale context,
interruption, outage, other learner's ids) → screen wired to the endpoint → doc updated.

## Design system

Light, friendly, calm — not childish, not clinical (`docs/DESIGN-BRIEF.md`). "Pastell Soft":
pastel pink · lilac · blue light (`components/lb/Glow.tsx`), a violet accent, Buddy as a soft orb
(`components/lb/BuddyOrb.tsx`). Tokens in `apps/mobile/lib/theme/colors.ts`, `type.ts` (one bold
sans headline per screen) and `shadow.ts`;
extend them instead of ad-hoc hex values. Same action → same component. Touch targets ≥ 44 pt,
labels and roles on everything interactive, never color as the only signal.

## Tone & copy

- German default; English, French, Spanish, Italian for every key (`apps/mobile/lib/i18n/__tests__/parity.test.ts`).
- Never harsh: "Fast richtig — fehlt nur noch …" beats "Falsch!".
- Lock-screen texts carry no scores or personal details.

## Folder conventions

- `apps/api/src/modules/<module>/` — `identity`, `buddy`, `materials`, `practice`, `scheduler`
  (routes.ts + services); `src/llm/` model seam; `src/lib/` db, time, errors; `src/testing/` test harness, fakes, dev stack.
- `apps/api/src/__tests__/*.int.test.ts` — integration tests on real Postgres; unit tests next to the code in `__tests__/`.
- `apps/mobile/app/` — expo-router screens; `components/lb/` design system; `components/<area>/` screen parts;
  `lib/api/` typed endpoints + queries; `lib/auth/` session and Supabase Auth; `locales/<lang>/<namespace>.json`.
- `infra/supabase/migrations/NNNN_*.sql` — numbered, monotonic.

## When you genuinely don't know

Stop, ask, document. Don't fabricate. The user has been burned by tools that confidently ship
half-built things; say plainly what is verified and what is not.
