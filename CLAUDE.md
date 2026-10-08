# LearnBuddy — instructions for Claude

> Loaded automatically. Read it before you touch any code. Each rule appears once; details live
> in the linked docs and are enforced by the guards in `docs/engineering-guards.md`.

## What this is

LearnBuddy is a proactive learning companion ("Buddy") for school children: it gets to know the
learner, keeps context, prepares practice from her own material, thinks ahead and reaches out at
sensible moments — while she sees one calm screen. Minimal surface in front, explicit modules
behind; the system carries the complexity.

## Sources of truth

Cite the relevant section in commits and PRs (e.g. `docs/architecture.md §Delivery`). A change
that diverges from these docs updates the doc in the same change, or comes with an ADR.

| Doc                                             | What it decides                                                                   |
| ----------------------------------------------- | --------------------------------------------------------------------------------- |
| `docs/buddy/01-prinzip-und-diagnose.md`         | the Buddy principle; §1.1 the five USP points every PR names                      |
| `docs/adr/`                                     | decisions (0004: modular monolith, fresh start)                                   |
| `docs/architecture.md`                          | modules, API, tools, proactivity, delivery, limits, testing                       |
| `docs/privacy.md`, `docs/dpia.md`               | data, retention, minors, export/deletion; risks and measures                      |
| `docs/DESIGN-BRIEF.md`, `docs/UX-PRINCIPLES.md` | how it must feel; intent → result, progressive disclosure, undo over confirmation |
| `docs/engineering-guards.md`                    | every CI guard, what it catches, its Ausnahmeliste                                |
| `docs/SETUP-VERTEX.md`                          | model setup                                                                       |
| `docs/legacy/`                                  | the previous app — history, **not** requirements                                  |

## How we work

1. **Owner feedback becomes an issue first** (owner rule 28.09.). Every critique, bug report or
   idea gets a GitHub issue in `0xKurt/LearnBuddy` with the quote and date, the verified cause, a
   plan and acceptance criteria — before any work. Done work is documented on the issue with
   proof, then closed. A one-liner fixed and proven in the same minute may go first, but still
   gets its issue.
2. **Decide, don't ask, where evidence can decide** (owner 04.10.: "Frage nicht was ich will,
   sondern was das beste für die App, den Lernerfolg und für die Kinder ist"). Research, weigh,
   recommend. Ask only for what is genuinely the owner's call (cost, legal, product direction),
   with the question tool.
3. **Branch from `main`, merge as soon as CI is green** (Engineering-Regel 8). No stacked
   branches, no collecting finished PRs.
