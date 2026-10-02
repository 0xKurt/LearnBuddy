# Klasse 10: Wie gut vermittelt Buddy? — Methode, Stand, Schwächen

Issue [#298](https://github.com/0xKurt/LearnBuddy/issues/298), Teil 1 („Erst messen").
Code: `apps/api/evals/grade10/` · ein Befehl: `pnpm --filter @learnbuddy/api eval:grade10`.

> **Stand 02.10.2026: Es gibt noch keinen Live-Lauf.** In der Session, die das Werkzeug gebaut
> hat, gab es keinen Vertex-Zugang. Alles, was ohne Modell prüfbar ist, ist geprüft (13 Tests in
> `evals/grade10/__tests__/grade10.test.ts`); jede Zahl unten unter „Ergebnisse" fehlt, bis der
> erste Lauf sie schreibt. Eine Schwäche ist trotzdem schon belegt — sie kam beim Bau der Fälle
> heraus, ohne Modell (siehe „Bereits belegt").

## Was gemessen wird

Elf echte Klasse-10-Fälle (`cases.ts`), je mit dem Satz, den eine 15/16-Jährige tippt, dem Ort im
Lehrplan (KMK-Bildungsstandards MSA, bzw. Kernlehrplan Geschichte), den Fakten, die eine richtige
Erklärung nicht verletzen darf, den klassischen Fehlern, die nicht vorkommen dürfen, und einer
kurzen Erklärung, wie eine Lehrkraft sie schreiben würde.

| Fach       | Fall               | Thema                                        | Vormach-Aufgabe                |
| ---------- | ------------------ | -------------------------------------------- | ------------------------------ |
| Mathe      | `m-quadratisch`    | Scheitelpunktform, Parameter a               | quadratische Ergänzung         |
| Mathe      | `m-trigonometrie`  | sin, cos, tan im rechtwinkligen Dreieck      | Gegenkathete aus Hypotenuse    |
| Mathe      | `m-exponentiell`   | lineares vs. exponentielles Wachstum         | Bestand nach 2 Jahren bei 10 % |
| Physik     | `p-energie`        | Lage- und Bewegungsenergie, Energieerhaltung | Höhe aus Lageenergie           |
| Physik     | `p-elektrik`       | Ohmsches Gesetz, Parallelschaltung           | Widerstand aus U und I         |
| Chemie     | `c-redox`          | Oxidation als Elektronenabgabe               | –                              |
| Chemie     | `c-stoechiometrie` | Stoffmenge, molare Masse                     | Masse Wasser aus 4 g H₂        |
| Deutsch    | `d-eroerterung`    | dialektische Erörterung                      | Kernpunkte (Text)              |
| Englisch   | `e-reading`        | skimming, scanning, evidence                 | –                              |
| Englisch   | `e-writing`        | comment / opinion essay                      | –                              |
| Geschichte | `g-quellenarbeit`  | Quellenanalyse (Rede 1933)                   | –                              |

Je Fall, auf einer Wegwerf-Datenbank mit einer frischen Lernenden (16 Jahre, Klasse 10):

1. **Die echte Erklärung**: die Frage geht durch den echten Zug (`POST /buddy/messages`) — derselbe
   Prompt, dasselbe Schema, dieselbe Temperatur wie in Produktion.
2. **Bewertung nach Rubrik** (Richter-Modell, Temperatur 0, `score.ts` `RUBRIC_JUDGE`), je 1–5:
   fachliche Richtigkeit (mit Liste der gefundenen Fehler), Verständlichkeit für 15/16-Jährige,
   Passung zum Lehrplan Klasse 10, „Länge passt zur Frage".
3. **Länge gezählt, nicht beurteilt**: Wörter wie die App sie zählt (`brief.ts` `wordCount`, eine
   Formel zählt als ein Wort). Band 30–250 Wörter: darunter ist nichts erklärt, darüber ist es mehr
   als eine Minute Lesen auf dem Handy. Der Buddy-Prompt setzt bewusst keine Obergrenze, daher ein
   Band und kein Ziel.
4. **Vergleich mit der Lehrkraft-Referenz, mit vertauschter Reihenfolge**: derselbe Richter
   vergleicht Buddys Erklärung mit der Referenz zweimal — einmal Buddy als A, einmal als B. Nur ein
   Urteil, das beide Reihenfolgen übersteht, zählt (Buddy besser / Referenz besser / gleichauf).
   Kippt es mit der Reihenfolge, wird es als **Positionsfehler** gezählt und nie als Ergebnis.
5. **Geführtes Vormachen**: wo der Fall eine Aufgabe hat, schreibt das echte Modell den Plan, und
   Code prüft ihn genau wie in der App (`planGuide`): angenommen, oder verworfen mit Grund. Jeder
   Referenzweg besteht diese Prüfung offline — sonst würde der Fall nichts messen.

Ergebnis: ein Bericht (`docs/evals/klasse10-<datum>.md`) mit Zahlen, einer Zeile je Fall, der Liste
der Schwächen und jeder Erklärung zum Nachlesen, plus der Bogen für die menschliche Stichprobe.

## Die menschliche Stichprobe

Ein Richter-Modell ist kein Lehrer. Darum prüft ein Mensch einen festen Teil:

- **Welche**: jeder Fall, den Richter oder Code markiert haben, **plus** drei aus den unauffälligen,
  gezogen mit einem festen Seed (Standard: das Datum des Laufs). Derselbe Seed zieht dieselbe
  Stichprobe — sie ist nicht ausgesucht.
- **Der Bogen** (`…-stichprobe.md`) zeigt Frage, Lehrplanort und Erklärung, und vier leere Felder.
  Die Werte des Richters stehen **nicht** darauf: die prüfende Person soll nicht verankert werden.
- **Zurücklesen**: `GRADE10_FROM=lauf.json GRADE10_HUMAN=bogen.md pnpm eval:grade10` liest den
  ausgefüllten Bogen ein und schreibt den Bericht neu, mit Übereinstimmung je Kriterium (gleich,
  höchstens 1 auseinander, Richter großzügiger um …) — ohne das Modell noch einmal zu bezahlen.
- **Wer**: eine Lehrkraft des Fachs, oder zumindest jemand, der den Stoff unterrichtet hat. Bei
  weniger als 80 % „höchstens 1 auseinander" in der Richtigkeit gilt der Richter für dieses Fach
  als nicht belastbar, und die Zahlen dieses Fachs werden nicht verwendet.

## Ausführen

```bash
cd apps/api
# Vertex-Variablen in .env.local (docs/SETUP-VERTEX.md), lokales Postgres 16
LLM_BACKEND=vertex GRADE10_JSON=/tmp/klasse10.json pnpm eval:grade10          # alle Fälle
LLM_BACKEND=vertex pnpm eval:grade10 m-quadratisch c-redox                     # einzelne
GRADE10_FROM=/tmp/klasse10.json GRADE10_HUMAN=bogen.md pnpm eval:grade10       # mit dem Menschen
```

Ohne `LLM_BACKEND=vertex` bricht es sofort mit einer klaren Meldung ab. Kosten: je Fall ein Zug,
drei Richter-Aufrufe und bei sechs Fällen ein bis zwei Plan-Aufrufe.

## Bereits belegt (ohne Modell)

**Der Rechenweg-Prüfer liest manche richtigen Schritte als falsch.** `steps.ts` vergleicht
Gleichungen mit einer Variablen über proportionale Differenzen. Das erkennt eine verlorene Lösung
zuverlässig (x² = 4 → x = 2 wird zu Recht abgelehnt: −2 fehlt) — aber es lehnt auch richtige
Umformungen ab, die keine proportionale Differenz haben:

| Schritt               | Urteil `sameStep` | richtig wäre                  |
| --------------------- | ----------------- | ----------------------------- |
| `1/R = 1/2` → `R = 2` | different         | gleichwertig                  |
| `2^x = 16` → `x = 4`  | different         | gleichwertig                  |
| `x^2 = 4` → `x = 2`   | different         | nicht gleichwertig (−2 fehlt) |

Genau diese Schritte sind in Klasse 10 häufig: Parallelschaltung, Exponentialgleichungen,
Nullstellen. Folgen heute:

- Ein **eingetippter Rechenweg** (#209) mit so einem Schritt wird als „bricht in Zeile …"
  zurückgemeldet, obwohl er stimmt. Das betrifft die Übung seit #209, nicht erst das Vormachen.
- Das **Vormachen** fängt den letzten Schritt ab: eine Zeile, die das Ergebnis ist, zählt immer
  (`stepsTurn` prüft den Schlüssel vor der Gleichwertigkeit). Ein Plan, der so einen Schritt in der
  Mitte braucht, wird verworfen — die Frage geht dann ohne Vormachen weiter, und sie wird es
  ehrlich gesagt.
- Die Vormach-Aufgaben dieses Evals meiden solche Schritte bewusst, damit sie überhaupt etwas
  messen; die Erklärfälle fragen dagegen genau nach diesen Themen.

Vorschlag (nicht umgesetzt, gehört in ein eigenes Issue): bei einer Variablen, wenn die Differenzen
nicht proportional sind, die Lösungsmengen beider Zeilen numerisch bestimmen (Vorzeichenwechsel auf
festem Raster, Bisektion) und vergleichen — dann wäre `1/R = 1/2 → R = 2` gleichwertig und
`x² = 4 → x = 2` weiterhin nicht.

## Ergebnisse

Noch keine — siehe oben. Der erste Lauf schreibt `docs/evals/klasse10-<datum>.md` und ergänzt hier
die Liste der Schwächen.
