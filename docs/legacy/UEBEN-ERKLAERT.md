# LearnBuddy — Das Üben: Flows, Navigation und Konzept

Dieses Dokument erklärt, was das Üben in LearnBuddy bedeutet, wie der Lernende dorthin navigiert, und wie eine Übungs-Session von innen aussieht. Grundlage sind ausschließlich die Produkt-Docs (01–07, USER-FLOWS, USER-FLOWS-DEEP). Kein Code, keine Implementierung.

---

## 1. Was „Üben" eigentlich ist

LearnBuddy ist bewusst **keine Karteikarten-App und kein Quiz-Spiel**. Der Kern-Gedanke: Der Lernende fotografiert sein echtes Lernmaterial (Arbeitsblatt, Schulbuch, Mitschrift). Die KI extrahiert daraus Frage-Antwort-Paare. Das Üben ist dann ein Gespräch: Die App stellt Fragen, der Lernende antwortet — per Sprache, Text, Multiple Choice oder Formel. Die App akzeptiert paraphrasierte Antworten, gibt Hinweise statt sofort „Falsch!" zu sagen, und revisitiert schwache Stellen automatisch.

Das Üben ist das **primäre Erlebnis** der App. Alles andere — Material erfassen, organisieren, Admin — ist Vorbereitung oder Verwaltung dafür.

---

## 2. Navigation: Wie man zum Üben kommt

Es gibt drei Einstiegspunkte ins Üben, je nachdem wie fokussiert der Lernende arbeiten möchte.

### 2.1 Fach-weite Session (breitester Scope)

```
Home
  └── Fach-Kachel tippen  (z.B. "Biologie")
        └── Fach-Screen
              └── "Üben"-Button (groß, unten)
```

Der „Üben"-Button auf dem Fach-Screen startet eine Session über **alle Items des gesamten Fachs**. Der FSRS-Algorithmus (mehr dazu in §3) wählt still im Hintergrund die Items aus, von denen der Lernende jetzt am meisten profitiert. Das können Items aus verschiedenen Ordnern und Materialien sein.

Der Lernende sieht nicht, wie viele Items „fällig" sind — nur das erste Item erscheint direkt.

### 2.2 Ordner-Session (mittlerer Scope, ideal für Klassenarbeit-Vorbereitung)

```
Home
  └── Fach-Kachel tippen
        └── Fach-Screen → Tab "Ordner"
              └── Ordner tippen  (z.B. "Klassenarbeit Mitose 14.06.")
                    └── Ordner-Screen
                          └── "Üben"-Button (unten)
```

Der „Üben"-Button auf dem Ordner-Screen beschränkt die Session auf **Items dieses einen Ordners**. Das ist der wichtigste Flow für gezielte Prüfungsvorbereitung. Wenn ein Ordner ein Datum hat (z.B. der Test ist in 3 Tagen), gewichtet der Algorithmus Items aus diesem Ordner automatisch stärker — auch in der fach-weiten Session.

Auf dem Home-Screen erscheinen für solche Ordner kleine Chips: „Test in 3 Tagen".

### 2.3 Material-Session (engster Scope)

```
Home
  └── Fach-Kachel tippen
        └── Fach-Screen → Tab "Material" (oder aus einem Ordner heraus)
              └── Material tippen
                    └── Material-Screen
                          └── "Diesen Stoff üben"-Button
```

Der „Diesen Stoff üben"-Button startet eine Session, die auf **genau dieses eine Material** beschränkt ist (ein Arbeitsblatt, ein Buchkapitel etc.). Sinnvoll wenn der Lernende gezielt ein frisch erfasstes Material durchgehen will.

---

## 3. Das Herzstück: FSRS (Spaced Repetition)

Bevor die Session beginnt, läuft im Hintergrund der **FSRS-Algorithmus** (Free Spaced Repetition Scheduler). Er beantwortet die Frage: Welche Items sollte dieser Lernende jetzt üben?

FSRS ist kein simples „alles alphabetisch". Er modelliert, wann ein Lernender ein Item wahrscheinlich vergessen hat, und priorisiert genau diese Items. Wie das intern funktioniert, ist für den Lernenden vollständig unsichtbar.

**Was der Lernende sieht:** Das erste Item. Kein Warteschlangen-Zähler, keine „Du hast 18 fällige Fragen"-Meldung. Nie.