4. **One push per PR round** (#321): check locally, then push. Vercel builds no previews for
   `claude/**`; production comes only from `main`.
5. **Migrations reach production before the code that needs them.** Apply the new numbered
   migration to the production database, merge, then check `/v1/health` (`migrations.missing` is
   empty). Take the next free number on `main` right before committing.
6. **When you genuinely don't know: stop, ask, document.** Never fabricate. Say plainly what is
   verified and what is not.

## Testing

- **Test what you built, not everything** (owner 05.10.). Per change: the hooks plus the specs of
  the screens you changed (for the before/after images).
- **The whole app is tested once, at the end** (owner 05.10., #387): when everything is built, the
  full browser walkthrough runs back to front, with the screenshot folder.
- **Hooks are never skipped** (`--no-verify` is forbidden). Pre-commit: typecheck, lint, guards,
  tests, bundle smoke. Pre-push: the full suite, not repeated only when the tree of every pushed
  commit already passed that same full run in this worktree (#455,
  `docs/engineering-guards.md` §Pre-Push); anything unclear runs it.
- Integration tests run on a real Postgres (`LB_TEST_DATABASE_URL`, hard rule 8); specs are
  order-independent and nothing is "flake" before its cause is proven (Engineering-Regel 7).
- **Show red before green.** A fix or guard comes with a test that fails without it.

```bash
pnpm typecheck && pnpm lint && pnpm test   # what the hooks run
scripts/web-walkthrough.sh <specs>          # browser walkthrough (real app, real API, scripted model)
pnpm verify                                 # all four — the final full run
```

## Hard rules

Numbers are stable: code and docs cite them ("CLAUDE.md rule 16"). New rules are appended.

**Model, data, time**

1. **The model interprets and plans; code enforces.** Permissions, tenant isolation, time rules,
   versions, contact rules and limits live in code (`modules/buddy/tools.ts`, `policy.ts`,
   `apply.ts`), never only in a prompt. Grading a practice answer is code wherever code can be exact.
2. **The model never writes ids, dates or instants.** Aliases (`g1`, `st2`, `m3`) and
   DaySpec/UntilSpec, resolved server-side in the learner's zone. Clock-change ambiguities are
   rejected, not guessed.
3. **No word lists or hardwired answers as fake language understanding**, no test-data special
   cases. Decisions come from structured model output validated with zod, or from explicit taps.
4. **Every model decision is applied atomically behind the context fence** (`context_version`).
   Anything a decision depends on bumps it (`bumpContext`) in the same transaction.
5. **Never claim what isn't proven.** Delivery only from provider receipts; "opened" only from the
   app; an uncertain external result is never repeated blindly. The UI keeps planned / prepared /
   done / confirmed apart and never shows a state that is no longer true.
6. **Contact is opt-in; Buddy can only reduce it.** Under 16, loosening needs the adult's PIN.
   Never show learners counts of due items or missed days.
7. **One clock.** Code uses `deps.now()`; SQL never decides "due" with `now()`; rows whose
   timestamps drive behaviour get `created_at` from the app clock.
8. **Never mock the database.** Integration tests run on a real Postgres (`apps/api/src/testing/`);
   only the outside world (model, push, auth, storage) is replaced. A file that injects fakes
   carries `// requires live verification in Claude Code session`.
9. **Never use `any`.** TypeScript strict.
10. **Migrations are immutable once merged.** Baseline `0001_baseline.sql`; every change is a new
    numbered migration.
11. **No demo data in production code paths.** Fixtures and scripted scenarios live in `src/testing/`.
12. **Never leave a stub** — no `notImplemented`, no "kommt später" copy, no button without a handler.

**The screen**

13. **CTAs are `<Btn>`** from `components/lb/`; never a raw `Pressable` outside `components/lb`,
    never `backgroundColor` on a `Pressable` (put it on an inner `View`).
14. **Every modal closes with an obvious in-sheet `<Btn>`** (`components/lb/Sheet.tsx`).
15. **Forms pin the CTA outside the `ScrollView`, inside `<KeyboardSafe>`** (`app/welcome.tsx` is
    the reference). Never a direct `KeyboardAvoidingView`: Android resizes the window itself, and a
    second `behavior="height"` leaves an empty band under the bar (#46).
16. **Simplicity is the first rule.**
    - Buddy is the interface: she talks, taps a suggestion or takes a photo — no dashboards, tile
      grids, lists or forms to learn. A new feature first asks "can Buddy do this in the chat?";
      a new screen, menu or setting needs a reason it cannot. Parents' and rare settings stay
      closed until opened (`docs/UX-PRINCIPLES.md` §31–32).
    - **No scrolling to find what matters:** every screen fits 390×844 and 360×740; only a
      conversation or a browsed list scrolls (`tests/web/fit.ts`). Nothing is shown half — an
      element is whole or not drawn.
    - **Every route is on an allowlist** with a one-line reason the chat cannot carry it (`ROUTES`
      in `apps/mobile/lib/__tests__/minimalism.test.ts`).
    - **Practice forms never get a picker:** no screen lists two or more side by side, no request
      carries an `ItemKind` (`contracts/__tests__/forms.test.ts`). Buddy or code picks the form.
    - Every PR names the USP point it serves (`docs/buddy/01-prinzip-und-diagnose.md` §1.1).
17. **Look at your own screenshots like a designer** (#287). Shoot every changed screen at
    360×740 and 390×844, light and dark; critique empty voids, two-line titles, clipped or doubled
    elements, a new card style or accent where an existing one would do, grey noise, hard edges.
    Revise and shoot again. The PR carries a before/after image and the screen next to related
    ones — no UI change reaches the owner without one. Header titles stay on one line.

**Added later**

18. **Safeguarding is a code path wherever she writes free text** (chat, practice tutor, roleplay):
    distress gets the fixed help answer by age (`i18n/safeguarding.ts`), never model words (#389).
19. **Same function → same component, same place, everywhere** (owner 04.10.). One text input in
    the whole app (`InputBar`, #365). In practice the answer sits at the bottom, directly above the
    bar, and "Prüfen" is the bar's action (#386, #395; `answerShell`/`oneBar`/`oneInput` tests).
    One control per function, in the same place in chat and practice. No new icon, toggle or
    pattern where one exists.

## Engineering-Regeln (#313)

Production-ready is the bar (owner 04.10.): clean, modular, reusable, consistent, testable,
maintainable. The developer (Claude) owns code quality, not the owner. Mechanical checks are
guards (`docs/engineering-guards.md`); today's debt sits on Ausnahmelisten that only shrink.
Numbers are stable, as above.

1. **Library before own build.** A new display, interaction or infrastructure building block
   starts with a library check in the issue (licence, React Native path, size, maintenance, a11y).
   New drawing components need an entry in `tools/guards/drawing-registry.json`.
2. **Foundation before feature.** Use the shared building blocks (shell, tile, listen button, card
   with figure, `<Btn>`, tokens). If one is missing, build it first.
3. **No copies.** Same behaviour, one implementation; the second use extracts it (jscpd). No
   wrapper without real value, no parallel pattern next to an existing convention.
4. **Small units.** At most 600 lines per app file, 800 in the backend (without blanks and
   comments); one job per file, component, function or module.
5. **Only tokens.** Spacing, type, radii and colours from `lib/theme`; an exception carries
   `// token-exempt: <reason>`.
6. **Design in comparison.** Every visible change is shown next to related screens; the same thing
   must look the same.
7. **Tests are order-independent.** Every spec brings its own scenario. A failure is never "flake"
   or "load" before its cause is proven.
8. **Short branches, merged the same day** (#328, `tools/guards/fresh-base.mjs`). Parallel jobs
   never touch the same file; splitting it is its own step first.
9. **Proven means proven.** Live and device gaps stay in the PR and as an issue until closed.
10. **Integration responsibility.** With parallel work the orchestrator checks coherence with the
    rest of the app before every merge.

**Before you build:** Is there a component, hook or function to reuse? Logic to centralise? Will
this duplicate something? Is it small and single-purpose? Does it fit the architecture? Is there a
simpler way without losing quality? Think through errors, edge cases, loading and empty states.

**Before you finish:** review your own diff for duplicates, needless complexity, oversized
components, repeated logic, dead or now-obsolete code, inconsistent patterns and missed reuse —
and fix them in the same change.

**Every PR names** the USP point, what it reused and what it removed, and the library check
(`tools/guards/pr-body.mjs`). Ausnahmelisten (`tools/guards/baselines/` and the lists inside the
guard tests) never grow silently: growth needs `Ausnahmeliste-Zuwachs: #<issue> <reason>` in the
commit; after a refactor `pnpm guards:shrink` pulls them down.

**Work pattern:** contract (`packages/shared-types/src/contracts/`) → migration → module code →
integration test incl. failure paths (duplicates, stale context, interruption, outage, other
learner's ids) → screen wired to the endpoint → doc updated.

## Design system

Light, friendly, calm — not childish, not clinical. "Pastell Soft": pastel pink · lilac · blue
light (`components/lb/Glow.tsx`), a violet accent, Buddy as a soft orb (`BuddyOrb.tsx`). Colours
live in `lib/theme/palettes.ts` and reach a screen only through `useTheme()` — importing
`lib/theme/colors.ts` in `app/` or `components/` is a lint error (#29). One bold sans headline per
screen (`type.ts`); one spacing scale (`space.ts`: xs 4 · sm 8 · md 12 · lg 16 · xl 24, #64).
Touch targets ≥ 44 pt (`TOUCH`), labels and roles on everything interactive, never colour as the
only signal.

## Tone & copy

- German default; English, French, Spanish, Italian for every key (`lib/i18n/__tests__/parity.test.ts`).
- Never harsh: "Fast richtig — fehlt nur noch …" beats "Falsch!". Feedback is about the task,
  never the person.
- Lock-screen texts carry no scores or personal details.

## Folder conventions

- `apps/api/src/modules/<module>/` — `identity`, `buddy`, `materials`, `practice`, `scheduler`
  (routes.ts + services); `src/llm/` model seam; `src/lib/` db, time, errors; `src/testing/`
  harness, fakes, dev stack.
- `apps/api/src/__tests__/*.int.test.ts` — integration tests on real Postgres; unit tests next to
  the code in `__tests__/`.
- `apps/mobile/app/` — expo-router screens; `components/lb/` design system; `components/<area>/`
  screen parts; `lib/api/` typed endpoints and queries; `lib/auth/` session; `locales/<lang>/`.
- `infra/supabase/migrations/NNNN_*.sql` — numbered, monotonic.
- `tests/web/` — browser walkthrough specs; `tools/guards/` — CI guards.
