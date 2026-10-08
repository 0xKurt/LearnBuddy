# Engineering-Wächter

Die Engineering-Regeln in `CLAUDE.md` (#313) und der Minimalismus aus Regel 16 (#296) sind nur so
viel wert wie das, was sie mechanisch prüft. Diese Wächter laufen bei jedem Commit (pre-commit)
und in CI. Was die Regeln heute schon bricht, ist eine **Ausnahmeliste**, die nur schrumpfen
darf. Es gibt sie in zwei Formen:

- **Gemessen auf main** (#452): Dateigröße, freie Stilzahlen, rohes `Pressable`, Kopien, toter
  Code. Diese Listen stehen in keiner Datei. Eine Datei oder das Repository darf haben, was es
  auf der **Basis** hat — dem Commit von main, auf dem der Branch steht —, gemessen mit den
  heutigen Wächtern (`tools/guards/base.mjs`).
  - **Code schlechter als main:** rot (`pnpm lint`, pre-commit). Das betrifft eine neue Datei mit
    dem Problem oder mehr davon in einer Datei, die es auf main schon hat.
  - **Code besser als main:** grün, ohne Nachtrag. Ist der PR gemergt, ist das Bessere der neue
    Stand von main — kommt das Behobene zurück, ist das wieder mehr, als main hat.
  - **Mehr als main, gewollt** (Owner-Entscheid, PRs, die vor den Wächtern fertig waren, #313
    Schritt 3): eine Freigabe in `tools/guards/growth/` und die Commit-Zeile
    `Ausnahmeliste-Zuwachs: #<issue> <Grund>` (unten „Zuwachs freigeben“).
- **Von Hand geführt:** das Bundle-Budget (`tools/guards/baselines/bundle-budget.json`), der
  `bestand` der Zeichen-Registry und die Konstanten im Quelltext der Tests, die sie prüfen
  (`OWN_BAR`, `CHECK` …, `tools/guards/source-lists.mjs`, #296). Sie ändern sich selten. Größer
  als auf main ist rot in CI (`tools/guards/no-growth.mjs`), außer mit derselben Commit-Zeile.

**Warum gemessen statt als Datei** (#452): Fast jeder PR verkleinerte eine Liste
(`pnpm guards:shrink`, entfernt). Zwei parallele PRs trafen sich so in derselben Datei — schon
in der Summenzeile oder in zwei benachbarten Einträgen. Den Merge-Treiber, der das lokal löste
(#328), führt GitHub nicht aus: der PR galt als Konflikt („dirty“), und es lief keine CI. Ohne
Listendatei gibt es nichts, worin sich zwei Verkleinerungen treffen; eine Freigabe ist eine
eigene Datei je Branch.

## Die Wächter

### Mit Bestand (Ausnahmeliste, darf nur schrumpfen)

| Regel                    | Wächter                                                                                                                                                                                               | Fängt                                                                  | Läuft in                                                                   | Ausnahmeliste                                                  | Bestand main `f1eeb73` (03.10.)                                | Heute main `755f2cf` (08.10.)                                      |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | -------------------------------------------------------------------------- | -------------------------------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------ |
| 3 Keine Kopien           | jscpd 4.3.0: ≥ 50 gleiche Tokens über ≥ 5 Zeilen in `apps/mobile/{app,components,lib}`, `apps/api/src`, `packages/*/src`; ohne Tests und `src/testing`                                                | eine wörtliche Kopie (Typ 1) zwischen zwei Dateien oder in einer       | `pnpm guards`                                                              | gemessen auf main: je Dateipaar die doppelten Zeilen           | 63 Klone, 840 Zeilen, 37 Dateipaare                            | 26 Klone, 344 Zeilen, 18 Dateipaare                                |
| 4 Kleine Einheiten       | ESLint `max-lines`: 600 in `apps/mobile`, 800 in `apps/api`, ohne Leer- und Kommentarzeilen                                                                                                           | eine Datei über der Grenze; eine Datei darüber, die wächst             | `eslint`                                                                   | gemessen auf main: die Größe dort als eigene Grenze            | 18 Dateien (7 App, 11 API), größte 1 805                       | 14 Dateien (5 App, 9 API), größte 1 566                            |
| 5 Nur Tokens             | eigene Regel `lb/no-raw-style-number` (`tools/guards/eslint-plugin.mjs`): keine Zahl ≠ 0 bei `padding*`, `margin*`, `gap`, `fontSize`, `lineHeight`, `border*Radius` in `app/` und `components/`      | eine freie Stilzahl ohne `// token-exempt: <Grund>`                    | `eslint`                                                                   | gemessen auf main: Zahl je Datei                               | 803 Zahlen in 105 Dateien                                      | 699 Zahlen in 99 Dateien                                           |
| 2 Bausteine              | ESLint `no-restricted-imports`: kein `Pressable`/`Touchable*` (react-native, gesture-handler) außerhalb `components/lb`                                                                               | eine Aktion, die an `<Btn>` vorbei gebaut wird (Regel 13)              | `eslint`                                                                   | gemessen auf main: die Dateien mit rohem Import                | 12 Dateien                                                     | 9 Dateien                                                          |
| toter Code               | knip 6.39.0 (`knip.jsonc`): ungenutzte Dateien, Exporte, Typen, Pakete                                                                                                                                | Code, den nichts mehr benutzt — auch das, was ein Refactor zurücklässt | `pnpm guards`                                                              | gemessen auf main: die Funde dort                              | 217 Funde: 165 Exporte, 46 Typen, 4 devDependencies, 2 Dateien | 182 Funde: 135 Exporte, 43 Typen, 4 devDependencies                |
| Bundle                   | `tools/guards/bundle-budget.mjs` nach `expo export` im Walkthrough: das JS, das `index.html` lädt, roh und gzip                                                                                       | eine Bibliothek oder ein Bereich, der ungeplant ins Start-Bundle kommt | `scripts/web-walkthrough.sh` (`pnpm verify`; in CI nur per Hand gestartet) | von Hand: `baselines/bundle-budget.json`, Toleranz 5 %         | 4 165 KB roh, 1 084 KB gzip (#234)                             | 4 335 KB roh, 1 141 KB gzip (#258)                                 |
| 1 Bibliothek             | Test in `guards.test.mjs`: jede Datei in `components/math`, in einem Ordner `figures` und jede UI-Datei mit `react-native-svg` steht in `tools/guards/drawing-registry.json`                          | eine neue Zeichenkomponente ohne Bibliotheks-Check im Issue            | `pnpm guards`                                                              | von Hand: `bestand` in `tools/guards/drawing-registry.json`    | 17 ungeprüfte Zeichenkomponenten                               | 8 ungeprüft, 27 geprüft                                            |
| 2 Eine Leiste (#395)     | `apps/mobile/lib/__tests__/oneBar.test.ts`: jede `BottomBar` im Übungscode hält genau eine `InputBar`, keine Leiste in einer Leiste                                                                   | eine eigene Leiste in einer Übungsform                                 | `pnpm test`                                                                | von Hand: `OWN_BAR` im Test (Datei → Zahl der eigenen Leisten) | —                                                              | 7 Leisten in 6 Dateien                                             |
| 2/6 Antwort-Hülle (#310) | `apps/mobile/lib/__tests__/answerShell.test.ts`: eine Form in der Hülle bringt keine eigene Leiste, keinen Freiraum, kein „Prüfen“, keine Tastaturbehandlung, keine Schattenkachel, keine Tastenreihe | einen nachgebauten Teil der Hülle in einer Form                        | `pnpm test`                                                                | von Hand: `SPACER`, `CHECK`, `SHADOWED` im Test                | —                                                              | je 1, 2, 2 Besitzer (davon echte Schuld: „Prüfen“ in `DrillRound`) |
| 16 Minimalismus (#296)   | `apps/mobile/lib/__tests__/minimalism.test.ts`: jede Datei unter `app/` steht in `ROUTES` mit einer Zeile, warum der Chat sie nicht tragen kann                                                       | einen neuen Screen ohne Begründung; eine Begründung, die gegangen ist  | `pnpm test`                                                                | von Hand: die `WEAK`-Einträge in `ROUTES` (dünne Begründung)   | 5 `WEAK` (#301)                                                | 5 `WEAK`                                                           |

Die gemessenen Listen vergleicht der Wächter selbst mit main: ESLint bekommt beim Laden der
Konfiguration, was jede Datei auf main hat (`fileAllowance()` in `base.mjs`), jscpd und knip
laufen ein zweites Mal auf dem ausgepackten Baum von main (`treeAllowance()`). Gemessen wird
einmal je Basis-Commit und Wächter-Stand, danach aus `node_modules/.cache/lb-guards/`. Die von
Hand geführten Listen vergleicht `no-growth.mjs` mit main — die JSON-Listen direkt, die Listen im
Quelltext über `tools/guards/source-lists.mjs`, das die Konstante mit dem TypeScript-Parser liest
(nie per Muster über den Text). Ist eine registrierte Liste nicht mehr zu finden (umbenannt, kein
Objekt-Literal mehr), wirft der Leser: der Wächter wird nie still blind. Ist eine Liste leer, ist
die Schuld abgebaut — dann fliegen Liste und Eintrag in `SOURCE_LISTS` im selben Change raus
(`guards.test.mjs` erinnert daran).

### Ohne Bestand (jeder Fund ist rot)

| Regel                                         | Wächter                                                                                                                                                                                                                                    | Fängt                                                                                                                                          | Läuft in                  |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| 2 Ein Textfeld (#365)                         | ESLint `lb/one-text-field` (`tools/guards/syntax-rules.mjs`) und `apps/mobile/lib/__tests__/oneInput.test.ts`                                                                                                                              | ein zweites Texteingabefeld oder eine nachgebaute Eingabeleiste (vorher 5 eigene Felder in 4 Dateien)                                          | `eslint`, `pnpm test`     |
| verbotene Code-Formen                         | ESLint `lb/no-context-bump`, `lb/no-default-zone` (#315), `lb/no-public-secret` (#290), `lb/no-window-height` (#289), `lb/no-early-script-report` (#323)                                                                                   | Kontext-Bump außerhalb `plan.ts`, feste Zeitzone, Geheimnis im App-Bundle, Fensterhöhe statt Raum, Modell-Bilanz zu früh                       | `eslint`                  |
| 16 keine Formen-Auswahl (#296)                | `minimalism.test.ts` (keine Route nach einer Form benannt, keine Liste von ≥ 2 Formen in Screen oder Komponente, kein `ItemKind.options`) und `packages/shared-types/src/contracts/__tests__/forms.test.ts` (kein Request trägt eine Form) | einen Formen-Katalog oder -Wähler in der App oder in der API                                                                                   | `pnpm test`               |
| 6 gleiche Lage je Form                        | `tests/web/fit.ts`: `answerPlace` (Abstand über der Antwort ≤ 44 pt, Freiraum darunter, „Prüfen“ zuunterst, `fieldInBar`) und `room` (höchstens eine Leiste)                                                                               | eine Form, deren Antwort oder Aktion woanders steht als bei den anderen                                                                        | Walkthrough               |
| 16 kein Scrollen                              | `tests/web/fit.ts` an jedem Shot bei 390×844 und 360×740                                                                                                                                                                                   | einen Screen, auf dem man scrollen muss, um das Wichtige zu finden                                                                             | Walkthrough               |
| 7 Reihenfolge (#350)                          | `apps/api/src/testing/__tests__/walkthrough.test.ts`                                                                                                                                                                                       | eine geskriptete Modellantwort aus einer gemeinsamen Warteschlange (Specs, die nur in einer Reihenfolge grün sind)                             | `pnpm test`               |
| 8 Kurze Branches (#328)                       | `tools/guards/fresh-base.mjs`                                                                                                                                                                                                              | einen PR, dem ein main-Commit fehlt, der älter als 24 h ist                                                                                    | CI (PR)                   |
| Listen schrumpfen                             | `tools/guards/no-growth.mjs` mit `tools/guards/base.mjs` und `tools/guards/source-lists.mjs`                                                                                                                                               | eine Freigabe in `tools/guards/growth/` oder eine von Hand geführte Liste, die gegenüber main wächst, ohne `Ausnahmeliste-Zuwachs: #… <Grund>` | CI (PR)                   |
| 16 USP, 1 Bibliothek, Wiederverwendung (#296) | `tools/guards/pr-body.mjs` (Workflow `.github/workflows/pr-text.yml`, läuft auch, wenn nur der PR-Text bearbeitet wird)                                                                                                                    | einen PR-Text ohne USP-Punkt 1–5 (oder „keiner“ ohne Begründung), ohne Bibliotheks-Check, ohne „Wiederverwendet / entfernt“                    | CI (PR, eigener Workflow) |

Die Wächter in `tools/guards/` haben je einen Test in `guards.test.mjs`, der sie an einem
absichtlichen Regelbruch rot sieht (die Messung auf main mit zwei parallelen Branches und einem
laufenden Merge, Freigaben, Regeln, `fresh-base`, `no-growth`, die Quelltext-Listen, der PR-Text).

Die per-Datei-Wächter (Größe, Tokens, Pressable) sind ESLint-Regeln und laufen deshalb auch auf den
gestagten Dateien im pre-commit (lint-staged). `pnpm guards` (`tools/guards/run.mjs`) prüft das
ganze Repository: jscpd, knip und die Wächter-Tests (`tools/guards/guards.test.mjs`). Es ist Teil
von `pnpm lint` und des pre-commit-Hooks.

### Zuwachs freigeben

Mehr als main hat, darf ein Branch nur mit einer Freigabe: eine eigene JSON-Datei in
`tools/guards/growth/`, benannt nach Issue und Thema, damit zwei Branches nie dieselbe Datei
schreiben. Sie nennt nur, was über main hinaus erlaubt ist (je Eintrag die erlaubte Zahl, bei
Listen die erlaubten Einträge):

```json
{
  "issue": "#123",
  "reason": "<warum der Zuwachs sein muss, mit Quelle des Entscheids>",
  "maxLines": { "apps/mobile/components/x/Beispiel.tsx": 640 },
  "styleNumbers": { "apps/mobile/components/x/Beispiel.tsx": 3 },
  "pressable": ["apps/mobile/components/x/Beispiel.tsx"],
  "clones": { "apps/api/src/a.ts <-> apps/api/src/b.ts": 12 },
  "knip": ["exports: apps/api/src/a.ts: helper"]
}
```

Dazu trägt ein Commit des Branches die Zeile `Ausnahmeliste-Zuwachs: #<issue> <Grund>` — sonst
ist `no-growth.mjs` in CI rot. Eine Freigabe gilt nur auf dem Branch, der sie anlegt oder ändert.
Nach dem Merge ist der Zuwachs Teil von main und damit des Maßes; die Datei bleibt als Protokoll
und erlaubt nichts mehr.

Verbotene Code-Formen sind je eine eigene Regel in `tools/guards/syntax-rules.mjs`:
`lb/no-context-bump` und `lb/no-default-zone` (#315), `lb/no-public-secret` (#290) und
`lb/no-window-height` (#289) sowie `lb/no-early-script-report` (#323): Integrationstests lesen die
Bilanz des geskripteten Modells nur über `env.checkScript()` / `env.closeChecked()`, die zuerst die
Hintergrundarbeit abwarten. `lb/one-text-field` (#365, Owner 04.10.: „Es sollte EIN Inputfeld in der
ganzen App existieren, das immer benutzt wird.“): React Natives `TextInput` steht nur in
`components/lb/LbTextInput.tsx` — als Element und als Import, in `apps/mobile` überall, Tests
eingeschlossen. Jedes Feld ist `<LbTextInput>` (Varianten field, bar, cell), die Eingabeleiste von
Chat und Übung ist `<InputBar>`, ein Ref heißt `LbTextInputRef`. Dass Chat und Übung dieselbe
Leiste benutzen und keine andere Datei deren Pille zeichnet, prüft
`apps/mobile/lib/__tests__/oneInput.test.ts`. Nie als Eintrag von ESLints `no-restricted-syntax`: Diese Regel hat
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
Konflikte in Ausnahmelisten gibt es seit #452 nicht mehr: die gemessenen Listen stehen in keiner
Datei, eine Freigabe ist eine eigene Datei je Branch. Während main in einen Branch gemergt wird,
ist main selbst die Basis — was main mitbringt, hat main schon begründet.

## Wenn ein Wächter rot ist

- **Kopie (jscpd):** Die Meldung nennt beide Stellen mit Zeilen. Extrahieren, sodass es genau
  eine Implementierung gibt (Regel 3). Wächst eine bekannte Kopie, gilt dasselbe.
- **Datei zu groß (`max-lines`):** Nach Aufgaben schneiden, nicht nach Zeilen: Hooks, Bereiche,
  Anwendungsfälle (#311 Schritt 4). Eine Datei, die auf main über der Grenze liegt, darf nicht
  über ihre Größe dort wachsen. Wer sie anfasst, muss vorher etwas herausziehen. Eine Datei unter
  neuem Pfad (umbenannt, verschoben) ist für den Wächter neu: ihre Schuld vorher abbauen oder
  freigeben.
- **Freie Stilzahl (`lb/no-raw-style-number`):** Den Token aus `lib/theme` nehmen (`SPACE`, `TYPE`,
  …). Fehlt er, den Token anlegen. Ist die Zahl wirklich begründet (optische Korrektur), steht
  daneben oder darüber `// token-exempt: <Grund>`. Nur `0` ist frei.
- **Rohes `Pressable`:** `<Btn>` oder `<CircleBtn>` aus `components/lb` nehmen. Kann keiner der
  beiden es, wird der Baustein in `components/lb` gebaut (Regel 2).
- **knip:** Ungenutztes löschen. Ist es doch benutzt, nur auf einem Weg, den knip nicht sieht
  (eine Plattformdatei, ein Skript), kommt der Einstieg mit Begründung in `knip.jsonc`, nicht in
  eine Freigabe.
- **Bundle-Budget:** Nachsehen, was neu im Bundle ist. Eine neue Bibliothek braucht den
  Bibliotheks-Check (Regel 1). Braucht sie nur ein Teil der App, zuerst per `import()` nachladen:
  Metro macht daraus im Web einen eigenen Bundle-Teil, den `index.html` nicht lädt (VexFlow für die
  Notenzeile, #312: `components/math/staff/useEngraver.ts`). Ist der Zuwachs trotzdem gewollt, steht
  das neue Budget mit Begründung in `bundle-budget.json`, und der Commit trägt die Zuwachs-Zeile.
- **Neue Zeichenkomponente:** Erst den Bibliotheks-Check im Issue machen, dann den Eintrag unter
  `geprueft` anlegen: `{ "issue": "#…", "libraryCheck": "Ergebnis und Begründung" }`.
- **Etwas wurde besser:** Bei den gemessenen Listen ist nichts zu tun — nach dem Merge ist es
  der Stand von main. Das Bundle-Budget senkt `node tools/guards/bundle-budget.mjs --shrink` nach
  einem `expo export`. Eine Liste im Quelltext eines Tests (`OWN_BAR`, `CHECK` …) zieht der Test
  selbst ein: er verlangt die Liste genau so, wie der Code ist — der Eintrag fliegt im Change, der
  die Schuld abbaut. Eine gelöschte Zeichenkomponente fliegt von Hand aus `bestand`.
- **„Die Ausnahmelisten werden auf origin/main gemessen, aber origin/main ist hier unbekannt“:**
  `git fetch origin main`. Ohne main gibt es kein Maß; der Wächter rät nicht.
- **Eine Freigabe ist rot** (`tools/guards/growth/…: "issue" fehlt` …): Die Datei braucht
  `issue` (`#123`), `reason` und nur Listen, die wachsen können (`maxLines`, `styleNumbers`,
  `clones` als `{ Eintrag: Zahl }`, `pressable`, `knip` als `[Einträge]`).
- **`no-growth`: Liste im Quelltext gewachsen** (`…test.ts#OWN_BAR: neu: X.tsx`): Eine Form hat
  eine eigene Leiste, ein eigenes „Prüfen“ oder eine Schattenkachel bekommen, oder eine Route eine
  `WEAK`-Begründung. Den gemeinsamen Baustein nehmen (`InputBar`, `AnswerShell`, `AnswerTile`) —
  fehlt er, zuerst ihn bauen (Regel 2). Hat der Owner es so entschieden: Zuwachs-Zeile im Commit.
- **`no-growth`: „nicht gefunden“ / „kein Objekt-Literal“:** Eine registrierte Liste wurde
  umbenannt oder umgebaut. Den Namen in `SOURCE_LISTS` (`tools/guards/source-lists.mjs`)
  nachziehen; die Liste bleibt ein einfaches Objekt-Literal.
- **PR-Text (`pr-body.mjs`):** Im PR-Text die drei Zeilen der Vorlage ausfüllen — USP-Punkt 1–5
  (oder „keiner — <Begründung>“), „Wiederverwendet / entfernt“, „Bibliotheks-Check“ (notfalls
  „keiner“). Der Wächter läuft beim Speichern des Texts erneut, ohne die ganze CI.

## Review-Schritte (nicht mechanisch prüfbar)

Was ein Wächter nicht entscheiden kann, ist ein fester Schritt im Review — vom Entwickler vor dem
PR, vom Orchestrator vor dem Merge (Regel 10). Jeder Schritt mit dem Grund, warum es kein Wächter
ist.

1. **Doppelbau-Durchgang** (#296 Plan 2, Regel 3): Vor dem Merge eines Features, das einen
   Mechanismus berührt, den es schon gibt, die fünf Stellen aus #296 vergleichen — Tippen in
   Figuren (eine Fläche: `components/lb/TapSurface`, #416), Kernpunkte/Rubrik
   (`practice/rubric.ts`, `quoted` entscheidet jeden Kernpunkt, auch den eines Rollenspiels), Antwortflächen (`AnswerShell`), Prüfer
   (`practice/*Check.ts`), Prompt-Bausteine (`STRUCTURED_RULES`, `setProfiles.ts`). Doppeltes wird
   auf die bessere Fassung zusammengelegt, das Schwächere gelöscht. _Warum kein Wächter:_ jscpd
   findet nur wörtliche Kopien; zwei Implementierungen derselben Idee mit anderen Namen sieht kein
   Werkzeug. Die mechanisch fassbaren Teile sind Wächter geworden (ein Textfeld, eine Leiste, eine
   Hülle, eine Tastenreihe).
2. **Parallele Aufträge teilen keine Datei** (Regel 8, #313 Kommentar 03.10.): Vor dem Verteilen
   prüft der Orchestrator, welche großen Dateien mehrere Aufträge anfassen. Aufteilen einer Datei
   ist ein eigener, vorgezogener Schritt mit einem benannten Aufteiler; wer sonst an eine
   Zeilengrenze stößt, meldet es, statt selbst aufzuteilen. _Warum kein Wächter:_ die Kollision
   entsteht zwischen Branches, die noch nicht existieren — CI sieht immer nur einen.
3. **Design im Vergleich** (Regel 6, Regel 17): Jeder sichtbare Change zeigt den Screen neben
   verwandten Screens, 360×740 und 390×844, hell und dunkel, mit Vorher/Nachher-Bild im PR.
   _Warum kein Wächter:_ `fit.ts` misst Lage und Platz; ob etwas gleich _aussieht_ oder gut
   aussieht, misst es nicht.
4. **Bibliotheks-Check mit Inhalt** (Regel 1): `pr-body.mjs` prüft, dass die Zeile ausgefüllt
   ist, und die Registry, dass jede Zeichenkomponente einen Check nennt. Ob der Check echt ist
   (Lizenz, React-Native-Weg, Größe, Pflege, A11y), liest der Reviewer. _Warum:_ eine
   Abwägung, kein Fakt.
5. **USP-Punkt stimmt** (#296 Plan 3): `pr-body.mjs` prüft, dass ein Punkt genannt ist; ob die
   Änderung ihm wirklich dient — und ob „keiner“ ein Grund ist, den PR fallen zu lassen —
   entscheidet der Reviewer. _Warum:_ Bedeutung, nicht Form.
6. **Eine Aufgabe je Datei** (Regel 4, zweite Hälfte): `max-lines` hält die Größe; ob eine Datei
   zwei Aufgaben hat, ist eine Lesefrage. _Warum:_ Zuständigkeit ist nicht zählbar.
7. **Belegt heißt belegt** (Regel 9): Live- und Geräte-Lücken stehen unter „Nicht geprüft“ im PR
   und als Issue. _Warum kein Wächter:_ was ohne echtes Modell oder Gerät unbelegt ist, weiß nur,
   wer den Change gebaut hat.
8. **Fehler ist nie „Flake“** (Regel 7, zweite Hälfte): Ein roter Lauf bekommt eine belegte
   Ursache, bevor er wiederholt wird. _Warum:_ eine Haltung im Umgang mit Rot, kein Zustand des
   Codes.
9. **Integrationsverantwortung** (Regel 10): Vor jedem Merge paralleler Arbeit prüft der
   Orchestrator die Kohärenz mit dem Rest der App (gleiche Aktion, gleicher Baustein, gleiche
   Stelle). _Warum:_ die Wächter sehen je einen Change, die Kohärenz entsteht erst zwischen
   mehreren.

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
  „Prüfen“ zuunterst — an jedem Shot mit `answer-slot`; seit #365 außerdem: das Feld einer
  getippten Antwort steht in der Leiste unten mit „Prüfen“, `fieldInBar`). Die Tastatur-Probe bei
  360×440 läuft an jedem Shot mit einem Antwortfeld.
- Eine Leiste je Übungsbildschirm, und sie ist die Eingabeleiste (#395): der Quelltext-Test
  `apps/mobile/lib/__tests__/oneBar.test.ts` (jede `BottomBar` im Übungscode hält genau eine
  `InputBar`, keine Leiste in einer Leiste; die noch eigenen Leisten stehen mit ihrem Schritt auf
  einer Liste, die nur schrumpft) und `room` in `tests/web/fit.ts` (höchstens eine angeheftete
  Leiste an jedem Shot; Freiraum, Leiste und Antwortfeld jeder Übungsstation in `fit.jsonl`, auch
  bei 360×440).
- `no-growth` sieht nur die Listen, die registriert sind (`LISTS`, `SOURCE_LISTS`). Wer eine neue
  Liste „darf nur schrumpfen“ in einem Test anlegt, trägt sie im selben Change in `SOURCE_LISTS`
  ein — sonst kann sie still wachsen.
- `pr-body.mjs` prüft, dass die drei Zeilen gefüllt sind, nicht, ob sie stimmen (Review-Schritte
  4 und 5). Ein PR ohne Vorlage ist rot, bis die Zeilen dastehen. Damit der Workflow einen Merge
  sperrt, muss „PR text“ in den Branch-Regeln von `main` als Pflicht-Check stehen (Owner, GitHub
  Settings → Branches) — das kann kein Commit einstellen.
- Der Schalter für neue Formen (#296 Plan 4) ist ein Feature, kein Wächter: `FORMS_OFF` je
  Umgebung (`apps/api/src/config.ts`) nimmt eine Form aus dem Profil (`profileFor` in
  `apps/api/src/modules/practice/setProfiles.ts`) und aus dem, was ein Blatt speichert
  (`formsOn`); docs/architecture.md §Explain profiles.
- Die Messung auf main (#452) sieht main so, wie es lokal bekannt ist: ein alter `origin/main`
  misst gegen den alten Stand. Maßgeblich ist die CI — dort ist die Basis der PR, in main gemergt,
  also mains Spitze. Auf main selbst (Push) misst der Wächter main gegen sich: dort fängt er
  nichts mehr, das Tor ist der PR.
- Umbenennen sieht der Wächter nicht: eine Datei mit Schuld unter neuem Pfad hat auf main nichts
  und ist rot, bis die Schuld abgebaut oder freigegeben ist.
- Zusätzliche CI-Zeit: etwa 20 s im Lint-Schritt (jscpd etwa 13 s, knip und Tests parallel), seit
  #452 dazu einmal die Messung von main (Dateien etwa 15 s, jscpd und knip je ein zweiter Lauf;
  lokal einmal je Basis-Commit, danach aus dem Cache), und unter 1 s für das Bundle-Budget.
