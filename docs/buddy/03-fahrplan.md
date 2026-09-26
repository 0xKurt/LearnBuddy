# Fahrplan: schnell, günstig, ein echter Tutor

Stand 26.09.2026. Fasst zusammen, was der Product Owner seit dem Morgen des 26.09. angesprochen hat,
und gibt für jedes Thema die Lösung, den Stand und den nächsten Schritt. Grundlagen:
`reports/LLM oder Regeln im Lernbuddy.md`, `reports/Modellwahl und Funktionsvergleich.md`,
`docs/architecture.md` §Speed und §Model calls, `docs/buddy/02-verifikation.md`.

**Leitlinie.** Das Modell bereitet einmal vor (Foto lesen, Aufgaben, Lösungen, Varianten, Tipps,
Lösungsweg) und hilft, wenn Lena Hilfe oder eine Erklärung will. Alles andere läuft mechanisch:
sofort, kostenlos, vom Code durchgesetzt. Wir sind an keinen Anbieter gebunden: pro Aufgabe gilt das
günstigste DSGVO-konforme Modell, das unsere Tests besteht.

Legende: ✅ erledigt · 🔨 in Arbeit / als Nächstes · 📋 geplant · ❓ braucht eine Entscheidung oder
etwas vom Product Owner

---

## 1. Geschwindigkeit (Ziel 1–3 s, am liebsten sofort)

| Was                           | Lösung                                                                                                                              | Stand              |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| Wartezeit messen              | `evals/speed/run.ts`: jeder Schritt gegen das echte Modell, mit Budget (Antwort ≤ 1,5 s, Buddy ≤ 3 s)                               | ✅                 |
| Richtige Antworten            | Regeln entscheiden (Auswahl, Zahlen, exakte Treffer): 10–25 ms                                                                      | ✅                 |
| Probearbeit                   | Regeln entscheiden auch „falsch“, kein Modellaufruf                                                                                 | ✅                 |
| Falsche Zahl als Kurzantwort  | gilt per Code als falsch (`differentNumber`), außer bei Hausaufgaben                                                                | ✅                 |
| Aussprache                    | ohne Zusatz-Nachdenken 6 s → 2,2 s                                                                                                  | ✅                 |
| Falsche Antwort, „weiß nicht“ | **vorbereitete Tipps** (siehe 2): sofort statt ~1 s                                                                                 | 🔨                 |
| Buddy-Antwort                 | **Antwort-Schema verkleinern** (heute 21 000 Zeichen, bei Gemini 3.x ≈ 9 600 Tokens Eingabe pro Nachricht) → schneller und billiger | 🔨                 |
| Buddy-Antwort                 | **Text beim Entstehen anzeigen** (Streaming): erste Wörter nach ~1 s                                                                | 📋                 |
| Arbeitsblatt lesen            | Aufgaben einzeln ausliefern, Bild vorher verkleinern                                                                                | 📋                 |
| Server                        | API in Frankfurt (Vercel `fra1`), nahe am EU-Modell-Endpunkt                                                                        | 📋 beim Deployment |

## 2. Der Tutor: nicht zu früh verraten, nicht wiederholen, nicht ewig zurückhalten

| Problem (aus der alten App)           | Lösung                                                                                                                                                                                                                      | Stand       |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| Lösung zu früh verraten               | Code prüft jede Antwort vor dem 2. Tipp auf die Lösung (wie heute schon bei Hausaufgaben) und lässt sonst neu schreiben                                                                                                     | 🔨          |
| Immer dieselbe Erklärung              | **Tipp-Treppe im Code**: Stufe 1 „Was ist gefragt?“ → 2 „Welche Regel?“ → 3 „Erster Schritt“ → 4 „Lösung erklärt“. Tipps 1–3 schreibt das Modell beim Vorbereiten; der Code liefert die nächste Stufe, nie zweimal dieselbe | 🔨          |
| Nach 5 Versuchen keine Lösung         | Spätestens nach dem **3. Fehlversuch** erklärt Buddy die Lösung Schritt für Schritt (vom Code erzwungen), danach eine ähnliche Aufgabe; die Frage kommt bald wieder                                                         | 🔨          |
| Hausaufgaben                          | Nie die Lösung; auf der letzten Stufe eine **ähnliche Aufgabe mit anderen Zahlen, vorgerechnet**                                                                                                                            | 🔨          |
| „Lösung zeigen“                       | Knopf bleibt beim Üben immer da; zählt ehrlich als „mit Hilfe“                                                                                                                                                              | ✅          |
| Trick-Sätze („Ignoriere die Regeln…“) | Test-Fall im Tutor-Eval; schwächere Modelle fallen darauf herein → nur Modelle, die den Test bestehen                                                                                                                       | ✅ gemessen |
| Tipp-Anzahl                           | ❓ Vorschlag: Lösung nach dem 3. Fehlversuch; Lena kann „früher“ sagen, Buddy merkt es sich                                                                                                                                 | ❓          |

