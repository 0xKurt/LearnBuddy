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

## Review-Korrektur (#954)

Die fachfremde Änderung am Kopfrechnen-Integrationstest wurde vollständig zurückgenommen.
Die ursprüngliche Mindestquote von 60 % bleibt unverändert. Dieser PR behauptet keine
statistische Widerlegung dieser Assertion.

Ledger-Regressionen: Der ursprüngliche Schreiber wurde unverändert in `ledger.ts`
extrahiert und mit `evals/explore/__tests__/ledger.test.ts` ausgeführt: **4/4 rot**
(unset/leerer Pfad schreibt trotzdem; Zielpfad ignoriert; keine Fehlerwarnung).
Die Korrektur liest ausschließlich `LB_BUDGET_LEDGER` und fängt Schreibfehler ab.
Die Tests verwenden echte temporäre Dateien, prüfen Anhängen und erhalten sowohl
Erfolgswert als auch ursprünglichen Fehler bei einem nicht beschreibbaren Ziel.

Gezielter Befehl (Node 22, gemeinsamem Postgres, zwei Workern und Maschinenlock):

```sh
. scripts/test-lock.sh
pnpm -C apps/api exec vitest run evals/explore/__tests__/ledger.test.ts src/__tests__/drill.int.test.ts
```

Grün nach Korrektur (24.10.2026): **2 Dateien, 9/9 Tests bestanden** — vier Ledger-Fälle
und alle fünf unveränderten Kopfrechnen-Integrationstests auf gemeinsamem Postgres.
