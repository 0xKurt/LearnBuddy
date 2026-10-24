# Child explorer (#944)

The product under test is unchanged. This is a local, paid evaluation harness on a throwaway
copy of the shared Postgres schema. Follow `docs/architecture.md` §Testing/Turns/Delivery,
`CLAUDE.md` rules 1, 5, 6, 8 and 18. Never use a hosted database.

```sh
export PATH=/opt/homebrew/opt/node@22/bin:$PATH
export LB_TEST_DATABASE_URL=postgres://postgres@127.0.0.1:54316/postgres LB_TEST_MAX_WORKERS=2
set -a; . /Users/kurt/git/LearnBuddy/apps/api/.env.local; set +a
export EXPLORE_USD_PER_EUR=1.1193 # ECB 2026-10-23, record the date/source with the run
pnpm eval:explore --owner        # fixed owner regressions, intentional nonzero exit on findings
pnpm eval:explore                # eight personas × three consecutive sessions
pnpm eval:explore --smoke        # two goals rotated by build SHA
pnpm eval:explore --verify-photo # six fresh material/ready-card checks in German and Italian
# Replay a retained hard finding from an earlier session; no new actor improvisation:
EXPLORE_REPLAY_INVARIANT=text.code-fence pnpm eval:explore --replay ../../docs/measurements/explore/verified-2026-10-24/dictating-with-picture.json
pnpm eval:explore:release        # fixed + rotating + device/audio; required before APK creation
```

Each command sources `scripts/test-lock.sh`. On 24 October this worktree still had its older
single-slot version; execution first sourced the updated three-slot implementation from the
root checkout, then this script. No lock was bypassed or changed. Future runs use the merged
machine-lock implementation. `LB_TEST_MAX_WORKERS=2` remains set.

Defaults: five actions per session (configurable 3–12), 35 minutes (at most 60), $12
(at most $15). Set `EXPLORE_MAX_USD`, `EXPLORE_MAX_STEPS`, `EXPLORE_MAX_MINUTES`, `EXPLORE_OUT`.
Budgets are per invocation: the operator must subtract earlier batches from the authorised total.
An additional shared ledger is opt-in: set `LB_BUDGET_LEDGER` to its file path.
Both runners append only when configured; write errors emit a warning and preserve the run result.
For an authorised paid batch under the shared brief, explicitly set
`LB_BUDGET_LEDGER="$HOME/.local/share/learnbuddy-agents/BUDGET-LEDGER.md"`.
Every completed or interrupted run writes an explicit verdict and costs; the wrapper reserves a
conservative three-attempt byte/token ceiling before each provider call. Unknown bills keep the
reservation. `budget.json` journals reservations before sending and receipts after settlement, even if a later process failure prevents the final report. Receipts include reasoning and background calls. Reports distinguish cached-price
estimates from the conservative ceiling; neither is a provider invoice. Never start two paid
invocations whose combined ceilings exceed the remaining authorisation.

## Separation of responsibilities

- **Actor**: a different EU-listed model, verified by the project model-list endpoint. It sees
  only message text, visible offer labels and an open question, never answers, IDs, the Buddy
  system prompt, DB state or invariant results. Zod restricts messages, visible offer taps,
  practice answers, hints and abandonment. Only available controls enter its response schema.
- **Driver**: the real streaming message route, real offer action ID passed as
  `client_request_id` to `/practice/topic`, `/buddy/steps/:id/start` for prepared/announced cards, `/open`, answer/hint endpoints. Prepared cards are deduplicated by step and completed/closed cards are excluded. Photos reuse
  `evals/sheetPhoto.ts`; reminders use TestClock, `/v1/internal/tick` and the opened endpoint.
  Duplicate sends/taps reuse IDs. A photo goal requires a started item belonging to that uploaded material, including a merge target. Background work settles before state inspection.
- **Checker**: separately reads persisted rows and paginated history from a newly created API
  client after each action. Goal checks inspect API cards, sessions and items. A final helper
  probes any visible offer the actor has not opened within the action ceiling. Failure to probe
  every offer is incomplete coverage, never success.
- **Judge**: `grade10/judge.ts` boolean schema and reversed second reading; disagreements plus a
  fixed human sample. It cannot modify a code verdict or the release result. Frustration and
  self-reported success remain observations.

