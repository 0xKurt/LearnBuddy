# Engineering-Wächter

Die Engineering-Regeln in `CLAUDE.md` (#313) sind nur so viel wert wie das, was sie mechanisch
prüft. Diese Wächter laufen bei jedem Commit (pre-commit) und in CI. Was die Regeln heute schon
bricht, steht auf einer **Ausnahmeliste** in `tools/guards/baselines/`. Jede Liste darf nur
schrumpfen:

- **Code schlechter als die Liste:** rot. Das betrifft eine neue Datei mit dem Problem oder mehr
  davon in einer gelisteten Datei.
- **Code besser als die Liste:** auch rot, bis die Liste nachgezogen ist (`pnpm guards:shrink`).
  Sonst könnte das Behobene unbemerkt zurückkommen.
- **Liste größer als auf main:** rot in CI (`tools/guards/no-growth.mjs`). Ausnahme nur mit einer
  Commit-Zeile `Ausnahmeliste-Zuwachs: #<issue> <Grund>`, zum Beispiel für PRs, die vor den
  Wächtern fertig waren (#313, Schritt 3).

## Die Wächter

| Regel              | Wächter                                                                                                                                                                                          | Läuft in                                                    | Ausnahmeliste                                         | Bestand (main `f1eeb73`)                                       |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------- | ----------------------------------------------------- | -------------------------------------------------------------- |
| 3 Keine Kopien     | jscpd 4.3.0: ≥ 50 gleiche Tokens über ≥ 5 Zeilen in `apps/mobile/{app,components,lib}`, `apps/api/src`, `packages/*/src`; ohne Tests und `src/testing`                                           | `pnpm guards`                                               | `clones.json`, je Dateipaar die doppelten Zeilen      | 63 Klone, 840 Zeilen, 37 Dateipaare                            |
| 4 Kleine Einheiten | ESLint `max-lines`: 600 in `apps/mobile`, 800 in `apps/api`, ohne Leer- und Kommentarzeilen                                                                                                      | `eslint`                                                    | `max-lines.json`, die heutige Größe als eigene Grenze | 18 Dateien (7 App, 11 API), größte 1 805                       |
| 5 Nur Tokens       | eigene Regel `lb/no-raw-style-number` (`tools/guards/eslint-plugin.mjs`): keine Zahl ≠ 0 bei `padding*`, `margin*`, `gap`, `fontSize`, `lineHeight`, `border*Radius` in `app/` und `components/` | `eslint`                                                    | `style-numbers.json`, Zahl je Datei                   | 803 Zahlen in 105 Dateien                                      |
| 2 Bausteine        | ESLint `no-restricted-imports`: kein `Pressable`/`Touchable*` (react-native, gesture-handler) außerhalb `components/lb`                                                                          | `eslint`                                                    | `pressable.json`                                      | 12 Dateien                                                     |
| toter Code         | knip 6.39.0 (`knip.jsonc`): ungenutzte Dateien, Exporte, Typen, Pakete                                                                                                                           | `pnpm guards`                                               | `knip.json`                                           | 217 Funde: 165 Exporte, 46 Typen, 4 devDependencies, 2 Dateien |
| Bundle             | `tools/guards/bundle-budget.mjs` nach `expo export` im Walkthrough: das JS, das `index.html` lädt, roh und gzip                                                                                  | `scripts/web-walkthrough.sh` (CI-Job „browser walkthrough“) | `bundle-budget.json`, Toleranz 5 %                    | 3 993 KB roh, 1 031 KB gzip                                    |
| 1 Bibliothek       | Test: jede Datei in `components/math`, in einem Ordner `figures` und jede UI-Datei mit `react-native-svg` steht in `tools/guards/drawing-registry.json`                                          | `pnpm guards`                                               | `bestand` in der Registry                             | 17 ungeprüfte Zeichenkomponenten                               |

Die per-Datei-Wächter (Größe, Tokens, Pressable) sind ESLint-Regeln und laufen deshalb auch auf den
gestagten Dateien im pre-commit (lint-staged). `pnpm guards` (`tools/guards/run.mjs`) prüft das
ganze Repository: jscpd, knip und die Wächter-Tests mit der Ratsche
(`tools/guards/guards.test.mjs`). Es ist Teil von `pnpm lint` und des pre-commit-Hooks.

Verbotene Code-Formen sind je eine eigene Regel in `tools/guards/syntax-rules.mjs`:
`lb/no-context-bump` und `lb/no-default-zone` (#315), `lb/no-public-secret` (#290) und
`lb/no-window-height` (#289) sowie `lb/no-early-script-report` (#323): Integrationstests lesen die
Bilanz des geskripteten Modells nur über `env.checkScript()` / `env.closeChecked()`, die zuerst die
Hintergrundarbeit abwarten. Nie als Eintrag von ESLints `no-restricted-syntax`: Diese Regel hat
pro Datei genau eine Liste, ein späterer Config-Block ersetzt die Liste eines früheren, statt sie
zu ergänzen. Beim Zusammenführen von #290, #289 und #315 schwieg so die Secret-Sperre auf allen
Screens, ohne Fehlermeldung. `guards.test.mjs` lintet deshalb eine Datei, die alle vier
abdecken, über die echte `eslint.config.mjs` und erwartet jede einzelne.

**Tests unabhängig von der Reihenfolge** (Regel 7, Issue #350): Die geskripteten Modellantworten
des Browser-Walkthroughs werden nur nach dem Inhalt der Anfrage gewählt, nie aus einer
Warteschlange, die der erste fragende Spec leert. `apps/api/src/testing/__tests__/walkthrough.test.ts`
(Teil von `pnpm test`, ohne Browser und Datenbank) prüft, dass das Walkthrough-Modell keine
Antwort in einer Warteschlange hält und dass die Anfragen der Specs vorwärts wie rückwärts dieselben
Antworten bekommen. Jeden Walkthrough-Test einzeln auf eigenem Stack fährt
`scripts/web-walkthrough-each.sh` — nur lokal, für die CI zu teuer.

**Kurze Branches** (Regel 8, Issue #328): `tools/guards/fresh-base.mjs` macht in der CI jeden PR
rot, dem ein Commit von main fehlt, der älter als 24 h ist. Gezählt werden nur mains eigene
Commits (`--first-parent`), denn ein gemergter PR bringt seine Commits mit ihrer Schreibzeit mit.
Konflikte in den Ausnahmelisten löst der Merge-Treiber `tools/guards/merge-baseline.mjs`
(`.gitattributes`, eingerichtet von `pnpm install`): je Eintrag die größere Zahl, Listen
vereinigt. Danach zieht `pnpm guards:shrink` auf den echten Stand herunter, `no-growth.mjs`
hält die Grenze gegen main.

## Wenn ein Wächter rot ist

- **Kopie (jscpd):** Die Meldung nennt beide Stellen mit Zeilen. Extrahieren, sodass es genau
  eine Implementierung gibt (Regel 3). Wächst eine bekannte Kopie, gilt dasselbe.
- **Datei zu groß (`max-lines`):** Nach Aufgaben schneiden, nicht nach Zeilen: Hooks, Bereiche,
  Anwendungsfälle (#311 Schritt 4). Eine gelistete Datei darf nicht wachsen. Wer sie anfasst, muss
  vorher etwas herausziehen.
- **Freie Stilzahl (`lb/no-raw-style-number`):** Den Token aus `lib/theme` nehmen (`SPACE`, `TYPE`,
  …). Fehlt er, den Token anlegen. Ist die Zahl wirklich begründet (optische Korrektur), steht
  daneben oder darüber `// token-exempt: <Grund>`. Nur `0` ist frei.
- **Rohes `Pressable`:** `<Btn>` oder `<CircleBtn>` aus `components/lb` nehmen. Kann keiner der
  beiden es, wird der Baustein in `components/lb` gebaut (Regel 2).
- **knip:** Ungenutztes löschen. Ist es doch benutzt, nur auf einem Weg, den knip nicht sieht
  (eine Plattformdatei, ein Skript), kommt der Einstieg mit Begründung in `knip.jsonc`, nicht auf
  die Ausnahmeliste.
- **Bundle-Budget:** Nachsehen, was neu im Bundle ist. Eine neue Bibliothek braucht den
  Bibliotheks-Check (Regel 1). Braucht sie nur ein Teil der App, zuerst per `import()` nachladen:
  Metro macht daraus im Web einen eigenen Bundle-Teil, den `index.html` nicht lädt (VexFlow für die
  Notenzeile, #312: `components/math/staff/useEngraver.ts`). Ist der Zuwachs trotzdem gewollt, steht
  das neue Budget mit Begründung in `bundle-budget.json`, und der Commit trägt die Zuwachs-Zeile.
- **Neue Zeichenkomponente:** Erst den Bibliotheks-Check im Issue machen, dann den Eintrag unter
  `geprueft` anlegen: `{ "issue": "#…", "libraryCheck": "Ergebnis und Begründung" }`.
- **„Ausnahmeliste veraltet“:** Etwas wurde besser. `pnpm guards:shrink` zieht alle Listen auf den
  heutigen Stand nach unten. Das Skript trägt nie etwas ein und erhöht nie eine Zahl. Das
  Bundle-Budget senkt `node tools/guards/bundle-budget.mjs --shrink` nach einem `expo export`.

## Grenzen

- Die Token-Regel sieht Zahlen, keine Konstanten: `const BADGE = 26; padding: BADGE` rutscht
  durch. Die Datei-Konstanten aus dem Audit in #310 verschwinden mit den Radius- und Typ-Tokens
  aus #311.
- jscpd findet wörtliche Kopien (Typ 1). Umbenannte oder nachgebaute Kopien findet es nicht. Dafür
  bleibt der Doppelbau-Durchgang aus #296 und #311 nötig. jscpd 5.x (Rust) kann Typ 2, hat in
  5.4.0 aber eine 60-Zeilen-Kopie eines Dateianfangs nicht erkannt und ist deshalb nicht im
  Einsatz.
- Gleiche Lage von Antwort und Aktion je Form (#313, Regel 6) prüfen seit #310 Schritt 2 zwei
  Wächter: der Quelltext-Test `apps/mobile/lib/__tests__/answerShell.test.ts` (eigene Leiste,
  eigener Freiraum, eigenes „Prüfen“, eigene Tastaturbehandlung oder Schattenkachel in einer Form;
  die noch nicht umgezogenen Formen stehen mit ihrem Schritt auf einer Liste, die nur schrumpft) und
  `answerPlace` in `tests/web/fit.ts` (Abstand über der Antwort ≤ 44 pt, Freiraum darunter,
  „Prüfen“ zuunterst — an jedem Shot mit `answer-slot`). Die Tastatur-Probe bei 360×420 kommt mit
  dem Eingabefeld (#310 Schritt 3).
- Zusätzliche CI-Zeit: etwa 20 s im Lint-Schritt (jscpd etwa 13 s, knip und Tests parallel) und
  unter 1 s für das Bundle-Budget.