**Session-Cap:** Standardmäßig werden maximal 20 Items pro Session ausgewählt. Der Algorithmus wählt die besten 20 aus, nicht zufällig.

**Test-Folder-Bias:** Wenn ein Ordner ein bald kommendes Datum hat, gewichtet FSRS Items aus diesem Ordner stärker. Das passiert automatisch und wird dem Lernenden gegenüber nie kommuniziert.

---

## 4. Der Session-Ablauf im Detail

### 4.1 Aufbau des Session-Screens

Der Header zeigt den Fortschritt in der Form `5 / 18`. Es gibt einen Exit-Button — der Lernende kann jederzeit aufhören, ohne Strafe. Der Fortschritt wird gespeichert.

Jedes Item hat:

- **Stimulus-Bereich** (oben): Bild, Diagramm, Funktionsgraph, SVG — je nach Fragetyp. Kann auch leer sein.
- **Fragetext**: Kann LaTeX-Formeln enthalten (werden live gerendert).
- **Antwort-Bereich**: Abhängig vom Fragentyp (siehe §4.2).
- **Tipp-Button**: Erscheint nach einer falschen/unvollständigen Antwort.
- **„Erklär mir das"-Button**: Öffnet eine Erklärungs-Modal (immer verfügbar, außer im Test-Modus).

### 4.2 Die Antwort-Arten (Answer Kinds)

Die KI generiert Items in verschiedenen Formaten. Der Lernende hat ein Standard-Format (gesetzt im Profil), aber einzelne Fragen haben ihr Format fest vorgegeben:

| Art               | Beschreibung                           | Eingabe                                          |
| ----------------- | -------------------------------------- | ------------------------------------------------ |
| `short`           | Kurze Faktenfrage                      | TextInput + Mikrofon                             |
| `long`            | Erklärung / Aufsatz-artig              | TextInput + Mikrofon                             |
| `numeric`         | Zahl mit optionaler Einheit            | MathInput-Numerik + Einheits-Chip                |
| `formula`         | Mathematische Formel                   | MathInput mit Live-KaTeX-Vorschau + MathKeyboard |
| `multiple_choice` | Auswahl aus 3–4 Optionen               | Tippbare Karten                                  |
| `diagram_label`   | Diagramm mit nummerierten Markierungen | „Was ist Nummer 3?" + TextInput/Mikrofon         |
| `fill_blank`      | Lückentextformat                       | Inline-TextInputs im Fragetext                   |

### 4.3 Die Antwort-Auswertung: Zwei Stufen

#### Stufe 1: Lokale Auswertung (< 50ms, kein Netzwerk nötig)

Ein lokaler Evaluator auf dem Gerät prüft die Antwort nach festen Regeln:

- `short`: Token-Überlapp + String-Kanonisierung
- `numeric`: Toleranz ±1% relativ / ±0.01 absolut, Einheiten-Aliase erkannt
- `multiple_choice`: Exakter Vergleich
- `formula`: MathLite-Kanonisierung
- `long`: Delegiert immer an LLM (zu komplex für lokal)

Ergebnis entweder `correct`, `incorrect`, oder `unknown` (unklar).

#### Stufe 2: LLM-Auswertung (bei `unknown` oder `incorrect`)

Nur wenn die lokale Auswertung nicht sicher ist, geht die Antwort zum Server. Der LLM (Gemini 2.5 Flash-Lite auf Vertex AI) gibt zurück:

- **Verdict**: `correct` / `partially_correct` / `incorrect`
- **Feedback**: Ein-zwei Sätze, immer freundlich
- **Hint** (optional): Für den Tipp-Button
- Gestreamt via SSE — der Lernende sieht die Antwort erscheinen

### 4.4 Die Hinweis-Kaskade

Das zentrale Feedback-Design: Die App verrät die Antwort **nie** direkt — bis zur dritten falschen Antwort.

```
Falsche/Unvollständige Antwort
  └── Feedback-Karte: "Fast richtig — fehlt nur noch …"
        └── Tipp 1: Breit, lenkt die Aufmerksamkeit auf die Lücke
              └── Nochmal falsch:
                    └── Tipp 2: Konkreter, geht auf den fehlenden Teil ein
                          └── Nochmal falsch:
                                └── Antwort wird freundlich enthüllt
                                      "Die Antwort ist: …"
```

