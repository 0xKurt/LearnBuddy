# Evidenz zum Audit vom 30. September 2026

Baseline: `d3b114a9ec51f05edf35f6a36eac4e27d6ea1698`. Hauptbericht: [LearnBuddy-Audit](../../LEARNBUDDY-AUDIT-2026-09-30.md).

## Reproduktionen

- `repro-learning.mts` prüft echte Parser-/Summary-/Bewertungsfunktionen mit synthetischen Eingaben. Das Skript schreibt die Ergebnisse nach `/private/tmp/learnbuddy-learning-repro-results.json`. Die beim Audit gemessene Kopie liegt hier als `repro-learning.json`.
- `repro-context.mts` verwendet den vorhandenen Test-Harness und reale Migrationen. Änderungen finden ausschließlich in Wegwerf-Testdatenbanken statt; Modellentscheidungen sind geskriptet. Das Skript gibt JSON auf stdout aus. Die beim Audit gemessene Kopie liegt hier als `repro-context.json`.
- Beide Skripte sind Audit-Snapshots mit absoluten Imports aus `/Users/kurt/git/LearnBuddy`. Sie sind keine neuen Regressionstests der App. Ein anderer Checkout erfordert entsprechende Pfadanpassung.

Aus `apps/api`, mit einem lokalen Postgres-Testserver und dem vorgesehenen Node 22:

```sh
LB_REQUIRE_TEST_DB=1 LB_TEST_DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5432/postgres pnpm exec tsx ../../reports/learnbuddy-audit-2026-09-30/evidence/repro-learning.mts
LB_REQUIRE_TEST_DB=1 LB_TEST_DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5432/postgres pnpm exec tsx ../../reports/learnbuddy-audit-2026-09-30/evidence/repro-context.mts
```

## Testläufe

- `typecheck.log`, `lint.log`, `tests.log`: bestehende Projektchecks. Test-Datenbank war verpflichtend; 1.491 Tests bestanden, ein pgvector-Test übersprungen. Diese Läufe erfolgten vor dem Hinzufügen der Audit-Dateien.
- `web-walkthrough.log`: bestehender Chromium-Walkthrough des kompilierten Web-Builds; API-/Webports 18787/18081, reale lokale API/DB/Jobs, Stand-ins für Auth/Storage/Modell. 9/11 Fälle bestanden, zwei Aufnahmestarts scheiterten. Kein Nachweis eines nativen Android-Fehlers.
- `fit.jsonl`, `a11y.jsonl`: Browsermessungen aus diesem Lauf. Zulässige Scrollflächen sind kein unzulässiger Overflow; automatische Accessibility-Prüfung ersetzt keine manuelle Hilfsmittelprüfung.
- `live-tutor.log`: echter Vertex-Tutor-Eval mit synthetischer Lernender, lokaler Testdatenbank und Node 22. 9/9 Szenarien bestanden. Der Eval-Runner lädt die lokale API-Konfiguration; der gespeicherte Log enthält keine Konfigurationswerte.
- `dependency-audit.json`: Ergebnis des Dependency-Scans, keine Liste bestätigter produktiver Exploits. Die im Hauptbericht genannten Toolchain-Pfade und Advisories erfordern separate Erreichbarkeitsprüfung.

Screenshots unter `../screens` zeigen ausschließlich Testkonten/-materialien. Die Konkurrenz- und Forschungsberichte liegen eine Ebene höher.
