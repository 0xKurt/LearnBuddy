# Tooling red → green evidence

Product baseline: `ef570387`. Shared Postgres `127.0.0.1:54316`; two workers; machine lock.
Only the three new test files were invoked manually. Full suite belongs to the git hooks.

| Regression | Red observation | Green observation |
| --- | --- | --- |
| Dynamic internal tool identifiers | `schedule_check` was not detected | Supplied schema identifiers are checked |
| Six-word prompt fragments | `someone ... sixty` falsely matched `one ... six` | Whole Unicode-token n-grams; counterexample passes |
| Offer contract | Passing `figures: []` reached request validation, HTTP 422 with `details.issues` | Empty optional field omitted like mobile; real preparation reached, explicit `details.reason: not_usable` |
| Prose summary | A shorter paragraph was wrongly rejected because it lacked bullets | Prose and lists accepted; unchanged repetition still fails |
| Photo provenance | The new source-binding predicate was absent | An older unrelated exercise cannot satisfy the photographed-material goal |
| Prepared worksheet card | Real upload announced a card but the driver exposed zero offers | Prepared-step start contract returns a nonempty session; duplicate starts retain its ID |
| Bare ASCII figure | A stick figure without a fence was missed | Defined three-line figure detected, ordinary division retained |
| Honest refusal | Missing refusal predicate failed the new test | Explicit `not_usable` accepted; malformed request and internal failure rejected |

The adapter regression was run against the old adapter, then restored and rerun against the fix.
The injected provider in that test refuses preparation deliberately; it is not a live product finding.

Final targeted run, 24 October: **3 files passed, 33 tests passed** (5.11 s). It covers real SSE,
persisted/paginated history, duplicate request IDs, and fixed safeguarding responses in chat,
roleplay and practice, plus budget, report, review and predicate checks. TypeScript and ESLint
passed. Maestro syntax was checked for the individual child flows after correcting two unsupported commands. The existing dev APK installed; the helper APK was blocked by the phone. This is not a successful device flow run.

Live baseline verdicts and transcripts are in the adjacent `owner-*.json` files. Green product
cases stay green; injected negative controls are explicitly named in `recorded-owner.json`.

## Hook-Nachprüfung: Kopfrechnen

Der vollständige Hook-Lauf deckte eine bestehende zufällige Mindestquote in
`src/__tests__/drill.int.test.ts` auf: `expected 4 to be greater than or equal to 5`
bei `ceil(wrong.size * 0.6)`. `pickRound` zieht gewichtet; `weightOf` verspricht
explizit nur die Reihenfolge der Gewichte, keine Mindestzahl pro Runde.

Der Integrationstest prüft jetzt jedes gespeicherte Ergebnis am richtigen Item
und dieselbe Item-ID für wiederkehrende Fakten. Zwei Mengen von je 20 aus 36
Fakten müssen mindestens vier gemeinsame Fakten haben. Die bestehende Prüfung
der Gewichtung über 300 feste Seeds bleibt unverändert.

Rot: vollständiger Git-Hook, 3376 Tests bestanden, diese Quotenbehauptung fehlgeschlagen.
Grün: gezielt nur die geänderte Datei, 5/5 Tests bestanden (24.10.2026).
Produktcode wurde nicht geändert.