Kein „Falsch!" — immer „Fast richtig" oder „Nicht ganz". Die Tonalität ist immer ein älteres Geschwister / geduldiger Tutor.

### 4.5 „Erklär mir das"

Jederzeit während eines Items kann der Lernende `POST /explain` aufrufen. Eine Modal öffnet sich mit drei Stil-Optionen:

- **Einfacher**: Einfachste Sprache, ein alltagsnahes Beispiel
- **Schritt für Schritt**: Nummerierte Schritte
- **Analogie**: Erklärt durch eine Alltagsanalogie

Die Erklärung streamt live, das Modal schließt ohne Fortschrittsverlust.

### 4.6 Test-Modus

Eine alternative Session-Variante ohne Hilfen:

- Keine Tipps
- Kein „Erklär mir das"
- Feedback erst am Ende der Session
- Ideal für Probeklausuren
- Funktioniert auch offline

Das Ergebnis zeigt: Score (z.B. „16/20"), Liste der falsch beantworteten Fragen mit korrekten Antworten, „Diese 4 nochmal üben"-Button (dann normal, nicht im Test-Modus).

Der Einstieg in den Test-Modus ist laut Deep-Flows ein impliziertes Design, das noch ausgearbeitet werden muss — empfohlen wird ein dezenter „Test-Modus üben"-Link unterhalb des normalen Üben-Buttons, der nur erscheint wenn der Ordner ein bevorstehendes Datum hat.

---

## 5. Das Session-Ergebnis

Nach der Session (alle Items bearbeitet oder manuell beendet):

- **Items geübt**: Wie viele Items in dieser Session beantwortet wurden
- **Sitzen**: Items, die als `correct` bewertet wurden (intern als „gut bekannt" eingestuft)
- **Noch unsicher**: Items mit falschen oder teilweise richtigen Antworten
- **Streak-Update**: Ruhiger Hinweis „Heute geübt!" (KEIN „Du hast deinen Streak gebrochen"-Messaging, nie)

Primärer CTA: **„Nochmal mit den schwierigen"** — startet eine fokussierte Re-Session nur mit den unsicheren Items dieser Runde.

---

## 6. Mathe-Übungsläufe (Practice Runs) — ein besonderer Modus

Für Mathematik und Physik gibt es neben den normalen Sessions einen zusätzlichen Modus: **Practice Runs**.

Die KI generiert beim Erfassen von Material nicht nur Fragen, sondern auch **Aufgaben-Templates** — parametrisierbare Vorlagen für Aufgabentypen (z.B. „Berechne die Steigung einer linearen Gleichung" mit variablen Koeffizienten).

Wenn der Lernende eine solche Template-Aufgabe beantwortet, erscheint auf dem Ergebnis-Screen: **„10 ähnliche Aufgaben üben →"**

- Tippen startet einen Practice Run
- 10 Varianten werden **client-seitig** mit `mathjs` generiert (kein KI-Aufruf, keine Credits)
- Der lokale Evaluator bewertet alle Antworten
- Funktioniert vollständig offline
- Nach dem Run: Ergebnis, Durchschnittszeit, Schwierigkeitsanpassung für den nächsten Run
- Adaptive Schwierigkeit: Bei hoher Erfolgsquote werden die Parameter beim nächsten Run schwieriger gezogen

Das ist kein Ersatz für normale Sessions — es ist ein optionaler Drill-Modus für Aufgabentypen, bei denen viele Varianten helfen.

---

## 7. Offline-Üben

Das gesamte Üben funktioniert offline:

- FSRS wählt Items aus der lokalen SQLite-Datenbank
- Sprach- und Text-Antworten funktionieren vollständig
- Lokale Auswertung läuft auf dem Gerät (< 50ms)
- Items, die der lokale Evaluator nicht entscheiden kann (`long`, etc.), werden als `pending` markiert und mit „wartet auf Internet" angezeigt
- Beim nächsten Netzwerkzugang werden diese Antworten automatisch nachbewertet

Im Ergebnis-Screen gibt es dann drei Buckets: „Sicher", „Wartet noch auf Bewertung", „Noch unsicher".

---

## 8. Was der Lernende NIE sieht

Das ist genauso wichtig wie was er sieht:

- **Keine Zähler** für offene/fällige Items — weder auf dem Home-Screen noch anderswo
- **Keine „Du hast X Fragen nicht gemacht"**-Nachrichten
- **Kein Streak-Verlust-Alarm** — der Streak erscheint nur positiv, als stiller Fakt, nie als Druckmittel
- **Keine Hinweise auf den FSRS-Algorithmus** — der Lernende sieht nur die erste Frage
- **Keine Credit-Anzeigen** — Credits sind internes Buchungssystem, nie für den Lernenden sichtbar
- **Kein Schaming nach langer Abwesenheit** — wer nach 3 Wochen zurückkommt, sieht eine warme Begrüßung, keine Mahnungen

---

## 9. Karteikarten als Extra

Die Docs spezifizieren Karteikarten nicht als primären Lernmodus. Das Üben läuft über die Session-Logik mit FSRS, Hinweis-Kaskaden, und LLM-Bewertung.

**Die Ausgangslage für Karteikarten ist aber gut:** Beim Erfassen von Material generiert die KI automatisch Frage-Antwort-Paare. Diese Paare existieren bereits als strukturierte Daten in der Datenbank (`items` mit `question` + `expected_answer`).

**Was Karteikarten als Extra-Modus bedeuten würde:**

Ein Karteikarten-Modus wäre ein **alternativer Präsentationsstil** für diese bereits vorhandenen Items — statt der vollen Session-Logik (Auswertung, Hints, LLM) könnte der Lernende die Items im klassischen „Frage vorne / Antwort hinten umblättern"-Stil durchgehen und selbst entscheiden, ob er es wusste oder nicht.

**Das muss gut überlegt sein, weil:**

1. **Keine KI-Bewertung**: Beim klassischen Karteikarten-Modus bewertet der Lernende selbst. Das ist schlechter als die LLM-Bewertung, besonders für Paraphrasen — ein Kind tippt „Chloroplasten machen Photosynthese" und weiß nicht, ob das korrekt genug ist.

2. **FSRS-Kompatibilität**: FSRS braucht ein Verdict (correct/incorrect/partial), um den Zeitplan zu berechnen. Bei Selbstbewertung wäre das Verdict unzuverlässig — Kinder neigen zur Selbstüberschätzung.

3. **Positionierung vs. Haupt-Flow**: Wenn Karteikarten zu einfach und angenehmer sind als die volle Session, könnten Lernende den echten Übungs-Flow meiden. Die App will echtes Lernen, kein False Comfort.

4. **Sinnvoller Einsatz**: Karteikarten wären sinnvoll als schneller **Vor-Session-Warm-up** oder für **Material, das gerade frisch erfasst wurde** und das der Lernende sich erstmal kurz ansehen will, bevor die FSRS-Session beginnt. Nicht als Ersatz, sondern als ergänzendes Stöbern.

Der richtige Platz für diesen Feature-Gedanken ist ein ADR oder eine Design-Entscheidung, die klärt: In welchem konkreten Szenario ist ein Karteikarten-Modus besser als die existierende Session-Logik? Was genau wird damit anders/besser?

---

## 10. Zusammenfassung: Der komplette Pfad

```
Lernmaterial fotografieren (capture.tsx)
  └── KI extrahiert Text und generiert Items
        └── Items sind gespeichert (items-Tabelle)
              └── FSRS verwaltet den Wiederholungs-Plan

Üben starten
  └── Home → Fach → [optional: Ordner oder Material] → "Üben"
        └── Session startet mit FSRS-ausgewählten Items (max. 20)
              └── Item nach Item
                    ├── Antwort: Stimme / Text / MC / Formel / Numerik / Diagramm
                    ├── Lokale Auswertung
                    │     ├── Correct → 600ms "Stimmt!" → nächstes Item
                    │     └── Unknown → LLM bewertet → Feedback / Hint / Erklärung
                    ├── Hint 1 → Hint 2 → Antwort-Enthüllung
                    └── Item abgeschlossen → FSRS-Wiederholung aktualisiert

Session-Ende
  ├── Ergebnis: Geübt / Sitzen / Unsicher
  ├── "Nochmal mit den schwierigen" → Re-Session
  └── Optional: Mathe-Items mit Template → "10 ähnliche Aufgaben" → Practice Run
```

Alles davon funktioniert offline. Alles davon funktioniert ohne Zähler, Druck oder Gamification-Mechaniken.