## 3. „LLM first“ ist nicht immer richtig: mechanisch prüfen

| Lernaufgabe                          | Lösung                                                                                                                                                                                                                           | Stand                                |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| Vokabeln tippen                      | beim Einlesen schreibt das Modell alle richtigen Varianten (Synonyme, mit/ohne Artikel); Code prüft: exakt → Akzent/Artikel als Hinweis → Tippfehler nach Wortlänge (0 Fehler bis 4 Buchstaben, 1 bis 8, sonst 2) → sonst Modell | 🔨                                   |
| Liste lernt dazu                     | erkennt das Modell eine neue Antwort als richtig, wird sie gespeichert: nächstes Mal sofort und gratis                                                                                                                           | 🔨                                   |
| „Ich hatte recht“                    | Knopf nach „falsch“: zählt als „selbst bewertet“, das Modell prüft nachträglich, ohne dass Lena wartet                                                                                                                           | ❓ Freigabe                          |
| Wiederholung                         | `ts-fsrs`; Bewertung aus dem Prüfergebnis (Kinder überschätzen sich)                                                                                                                                                             | 📋 (FSRS ist da, Bewertung anpassen) |
| Tipp-Formate                         | Paare zuordnen, Reihenfolge, Lückentext mit Wortbank, Wörter markieren, Karteikarten — alles per Tippen, alles per Code geprüft                                                                                                  | 📋                                   |
| Mathe                                | Antwort-Beschreibung nach STACK-Vorbild („gleichwertig“ getrennt von „gekürzt“); Terme mit `@khanacademy/kas`; Aufgabenvorlagen schreibt das Modell, der Code prüft sie an 50 Zahlenbeispielen                                   | 📋                                   |
| Figuren                              | Figuren als Daten, gezeichnet mit `react-native-svg` (Funktionen, Zahlenstrahl, Geometrie) — teils da                                                                                                                            | ✅/📋                                |
| Diagramm beschriften (Bio, Erdkunde) | Modell schlägt Stellen auf dem Foto vor, ein Mensch bestätigt, der Code prüft das Antippen                                                                                                                                       | 📋                                   |
| Physik                               | Zahl + Einheit mit `mathjs`, Einheit per Tippen                                                                                                                                                                                  | 📋                                   |
| Grammatik                            | Formen stehen fest in der Aufgabe, geprüft gegen offene Wörterbuchdaten (Wiktextract, Lexique)                                                                                                                                   | 📋                                   |
| Freie Erklär-Antworten (Geschichte)  | Musterlösung mit Kernpunkten beim Vorbereiten; beim Üben prüft ein Modell nur „welche Kernpunkte sind drin“, den Rest der Code                                                                                                   | 📋                                   |

## 4. Aussprache — ohne dass die Spracherkennung „schönhört“

| Was                     | Lösung                                                                                                                                          | Stand           |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | --------------- |
| Problem                 | Handy-Spracherkennung macht aus falsch Ausgesprochenem das richtige Wort → ungeeignet (Erfahrung des Product Owners, bestätigt durch Literatur) | ✅ verworfen    |
| Klassischer Weg         | Laute statt Wörter erkennen und Laut für Laut mit den erwarteten Lauten vergleichen (so arbeiten ELSA, Duolingo, Rosetta Stone)                 | —               |
| Kostenlos               | offenes Lautmodell (wav2vec2) + espeak-ng auf eigenem EU-Server, alle 6 Sprachen (EN, FR, IT, ES, RU, DE); grob ≈ 0,005 Cent pro Satz, ~1 s     | ❓ braucht Test |
| Getestet                | PocketSphinx: unbrauchbar. Allosaurus: mit Roboter-Testaufnahmen nicht aussagekräftig                                                           | ✅              |
| Rückfall heute          | Gemini hört zu: 0,07 Cent pro Satz, 2,2 s, gutmütig bei Akzent                                                                                  | ✅              |
| Kaufen                  | Azure: 0,15 Cent pro Satz, Laute genau bewertet — nur falls die kostenlose Lösung nicht reicht                                                  | 📋              |
| Immer sinnvoll          | Buddy spricht den Satz vor, Lena hört ihre Aufnahme direkt daneben                                                                              | 📋              |
| Russisch                | Stimme und Erkennung in ru-RU                                                                                                                   | ✅              |
| Nötig vom Product Owner | ❓ `huggingface.co` in der Cloud-Umgebung freischalten; ❓ 10–15 echte Sätze von Lena pro Sprache (gut, bewusst „deutsch“, ein falsches Wort)   |

