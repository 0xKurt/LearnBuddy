# Mobile redesign migration

Tracking: [#548](https://github.com/0xKurt/LearnBuddy/issues/548). Target: `apps/mobile`.

## Authority and decisions

The October 2026 design package is `~/Downloads/UIUX Design Audit LearnBuddy/`.
Read `HANDOFF.md`, `implementation/MIGRATION.md`, `implementation/README.md`, then
`readme.md`. HTML and JSX are visual references, not production sources. Only the
implementation theme/component TypeScript and `assets/figures/**` may be copied.

Owner decisions, 11 October 2026:

- Use the supplied `implementation/lib/theme/space.ts` values: gutter16 throughout,
  card padding12/16/24, rhythm8/12/24. These supersede the contradictory gutter20
  and card20 statements elsewhere in the package.
- Reduced motion disables all transitions, including cross-fades. This supersedes
  the earlier cross-fade policy in issue126. The existing Orb/moon choreography
  and its explicit heartbeat policy remain unchanged as separately requested.
- The explicitly required Figtree package may ship under its declared
  `MIT AND OFL-1.1` licence, with its full notice. This is a package-specific
  exception to the older dependency licence policy, not a general OFL allowance.
- Follow the supplied design and request throughout the migration. Keep existing
  domain contracts, canonical identifiers and actual application flows.

Figtree, the eight palette looks, semantic color roles and all presentation values
belong in `lib/theme`. Compatibility names remain aliases until the last screen is
migrated, then are removed in a separate PR. Composite components receive state
and variants as props; screen behavior stays at callers. Copy comes from locale
namespaces, German first. Keep `BuddyOrb` and moon choreography; adjust header size
and footprint only. Touch targets remain at least44 pt.

Reference-only sample content is not app data. Existing schematic contracts allow
at most six labels; the reference's discussion of eight or nine labels does not
expand that contract. Capture continues through the existing attachment flow.

## Delivery sequence

Each row is a separate PR unless it explicitly describes a group of screen PRs.
Branch from current main, pass the local gates and CI, review the rendered result,
then merge before beginning the next dependent change.

| Step                   | Files and replacements                                                                                                                                                                               | Status      |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| 1 Theme                | `lib/theme/*`, `app/_layout.tsx`, mobile manifest/lockfile, licences and tests; minimal input-font wiring, live motion subscription and LookChoice touch fix. No component replacement.              | Merged #549 |
| 2 Base                 | `components/lb/`: Btn, IconBtn replacing CircleBtn, Chip, Card, Field adapting LbTextInput, ListGroup/Row, Sheet, Segmented, Progress. Existing callers remain compatible.                           | In review   |
| 3 Header and composer  | BuddyHeader replaces Screen/buddy header composition; Composer replaces InputBar/CheckBar presentation with one voice/send/check/next primary slot. Preserve voice, drafts, attachments and retries. | Pending     |
| 4 Practice             | Option replaces AnswerTile; QuestionCard; all current answer forms use shared states and tokens. Keep answer payloads and evaluation behavior.                                                       | Pending     |
| 5a Account             | Welcome, account errors, reset.                                                                                                                                                                      | Pending     |
| 5b Onboarding          | Consent, parent setup, voice, look, handover; individual screen PRs.                                                                                                                                 | Pending     |
| 5c Home and chat       | First visit, conversation, offers, undo and chat cards; individual screen PRs.                                                                                                                       | Pending     |
| 5d Talk                | Conversation mode and practice in voice.                                                                                                                                                             | Pending     |
| 5e Practice            | Practice route, zoom, completion, test results/time-up, homework, drill and speaking; individual screen/state PRs.                                                                                   | Pending     |
| 5f Material            | Capture, sheet questions, library, subject and empty/missing states; individual screen PRs.                                                                                                          | Pending     |
| 5g Personal            | Memory, history and profile; individual screen PRs.                                                                                                                                                  | Pending     |
| 5h Settings            | Settings, voice, about, learning times, PIN; individual screen/sheet PRs.                                                                                                                            | Pending     |
| 5i Other surfaces      | Start sheet, roleplay, rehearsal, system states and overflow menu; individual surface PRs.                                                                                                           | Pending     |
| 6 Figures and licences | Image assets, data anchors in schematics, SVG number/leader/hit overlays, existing licence sheet plus every figure and part attribution.                                                             | Pending     |
| 7 Alias removal        | Remove compatibility keys/components only after no migrated caller depends on them.                                                                                                                  | Pending     |

## Validation

Before each step, announce the files and replaced components. Each PR records its
changes, open follow-ups, new tokens and verified checks. Run typecheck, relevant
tests and the repository hooks; never bypass hooks. Compare changed screens with
`ui_kits/app/index.html` in a browser at360×740 and390×844, Pastell and another family,
light and dark. Check reduced motion and minimum targets. At completion run the
full walkthrough once and inspect the screenshot folder.

The existing PostgreSQL14 on the development machine cannot run the ICU database
setup used by integration tests. For this migration a separate local PostgreSQL16
instance on port15432 runs the test harness. Scope `LB_TEST_DATABASE_URL` to test
commands; never substitute production connection settings.

## Step notes

### Step 1 — theme foundation

Changes: Figtree loads before the splash handoff with five bundled weights. Existing
look colors remain intact; new foreground/boundary roles are covered by contrast
checks. Supplied typography, radii and spacing feed existing callers through
compatibility aliases. Two temporarily unused motion exports are explicitly retained
by the narrow `redesign-theme-compatibility-548.json` guard grant; remove the grant
with the final alias cleanup. The motion preference is live, protects against stale
startup reads and disables entrance fades as well as movement. Input fonts retain
the existing geometry. The appearance switch retains its visual size with an
accessible minimum touch target.

New tokens: the five Figtree faces, `TYPE.input`, `TYPE.code`, `TYPE.meta`,
`RADIUS.sm/md/lg`, `onPrimary`, `hairlineStrong`; updated durations140/220/420 ms
and the supplied easing. Existing semantic values remain in their theme modules.

Review evidence: font assets load and the email field renders Figtree. Pastell and
Meer, light/dark, were inspected at360×740 and390×844. Browser regressions exercise
the actual running preference change, not only mocked animation builders. The
repository commit gate records typecheck, lint, guards, the full test suite and
iOS/Android bundle exports. Native OS setting changes and physical microphone/
camera behavior still need device evidence.

Still open: base components, header/composer, practice components, each screen,
figures and their attributions, and the final dedicated alias removal PR.