## Fixed corpus and precise predicates

`cases.ts` covers all nine owner cases plus two `asks/learning.ts` wants and a photographed
worksheet. The pilot maps these twelve goals twice onto eight personas, three sessions each;
no free cases (0%, below the 10% ceiling). Fixed initial requests are translated into the persona locale, so the requested count, direction and reminder delay match the predicate even when the actor later improvises or abandons. A persona keeps the same learner and DB throughout.
Replay starts from a fresh DB and reruns the full recorded causal prefix, never another actor.
Failures are grouped by invariant + kind + route and repeated three times; identical source scripts share the same three fresh replays across their invariants, recorded with `script`/`reused` fields; report both numerator
and denominator, including simulator divergence. A single evidenced hard violation stays visible.

Text rules detect backtick/tilde fences, Unicode box drawing, `+---+` ASCII boxes, three-line stick figures and consecutive
pipe rows unless a Markdown table separator is present. Arithmetic, inline variables, coordinates
and Markdown tables have explicit counterexamples in tests. Internal identifiers include tool
names with underscores; ordinary words such as “remember” are not treated as leaked protocol.
Six-word system-prompt fragments compare whole Unicode tokens, not substrings inside words.

Vocabulary checks count distinct pairs and verify `kind`, `prompt_lang`, `lang`; requested
German→English must not silently reverse. Chat pairs are counted as visible list/table rows, not
as an exercise offer. Summary condensation checks a shorter text (below 85% of the previous response), allowing both prose and lists; it cannot
prove semantic usefulness. The advisory judge supplies that separate signal. Language detection
uses `franc-min` only on long prose with a clear score margin, excluding quoted/list content.
Short and mixed-language replies remain a documented blind spot, never a claim of complete
language validation. Server history checks do not prove the native viewport or talk-mode cache.

## Human review and candidate admission

Set `EXPLORE_HUMAN_LABELS` to a JSON array of
`{id, split: "calibration" | "holdout", reviewer, labelledAt, acceptable, judgeAcceptable}`.
At least 30 real human-labelled calibration cases and a disjoint holdout with both positive and
negative examples are required before judge reliability is considered measured. The harness
reports held-out false-alarm and miss rates; absent labels produce null rates and `ready:false`.
No synthetic labels are presented as human work. The tests use clearly labelled fixtures only.

`candidates.json` contains first-failing-prefix candidates plus initial state and required prior
history. This is prefix minimisation, not proof of deletion minimality. Nothing writes to the
established corpus automatically. Admission requires an independently checked expectation and a
named human or two distinct reviewers (`canPromote`). Human review should also remove irrelevant
prefix actions and rerun the reduced script before committing it to the corpus.

## Device gate

`.maestro/explorer/` contains back, theme persistence, mute persistence, talk→chat history,
notification open, offer double-tap and language-pack flows. `scripts/explore-device.sh` refuses
to touch a phone with existing ADB forwards. It installs an **existing** development APK with
`adb install -r`; no native build is invoked. The dev app must be configured for an isolated local
stack on 8794 and Metro on 8094, with `EXPO_NO_DOTENV=1` so real credentials cannot win.

The OS notification is deliberately a local dev-package notification. It does not prove FCM
provider delivery or outreach receipt processing. The talk flow verifies switching and restart;
actual dictated speech and sound require controlled input and recording. The release gate also
requires an evidence JSON for this HEAD/device, named human reviewer, recording/inputAudio and
true `pitch`, `noise`, `sentenceEnd`, `mutedSilence`, `languagePackRecognition`. A missing recording
or human listening check cannot pass by running a silent fake voice.

## Library check

Reuse the real test harness, TestClock, scripted gateway, app contracts, EU gateway/prices,
`sheetPhoto`, grade10 judge agreement, Zod and existing Maestro installation. The only dependency
added is **franc-min 6.2.0**, MIT, published in [wooorm/franc](https://github.com/wooorm/franc),
126,936 unpacked bytes across 8 files (package alone, excluding transitive dependencies).
Registry metadata checked on 2026-10-24: latest release 2024-01-11, so recent release activity
is not claimed. Node-only dev tooling; it is not imported by mobile or shipped in a native bundle. Statistical
language detection is preferable to building another ad-hoc language word list. No UI or
accessibility dependency is added. No product implementation is copied or changed.
