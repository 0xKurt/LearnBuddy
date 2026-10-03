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
  Bibliotheks-Check (Regel 1). Ist der Zuwachs gewollt, steht das neue Budget mit Begründung in
  `bundle-budget.json`, und der Commit trägt die Zuwachs-Zeile.
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
- Der Walkthrough-Wächter für gleiche Lage von Antwort und Aktion je Form (#313, Regel 6) und
  `dependency-cruiser` gegen eigene Layout-Bausteine in Übungsformen kommen mit dem Umbau in #310.
- Zusätzliche CI-Zeit: etwa 20 s im Lint-Schritt (jscpd etwa 13 s, knip und Tests parallel) und
  unter 1 s für das Bundle-Budget.