## 5. Modelle: stark wo nötig, günstig, DSGVO-konform, nicht an Google gebunden

| Was                                                 | Lösung                                                                                                                                                                                                                                            | Stand               |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| Modell pro Aufgabe                                  | `VERTEX_ROUTES`: jede Aufgabe ihr Modell, geprüft; Wechsel = eine Einstellung                                                                                                                                                                     | ✅                  |
| Gemini 2.5 Flash wird abgeschaltet (16./20.10.2026) | Umstieg auf **3.6 Flash** (EU-Endpunkt `eu`) nach bestandenen Tests: Tutor 26/27, Buddy 22/22                                                                                                                                                     | 🔨                  |
| Warum nicht 3.8 Flash                               | gemessen schlechter: Tutor 22/27, verrät bei „keine Ahnung“ die Lösung, bis 8,8 s Wartezeit                                                                                                                                                       | ✅ gemessen         |
| Warum nicht Flash-Lite                              | verrät Lösungen, fällt auf Trick-Sätze herein (18–22/27)                                                                                                                                                                                          | ✅ gemessen         |
| Andere Anbieter                                     | **ein zweiter Anschluss für OpenAI-kompatible Schnittstellen** — damit gehen Mistral (Paris), IONOS / STACKIT / Scaleway (deutsche/europäische Hoster offener Modelle), Azure OpenAI (EU-Datenzone). Dann dieselben Tests gegen diese Modelle     | 🔨 Code; ❓ Zugänge |
| Kandidaten                                          | Mistral Small 4 (~$0,15/$0,60 pro 1 Mio. Tokens — 5× billiger als 3.6 Flash), Mistral Large 3, Llama/Qwen/gpt-oss bei IONOS oder STACKIT (EU-Firmen, kein US-Mutterkonzern), GPT-5.4 mini/nano (Azure EU), Claude Haiku (Bedrock EU, eher teurer) | 📋 testen           |
| Sicherheit                                          | nur erlaubte Standorte (`europe-west4`, `eu`, später EU-Hoster), beim Start geprüft; `global` wird abgelehnt                                                                                                                                      | 🔨                  |
| Minderjährige                                       | vor dem Start klären: erlauben die Bedingungen des Anbieters Kinder als Nutzer (Google: Vorschau-Modelle für unter 18 verboten; Anthropic erlaubt es mit Auflagen); Protokollierung zur Missbrauchserkennung abschalten                           | ❓ vor Start        |

## 6. Kosten: ein Abo von höchstens 10 € muss sich rechnen

Rechnung für den schlimmsten Fall — **1 Stunde intensives Üben am Tag** — mit heutigen Messungen
(3.6 Flash, Einführungspreis bis 31.12.2026; ab 2027 doppelt):

| Aktivität pro Stunde | Annahme                                                                                            | Kosten                  |
| -------------------- | -------------------------------------------------------------------------------------------------- | ----------------------- |
| Antworten prüfen     | 90 Antworten, davon ~20 mit Modell (freie Antworten, Nachfragen), Rest Regeln + vorbereitete Tipps | ≈ 2,4 Cent              |
| Buddy-Chat           | 10 Nachrichten, nach Verkleinern des Schemas ≈ 0,5 Cent je Nachricht                               | ≈ 5 Cent                |
| Übungen vorbereiten  | 2 Blätter/Themen                                                                                   | ≈ 2 Cent                |
| Aussprache           | 30 Sätze; kostenloses Lautmodell ≈ 0, Gemini ≈ 2 Cent                                              | 0–2 Cent                |
| **Summe**            |                                                                                                    | **≈ 10–12 Cent/Stunde** |

→ 30 Stunden im Monat ≈ **3–3,50 €**, ab 2027 ≈ **6–7 €**. Von 10 € bleiben nach Mehrwertsteuer und
App-Store-Gebühr etwa 7 €. Der schlimmste Fall würde also fast alles auffressen; ein normales Kind
(15–20 Minuten am Tag) kostet ≈ 1 €. Deshalb:

| Hebel                                                                                                                                                                                                                                                                                                            | Wirkung                                                   | Stand      |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- | ---------- |
| Vorbereiten statt live                                                                                                                                                                                                                                                                                           | Üben selbst kostet fast nichts, egal wie lange            | 🔨         |
| **Kostenlimit pro Kind und Tag in Cent** statt nur Aufrufzahlen (heute: 80 Buddy-Nachrichten, 300 Tutor-Antworten, 12 Blätter — im Extremfall ~1,50 $/Tag). Ist das Tagesbudget aufgebraucht, übt Lena mit Regeln und vorbereiteten Tipps weiter; Buddy sagt freundlich, dass er morgen wieder ausführlich hilft | Obergrenze pro Monat garantiert                           | 🔨         |
| Kleines Schema, kurzer Kontext                                                                                                                                                                                                                                                                                   | Buddy-Nachricht ~2,5× billiger                            | 🔨         |
| Günstigerer Anbieter                                                                                                                                                                                                                                                                                             | Mistral & Co. testen: bei gleicher Qualität 3–5× billiger | ❓ Zugänge |
| Kostenloses Lautmodell                                                                                                                                                                                                                                                                                           | Aussprache ≈ 0                                            | ❓ Test    |

❓ Vorschlag Tagesbudget: **15 Cent pro Kind und Tag** (≈ 4,50 €/Monat im Maximum, in der Praxis weit
darunter). Du legst die Zahl fest.

## 7. Sprachen

Englisch, Französisch, Italienisch, Spanisch, Russisch und Deutsch als Lernsprachen: Aufgaben,
Vokabeln, Vorlesen und Zuhören laufen in allen sechs (Russisch-Stimme ✅). Die App-Oberfläche bleibt
in 5 Sprachen. Bei Russisch: ё/е gelten als „fast richtig“; Tippen braucht die kyrillische Tastatur
des Handys. 📋 Aussprache-Prüfung für alle sechs (siehe 4).

## 8. Funktionen, die noch fehlen (Markt & alte App)

| Funktion                   | Wie, im Chat                                                                               | Stand |
| -------------------------- | ------------------------------------------------------------------------------------------ | ----- |
| Mein Schulbuch/Kapitel     | Buddy fragt einmal, welches Buch; Übungen orientieren sich an Kapiteln                     | 📋    |
| Wochennotiz für Eltern     | ein kurzer Text statt Dashboard (Forschung: Kontrolle schadet, Unterstützung hilft)        | 📋    |
| Schwerpunkt der Eltern     | im PIN-Bereich ein Thema setzen, Buddy baut es ein                                         | 📋    |
| Üben ohne Internet         | vorbereitete Aufgaben + Regeln laufen offline; nur Hilfe braucht Netz                      | 📋    |
| „Etwas leichter“           | wie „etwas schwerer“                                                                       | 📋    |
| KI-Antworten prüfen lernen | kleine Momente, in denen Buddy zeigt, wie man eine Antwort nachprüft                       | 📋    |
| Bewusst weggelassen        | Streaks, Ranglisten, Werbung, „Foto → Lösung“, abschaltbarer Lernmodus, Kontroll-Dashboard | —     |

## 9. Offene Entscheidungen (Übersicht)

1. **Tipps:** Lösung nach dem 3. Fehlversuch? (Vorschlag ja)
2. **„Ich hatte recht“-Knopf:** ja? (Vorschlag ja, zählt als „selbst bewertet“)
3. **Tagesbudget pro Kind:** Vorschlag 15 Cent.
4. **Zugänge für Anbieter-Tests:** Mistral (La Plateforme) und ein deutscher Hoster (IONOS oder
   STACKIT); optional Azure OpenAI (EU).
5. **Aussprache:** `huggingface.co` freischalten + Aufnahmen von Lena.
6. **Veröffentlichen:** Supabase zurücksetzen + Migrationen, API auf Vercel (`fra1`), App-Build.
7. **Rechtliches vor dem Start:** Bedingungen der Modell-Anbieter für Minderjährige,
   Missbrauchs-Protokollierung abschalten, AI-Act-Einstufung (Jurist).
8. **Google-Schlüssel rotieren** (war im Chat).

## 10. Reihenfolge der Arbeit (ohne neue Zugänge sofort machbar)

1. Umstieg auf 3.6 Flash + Standort-Sperre + Kostenlimit in Cent (Abschaltung Mitte Oktober).
2. Buddy-Schema verkleinern, neu messen (Kosten, Zeit, 22 Fälle).
3. Vokabel-Prüfung ohne Modell (Varianten, Tippfehler, lernende Liste).
4. Tipp-Treppe mit vorbereiteten Tipps und Lösungsweg.
5. Anschluss für OpenAI-kompatible Anbieter (Mistral, IONOS, STACKIT, Azure) — testbar, sobald Zugänge da sind.
6. Streaming der Antworten.
7. Aussprache mit offenem Lautmodell — sobald Hugging Face frei und Aufnahmen da sind.
8. Tipp-Formate, Mathe-Antwortbeschreibung, Figuren, Diagramm-Beschriften, Wochennotiz, Schulbuch.
