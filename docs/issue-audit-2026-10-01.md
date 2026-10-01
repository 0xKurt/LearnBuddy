# Issue-Audit 01.10.2026 — was von den 30 offenen Issues echt ist

**Stand:** 01.10.2026, `main` = `1243e16`. Jede Behauptung unten ist gegen den Code in
`origin/main` geprüft, nicht gegen den Issue-Text. Wo ein Issue sagt „erledigt", steht hier der
Commit und die Zeile, die es belegt — oder der Grund, warum es nicht stimmt.

> **Dieses Dokument ändert nichts.** Kein Issue wurde geschlossen, beschriftet, bearbeitet oder
> kommentiert. Es ist eine Bestandsaufnahme zum Lesen und Entscheiden.

**Ein Befund vorweg, der jede Zeile unten betrifft:** der Arbeitsbaum ist schmutzig. Die Fixes
für **#192** (Kugel auf weißem Kasten) und **#188** (Feld wächst im Web nicht) liegen fertig
geschrieben in den Dateien, sind aber **nicht committet und nicht in `main`**. Dazu 20 weitere
geänderte und 7 unverfolgte Dateien (Komponenten-Test-Harness). Beide Issues lesen sich wie
erledigt und sind es nicht.

---

## Zahlen

| Eimer                   | Anzahl | Issues                                                                                                            |
| ----------------------- | ------ | ----------------------------------------------------------------------------------------------------------------- |
| **DONE**                | 1      | #187                                                                                                              |
| **DONE-BUT-UNVERIFIED** | 1      | #127                                                                                                              |
| **BLOCKED-ON-OWNER**    | 9      | #32 · #41 · #126 · #130 · #133 · #147 · #165 · #176 · #189                                                        |
| **REAL AND OPEN**       | 17     | #35 · #37 · #59 · #107 · #162 · #164 · #166 · #168 · #169 · #175 · #177 · #183 · #184 · #186 · #188 · #192 · #193 |
| **STALE**               | 2      | #6 · #44                                                                                                          |
| **DUPLICATE**           | 0      | — (vier Überlappungspaare, siehe §Überlappungen)                                                                  |
| **Summe**               | **30** |                                                                                                                   |

---

## Die Tabelle

| #   | Titel (gekürzt)                              | Eimer               | Quelle               | Beleg / was fehlt                                                                                             |
| --- | -------------------------------------------- | ------------------- | -------------------- | ------------------------------------------------------------------------------------------------------------- |
| 193 | Welche Fächer, welche Aufgabenformen         | REAL AND OPEN       | **Owner**            | Neu (01.10. 18:26), nichts getan. Titelangabe „vier Formen" ist falsch: `ItemKind` hat sieben                 |
| 192 | Dunkelmodus: Kugel auf weißem Kasten         | REAL AND OPEN       | **Owner**            | Fix nur im Arbeitsbaum (`SplashHandoff.tsx` → `BuddyOrb`), **nicht in main**; nativer Splash weiter hart hell |
| 189 | Ein Ort zum Nachschlagen: die Fächer         | BLOCKED-ON-OWNER    | **Owner**            | Drei Produktfragen unbeantwortet. Prämisse teils falsch: `library.tsx` gruppiert längst nach Fach             |
| 188 | Im Web wächst das Feld gar nicht             | REAL AND OPEN       | Agent (zu #187)      | `numberOfLines: 1` steht in main; `growsWithText` liegt unverfolgt im Arbeitsbaum                             |
| 187 | Senden steht 8 pt höher                      | **DONE**            | **Owner**            | `6a5866c` + Test `the composer row stays one row when the field grows`                                        |
| 186 | Aussprache-Leiste: vier Knopfformen          | REAL AND OPEN       | **Owner**            | Bestätigt: 2× `ListenButton` (`Pressable`) + 1 `Btn` primary + 1 `Btn` ghost + `HelpChips`                    |
| 184 | Buddy wiederholt sein eigenes Angebot        | REAL AND OPEN       | Agent (Messung)      | Eval-Fall ist rot (48/49); Fix am Zustand nicht gebaut                                                        |
| 183 | Englischer Jargon-Fehler im Toast            | REAL AND OPEN       | Agent (Gerät)        | Quelle weiter unbekannt; kein globaler Handler gefunden, kein Riegel gebaut                                   |
| 177 | Navigationsleiste weiß bei offenem Sheet     | REAL AND OPEN       | Agent (Gerät)        | `Sheet.tsx` trägt beide Translucent-Props + Kommentar „löst es nicht"; ungelöst                               |
| 176 | Buddys echte Stimme war nie eingeschaltet    | BLOCKED-ON-OWNER    | **Owner**            | `f7b216f` (Boot-Warnung, `/health voice`); `SPEECH_BACKEND` default `disabled`                                |
| 175 | Aussprache stimmt oft nicht                  | REAL AND OPEN       | **Owner**            | Brüche `fbf572a`, Potenzen/Einheiten `4d86899`; offen: Ordnungszahlen, `3:4`/`14:30`                          |
| 169 | Erlebte Wartezeit am Gerät                   | REAL AND OPEN       | **Owner**            | `d292023` misst den Zug (2 654 ms); Aussprache-Pfad + Maßnahme offen; Zahlen nicht in `docs/speed-audit.md`   |
| 168 | +39 % Eingabe-Tokens seit 28.09.             | REAL AND OPEN       | **Owner**            | Kein Commit. Widerspricht #166 Befund 5 (siehe §Widersprüche)                                                 |
| 166 | [Spike] Tempo mit den jetzigen Modellen      | REAL AND OPEN       | **Owner**            | Recherche geliefert; die Hebel A/B/D/E/H sind ungebaut                                                        |
| 165 | [Spike] milliseconds.ai, Mistral, Cloudflare | BLOCKED-ON-OWNER    | **Owner**            | Bewertung geliefert; nächster Schritt braucht Zugänge                                                         |
| 164 | Unklarheit grob, keine Gegenrede             | REAL AND OPEN       | Agent (Produktplan)  | Zweite Hälfte `ab637f5` + `0062_disputed_verdicts.sql`; erste Hälfte offen                                    |
| 162 | Keine Lernfläche zum Arbeiten                | REAL AND OPEN       | Agent (Produktplan)  | Bestätigt: `components/math/` kann nur anzeigen                                                               |
| 147 | Vokabeln brauchen eine eigene Übungsform     | BLOCKED-ON-OWNER    | **Owner**            | Stufe 1 `a992496` (`tapChoices.ts`); Stufen 2/3 warten auf seine Antwort                                      |
| 133 | Audit 30.09.: die fünfzehn kleineren Befunde | BLOCKED-ON-OWNER    | Agent (Audit)        | 14/15 belegt erledigt; nur Position 18 (TalkBack am Gerät) offen                                              |
| 130 | Release-Build trägt keine Konfiguration      | BLOCKED-ON-OWNER    | Agent (Audit)        | `eas.json` `production` hat weiter **kein** `env`; `preview` 3 von 7                                          |
| 127 | „Fühlt sich alles schlechter an"             | DONE-BUT-UNVERIFIED | **Owner**            | `49ce7fa` + `0d8d771`: gemessen, Ursache gefunden → #184. Sein Urteil fehlt                                   |
| 126 | „Hakelig"                                    | BLOCKED-ON-OWNER    | **Owner**            | Befund 2 `6b62b33` (`lib/theme/reduceMotion.ts`); Befund 1 ist seine Systemeinstellung                        |
| 107 | Buddy-Starterkit                             | REAL AND OPEN       | **Owner**            | Vom Owner ausdrücklich geparkt; keine offene Entscheidung                                                     |
| 59  | Tempo insgesamt (Dachissue)                  | REAL AND OPEN       | **Owner**            | Abnahme „erste Worte < 1,5 s" am Gerät mit 2,65 s **widerlegt**                                               |
| 44  | Release-Checkliste für den Test (29.09.)     | STALE               | Agent (Sammelstelle) | Der Test war am 29.09.; der Körper ist ein Verlaufsprotokoll                                                  |
| 41  | Sprach-Latenz: erster Satz, Wieder-Zuhören   | BLOCKED-ON-OWNER    | **Owner**            | `3cd8fb6`, `92b412e`; zwei Zahlen fehlen, dafür braucht es sein Mikrofon                                      |
| 37  | Maestro-Gerätetests einrichten               | REAL AND OPEN       | **Owner**            | **Der genannte Blocker ist weg:** Temurin 27 + Maestro sind installiert                                       |
| 35  | Barge-in im Gesprächsmodus                   | REAL AND OPEN       | **Owner**            | `3636fc0` lieferte das Teilstück; echtes Reinreden braucht Duplex-Stack                                       |
| 32  | DPIA schriftlich                             | BLOCKED-ON-OWNER    | Agent (Research)     | `docs/dpia.md` Fassung 3 steht; §7 hat 12 Punkte, 11 davon seine                                              |
| 6   | Prototyp aufs Android-Handy                  | STALE               | Agent (To-do-Liste)  | Der Prototyp läuft seit 28.09. auf dem Handy                                                                  |

---

## Detail je Issue

### DONE

#### #187 — „Mehrzeiliges Eingabefeld: Senden steht 8 pt höher als seine Nachbarn"

**Commit `6a5866c`.** Die beiden Bedienelemente am Ende stehen jetzt in ihrer eigenen Zeile, die
`alignItems: 'flex-end'` wieder durchsetzt, mit eigenem Abstand `SPACE.sm`:

```tsx
<View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: SPACE.sm }}>
```

Alle drei sind 44 pt hoch (`Btn` `SIZE_STYLE.sm = { height: 44, … }`). Der Test in
`tests/web/layout.spec.ts` hält es fest:

```ts
expect(gap, 'send and the waveform have real air between them').toBeGreaterThanOrEqual(6);
```

**Einschränkung, die bleibt:** Der Test prüft im Browser nur den **einzeiligen** Fall, weil dort
das Feld nicht wächst — genau das ist #188. Der mehrzeilige Fall ist nur durch die
Gerätesichtprüfung im Commit belegt („Am Gerät bei fünf Zeilen geprüft"), nicht automatisiert.

### DONE-BUT-UNVERIFIED

#### #127 — „Fühlt sich alles schlechter an als vorher"

Alle messbaren Abnahmepunkte sind erfüllt:

- **#124/#126 weg** — #124 geschlossen, #126 Befund 2 in `6b62b33`.
- **Prompt-Länge gemessen** (`49ce7fa`): buddy.26 → buddy.45 sind 14 041 → 21 859 Zeichen (+56 %),
  und die Vermutung „deshalb langsamer" hält nicht.
- **„Fragt er mehr zurück?" gemessen** — null von vier Zügen. Die Vermutung hält nicht.
- **Die echte Ursache gefunden** (`0d8d771`): `turns[].tools` war `[] as string[]` — jede Prüfung
  „was hat dieser Zug getan" las eine leere Liste und bestand aus Versehen. Danach war sofort
  sichtbar, dass Buddy sein eigenes Angebot dreimal wiederholt → **#184**.

**Was fehlt und nur von ihm kommt:** sein erneutes Urteil, und die ein bis zwei echten Sätze aus
seinem Test (oder die Uhrzeit), die das Issue ausdrücklich erbittet. Inhaltlich ist der
Arbeitsteil nach #184 gewandert.

### BLOCKED-ON-OWNER

#### #32 — DPIA

`docs/dpia.md` steht in Fassung 3 (`6e8290f`, 30.09.), nach Art. 35 Abs. 7 lit. a–d gegliedert,
jeder Beleg mit Datei und Symbol. §7 listet zwölf offene Punkte; elf davon sind Konsolen-,
Vertrags- oder Prüfarbeit, der zwölfte ist seine Durchsicht. Zusätzlich steht in §1 noch
„Verantwortlicher: der Betreiber der App (Privatperson; Familienbetrieb)", während #107 die Firma
beschlossen hat (siehe §Widersprüche).

#### #41 — Sprach-Latenz

`3cd8fb6` und `92b412e` haben alles gemessen, was ohne Gerät messbar ist: Synthese kreuzt die
Sekunde bei 100–110 Zeichen, `OPENING_MAX = 110` ist damit gemessen statt geraten, und der
Dev-Build loggt `first_audio`/`relisten` jetzt auch über `adb logcat`. Die zwei Abnahmezahlen
brauchen echtes Sprechen ins Mikrofon.

#### #126 — „Hakelig"

Befund 2 ist in `main` und sauber: `lib/theme/reduceMotion.ts` ist die reine Entscheidung,
`enter.ts` tut jetzt, was sein Dateikopf immer behauptet hat (Überblenden bleibt, Bewegung fällt
weg). Befund 1 — alle drei Animationsskalen auf seinem Gerät stehen auf 0 — ist eine
Systemeinstellung, die niemand ohne sein Wort anfasst. Nachtrag vom 01.10. ist richtig: der
sichtbarste Teil ist seit `31e0d11` ohnehin weg (Buddys Mond bewegt sich unabhängig davon).

#### #130 — Release-Build ohne Konfiguration

Unverändert wahr, nachgeprüft: `apps/mobile/eas.json` `build.production` ist
`{ "channel": "production", "autoIncrement": true }` — **kein `env`**. `preview` setzt drei von
sieben. `lib/env.ts` liest `PRIVACY_URL`, `IMPRINT_URL`, `SUPPORT_EMAIL`, `SENTRY_DSN` jeweils mit
`?? ''`, also verschwinden sie still.

#### #133 — Audit 30.09., Positionen 4–18

Vierzehn der fünfzehn sind belegt erledigt; ich habe fünf davon stichprobenartig im Code
nachgeprüft und alle fünf stimmen:

- Position 5: `lib/auth/session.ts:44` → `SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY`
- Position 8: `app.json` hat weder `associatedDomains` noch `intentFilters`
- Position 9: `app/profile.tsx:88` → `useFormDraft('profile', …)`
- Position 13: `lib/a11ySettings.ts` liest `isBoldTextEnabled` und `isReduceTransparencyEnabled`
- Position 15: `app.json:16` → `"ITSAppUsesNonExemptEncryption": false`

**Offen: nur Position 18** (TalkBack/VoiceOver-Durchgang am Gerät) und `extra.appStoreId`, das es
erst gibt, wenn die App im Store angelegt ist (gehört zu #130). Der Issue-Körper selbst ist
beschädigt — siehe §Titel und Körper.

#### #147 — Vokabeln

Stufe 1 ist gebaut (`a992496`, `apps/api/src/modules/practice/tapChoices.ts`): vier Wörter zum
Antippen, Ablenker aus ihrem eigenen Satz, Reihenfolge stabil per ID-Hash, nur wenn die Antwort in
ihrer Sprache steht. Stufen 2 (Lernkarten mit Selbsteinschätzung) und 3 (Bildzuordnung) warten
ausdrücklich auf seine Antwort.

#### #165 — Spike: andere Anbieter

Die Bewertung ist vollständig und ehrlich (milliseconds.ai ❌ kein Tutor-Modell und keine
EU-Prüfung möglich; Mistral 🟡 Kostenhebel, kein Tempohebel; Cloudflare 🟡 nur als Testfall-
Generator). Der nächste Schritt steht im Issue selbst: „Dafür werden Zugänge gebraucht: Mistral,
Groq, Azure Speech."

#### #176 — Buddys echte Stimme

In `main` (`f7b216f`) ist genau das, was ohne ihn geht:

```ts
// apps/api/src/config.ts
if (c.SPEECH_BACKEND !== 'google') {
  warnings.push("SPEECH_BACKEND is not 'google': Buddy has no natural voice, …");
}
// apps/api/src/app.ts:171
voice: deps.speech.available,
```

`SPEECH_BACKEND` ist weiter `z.enum(['google','disabled']).default('disabled')`. Der vierte
Abnahmepunkt („ein Ausfall der natürlichen Stimme steht in den Logs") ist noch nicht gebaut, ist
aber ohnehin erst prüfbar, wenn die Stimme an ist.

#### #189 — Ein Ort zum Nachschlagen

**Die Prämisse ist teils falsch, und das ändert den Umfang.** Das Issue schreibt, „Materialien"
liste die Blätter „eins nach dem anderen, in der Reihenfolge, in der sie fotografiert wurden".
`app/library.tsx` gruppiert seit Längerem **nach Fach** — der Contract `LibraryView` liefert
`subjects: [{ id, name, kind, materials }]` plus `unsorted`, und der Screen baut daraus
Überschrift-plus-Blätter-Gruppen. Ebene 1 existiert also. Was fehlt, ist Ebene 2: in ein Fach
hineingehen und dort Übungen, Ergebnisse und Themen sehen, nicht nur Blätter. Dazu drei
unbeantwortete Fragen (nach Fach oder nach Zeit? Übungen wiederholbar? welches Wort?), und das
Issue sagt selbst, es sei „vor der Arbeit mit dem Owner abzustimmen".

### REAL AND OPEN

#### #35 — Barge-in (P3)

`3636fc0` lieferte das ehrliche Teilstück (Tipp auf Buddy unterbricht und hört sofort zu). Die
Grenze ist in `docs/speed-audit.md` dokumentiert: ohne verlässliche Echo-Cancellation würde das
offene Mikrofon Buddy selbst hören. Echtes Reinreden braucht einen Duplex-Stack und zuerst einen
Gerätetest.

#### #37 — Maestro-Gerätetests

**Der im Issue genannte Blocker existiert nicht mehr.** Das Issue sagt
„Unable to locate a Java Runtime" und „auf dem Rechner ist kein JDK". Geprüft:

```
/usr/bin/java → openjdk version "27" 2026-09-15 (Temurin-27+35)
/Users/kurt/.maestro/bin/maestro → startet
```

Die vier Flows liegen in `.maestro/flows/` (`01-welcome`, `02-sign-in`, `03-chat`, `04-voice`).
`docs/OWNER-INPUT.md` §5 sagt zudem, er sei auf dem Gerät angemeldet. Damit ist das hier kein
Owner-Blocker mehr, sondern Arbeit: einmal laufen lassen. Das hängt an drei anderen Issues (#41,
#133 Position 18, #126 Befund 1).

#### #59 — Tempo insgesamt (Dachissue)

Die Hebel #8, #9, #19, #24, #25, #41 (Teil), #48, #56, #66 sind erledigt und belegt. Was dieses
Issue offen hält, ist seine eigene Abnahme — und die ist seit #169 **widerlegt**, nicht nur
unbelegt: „erste Worte im Chat < 1,5 s" steht am Gerät bei **2 654 ms** (Median aus fünf Zügen).
Dazu hat der Owner am 01.10. das Ziel verschärft („Gespräch und Übungen: < 1 s bis zur
Reaktion"). Die Gerätezahlen aus #169 stehen **nicht** in `docs/speed-audit.md`, obwohl die
Abnahme das verlangt.

#### #107 — Buddy-Starterkit

Vollständiges Konzept, alle Entscheidungen getroffen (Option B, Zero X Ventures als
Verantwortlicher, neutraler Referenz-Buddy statt erstem Konfig-Buddy). Vom Owner am 29.09.
ausdrücklich geparkt: „⏸ Geparkt – Plan für später, kein To-do." Nichts zu tun, nichts zu
entscheiden, nicht schließen — das ist die Vorlage für den Tag, an dem ein zweiter Buddy konkret
wird.

#### #162 — Keine Lernfläche

Bestätigt: `apps/mobile/components/math/` enthält `FigureView`, `MathKeys`, `MathText`,
`TypedMathPreview`, `ZoomableFigure`, `useSpokenMath` — alles Anzeigen und Eingeben, nichts, womit
sie _arbeiten_ kann. Bruchbalken und Zahlenstrahl gibt es nicht. Hängt an #157 (geschlossen) und
trägt die erste Hälfte von #164.

#### #164 — Unklarheit und Gegenrede

Die **zweite** Hälfte ist in `main` und gut belegt: Migration
`infra/supabase/migrations/0062_disputed_verdicts.sql`, `session_items.state_before` wird beim
Schließen geschrieben (`practice/service.ts:1156`), und zwei Integrationstests halten es fest:

```
takes a judgement back that she says is wrong, FSRS and all (#164)
there is nothing to disagree with before a judgement (#164)
```

Die **erste** Hälfte — bei einer unlesbaren Stelle den Ausschnitt zeigen und fragen („ist das 12
oder 17?") — ist offen und braucht Koordinaten aus der Extraktion plus eine Zuschneide-Ansicht.
Gehört laut Issue zu #162.

#### #166 — Spike: Tempo mit den jetzigen Modellen

Die Recherche ist vollständig und gut: zehn Hebel (A–J) mit erwarteter Wirkung und Risiko, die
Owner-Rückmeldung eingearbeitet, das Ziel neu gefasst. Gebaut ist davon nichts. #169 hat
inzwischen Plan-Punkt 1 (Gerätemessung) zur Hälfte erledigt und die Reihenfolge verschoben: der
Weg über Vercel ist der größere Posten, also rücken Hebel I und D nach vorn.

#### #168 — +39 % Eingabe-Tokens

Kein Commit, kein Anfang. Die Messung steht (15 014 → 20 878 Eingabe-Tokens, 1,22 → 1,47 s bis
zum ersten SSE-Event). Der Plan ist richtig herum gebaut (erst messen, was benutzt wird, dann
schneiden). **Achtung:** die Begründung im Issue („der Präfix-Cache fängt den Preis ab, die
Latenz aber nicht") steht im Widerspruch zu #166 Befund 5 — siehe §Widersprüche.

#### #169 — Erlebte Wartezeit am Gerät

`d292023` hat den gewöhnlichen Zug am Xiaomi gemessen: `send` Median 0 ms, `reply` Median
2 654 ms, und damit belegt, dass über vierzig Prozent der Wartezeit außerhalb des Modells liegen
(Server: 1,47 s bis zum ersten Ereignis). Zwei Dinge offen:

1. **Der Aussprache-Pfad** — die Marken `speak_finish`/`speak_wait`/`speak_total` liegen in
   `SpeakPanel.tsx` bereit, aber die Mikrofonberechtigung für den Dev-Build ist nicht erteilt.
   Ein Tipp auf „Erlauben", dann sind es zwei Minuten. (Das ist der einzige owner-gebundene Teil.)
2. **Die Maßnahme mit Vorher/Nachher** — nicht begonnen.

Außerdem stehen die Zahlen nur im Commit und im Issue-Kommentar, nicht in `docs/speed-audit.md`.

#### #175 — Aussprache

Zwei Runden sind in `main` und sauber gebaut:

- **Brüche** (`fbf572a`): `apps/mobile/lib/math/words.ts` + `locales/<lang>/math.json`,
  Nenner 2–20/100/1000 in Einzahl und Mehrzahl, fünf Sprachen, ehrlicher Rückfall bei 2/75.
  Der eigentliche Fund steht im Dateikopf: die Tests trugen vorher ihre eigenen handgeschriebenen
  Kopien der Wörter und liefen grün, während die App etwas anderes sagte.
- **Potenzen und Einheiten** (`4d86899`): `5²` → „5 hoch 2", `3 cm²` → „3 Quadratzentimeter",
  `15 °C` → „15 Grad Celsius", sechzehn Schuleinheiten in fünf Sprachen mit Kompositumform.

**Offen und nachgeprüft:** `SYMBOL_KEYS` in `lib/math/speak.ts` bildet `':' → 'div'` ab, also sind
`3:4` (Verhältnis) und `14:30` (Uhrzeit) weiterhin beide „geteilt durch". Das ist eine bewusste
Entscheidung (Raten wäre Regel 3), hängt aber an einer Schema-Änderung, die das Issue bei #157
verortet — und **#157 ist geschlossen**, der Haken hängt also im Leeren. Ordnungszahlen („3." →
„dritte") sind ebenfalls offen.

#### #177 — Navigationsleiste weiß bei offenem Sheet

Bestätigt und ehrlich dokumentiert. `lib/theme/systemChrome.ts` ruft
`NavigationBar.setStyle(isDarkBackground(palette.bg) ? 'dark' : 'light')` — das wirkt auf das
Fenster der Activity. `components/lb/Sheet.tsx` trägt `statusBarTranslucent` und
`navigationBarTranslucent` plus den Kommentar, dass sie es am Gerät **nicht** behoben haben. Drei
Nächste-Schritte stehen im Issue; der dritte (Config-Plugin) ist wahrscheinlich der richtige.

#### #183 — Englischer Jargon-Fehler im Toast

Nachgeprüft, was das Issue ausschließt, und es stimmt: `lib/errors.ts:15` fällt auf
`errors:code.internal` zurück, nie auf `err.message`. Ich habe darüber hinaus gesucht und
**keinen** Pfad gefunden, der einen rohen Fehlertext in `toast.show` gibt: kein `ErrorUtils`-
Handler, kein `unhandledrejection`-Handler, kein `err.message` in einem Toast-Aufruf. Die Quelle
ist also weiter unbekannt — das Issue hat recht, dass sie gefunden und nicht geraten werden muss.
Der zweite Teil (ein Test, der jeden Toast-Text gegen die Locale-Dateien hält) wäre der ehrliche
Riegel und existiert nicht. Der dritte Teil (ein Fehler-Toast überlebt keinen Bildschirmwechsel)
ist in `lib/toast.ts:129` bereits so gebaut — `survivesNavigation` muss ausdrücklich gesetzt
werden, und keine der sieben Fundstellen setzt es für einen Fehler.

#### #184 — Buddy wiederholt sein eigenes Angebot

**Das ist der wichtigste offene Befund der ganzen Liste.** Der Eval-Fall
`de_a_whole_afternoon_is_not_an_interrogation` in `apps/api/evals/buddy/cases.ts` prüft es
inzwischen und ist **rot** (48/49):

```ts
...must(
  offers <= 1,
  `offers the same practice in ${offers} turns — the first one is still standing`,
),
```

Der Fix hängt am Zustand (ein offenes Angebot und eine vorbereitete, nicht gestartete Übung
müssen sichtbar sein, bevor er ein zweites anlegt) und braucht einen `BUDDY_PROMPT_VERSION`-Bump
plus einen vollen Eval-Lauf. Nichts davon ist begonnen.

#### #186 — Vier Knopfformen in der Aussprache-Leiste

Bestätigt durch Lesen von `components/practice/SpeakPanel.tsx`:

- `HelpChips` („Lösung zeigen") — Chip/Textlink
- zwei `ListenButton` nebeneinander („Anhören" · „Langsam anhören") — rohe `Pressable`
- ein `Btn size="lg" full variant="primary"` („Sprechen")
- ein `Btn variant="ghost"` („Diesmal überspringen")

Dazu nebenbei: `ListenButton` ist ein `Pressable` mit eigenem Hintergrund-`View` — formal nicht
der CTA, auf den CLAUDE.md Regel 13 zielt, aber genau die Uneinheitlichkeit, die der Owner sieht.
Die beiden Fragen im Issue („braucht ,Langsam' einen gleichrangigen Knopf?", „gehört ,Lösung
zeigen' auf die andere Seite?") lassen sich als Entwurf vorlegen; nur der letzte Abnahmepunkt
(„Owner sagt, es passt zum Rest") braucht ihn.

#### #188 — Im Web wächst das Feld gar nicht

In `main` steht weiterhin:

```tsx
// apps/mobile/components/buddy/Composer.tsx:389
{...(Platform.OS === 'web' ? { numberOfLines: 1 } : {})}
```

Der Fix liegt fertig im Arbeitsbaum (`apps/mobile/lib/growsWithText.ts`, **unverfolgt**, plus die
Umstellung von `style={{…}}` auf `style={[…, growsWithText]}`), ist aber nicht committet. Solange
das so ist, bleibt der neue Ausrichtungstest auf den einzeiligen Fall beschränkt — der Test selbst
sagt das in einem Kommentar. Der dritte Abnahmepunkt („die Liste der web-eigenen Abweichungen
steht in diesem Issue") ist leer.

#### #192 — Dunkelmodus: Kugel auf weißem Kasten

Der Issue-Körper beschreibt die Umsetzung, als sei sie geschehen. Sie liegt im Arbeitsbaum und ist
**nicht in `main`**:

```
git show origin/main:apps/mobile/components/lb/SplashHandoff.tsx
  → import SPLASH_IMAGE from '../../assets/splash-icon.png';
  → <Image source={SPLASH_IMAGE} … />
```

Der Arbeitsbaum ersetzt das durch
`<BuddyOrb size={Math.round((SPLASH_IMAGE_WIDTH * (285 / 1024)) / (FILL / 2))} breathe={false} />`.
Der zweite Teil des Issues ist unabhängig davon wahr und bleibt: `app.json` setzt
`"userInterfaceStyle": "light"` und `expo-splash-screen` auf `"backgroundColor": "#faf7fd"` ohne
`dark`-Variante — der native Startbildschirm bleibt nachts hell und braucht einen nativen Neubau.

#### #193 — Welche Fächer, welche Aufgabenformen

Neu am 01.10. um 18:26, nichts getan. Gut geschnitten: erst der Bericht, dann die Lücke zu dem,
was Buddy kann, dann **eine** Empfehlung. Eine Korrektur am Text: das Issue sagt „Buddy kann heute
vier Formen", `ItemKind` in `packages/shared-types/src/contracts/learning.ts:130` hat **sieben**
(`short`, `long`, `numeric`, `multiple_choice`, `formula`, `vocab`, `speak`). Die Aussage dahinter
— keine davon ist aus einem Lehrplan abgeleitet — bleibt richtig.

### STALE

#### #6 — „Prototyp aufs Android-Handy: was der Owner tun muss"

**Die Prämisse ist tot:** der Prototyp läuft seit dem 28.09. auf dem Handy, die API ist auf Vercel
deployt, Supabase liegt in `eu-central-1` (die offene Regionsfrage ist damit entschieden),
Expo/EAS und Firebase/Push sind eingerichtet (`PUSH_BACKEND=expo` läuft live). Die Cloud-TTS-Zeile
ist zu #176 geworden, die Kummer-Text-Prüfung zu #32 §7.5, die Gerätetestliste zu #37.

**Zwei Zeilen überleben und müssen vor dem Schließen umziehen:**

1. Vertex-Service-Account-Schlüssel rotieren (der Schlüssel stand im Chat). #107 hat das am 29.09.
   zurückgestellt — „there is no prod yet … everything will be purged soon" — aber nirgends sonst
   festgehalten.
2. CLAUDE.md Regel 6 sagt weiter „For minors, loosening needs the adult's PIN"; seine Entscheidung
   vom 27.09. (ADR 0006) war „For learners under 16 …". Geprüft: `CLAUDE.md:44` ist unverändert.

#### #44 — „Release-Checkliste für den Test mit der Tochter (29.09.)"

**Die Prämisse ist tot:** der Test war am 29.09., und seither sind über hundert Commits und ein
Dutzend Issue-Wellen vergangen. Der Körper ist inzwischen ein achtteiliges Verlaufsprotokoll von
drei Tagen; die Abschnitte „Was auf deine Entscheidung wartet" nennen durchweg geschlossene
Issues (#52, #53, #54, #70, #49).

**Was überlebt, steht schon doppelt:** die vier Konsolenpunkte (E-Mail-Vorlage, Leaked-Password-
Schutz, `pg_net`-Schema, Backup-Restore) stehen in `docs/OWNER-INPUT.md` §2 und in `docs/dpia.md`
§7. Vor dem Schließen prüfen, dass sie dort wirklich alle vier stehen — „Backup-Restore proben"
ist der, der am leichtesten verloren geht.

---

## Überlappungen (keine echten Dubletten, aber vier Paare, die er zusammenlegen könnte)

| Paar                                            | Verhältnis                                                                                                          | Vorschlag                                                                                                                                                |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **#59** ↔ **#41**, **#168**, **#169**, **#166** | #59 ist das Dachissue; seine Abnahme ist inzwischen die Summe der Kinder                                            | #59 behalten, aber die Abnahme auf das neue Ziel (< 1 s bis zur Reaktion) umschreiben, sonst misst es etwas, das er verworfen hat                        |
| **#165** ↔ **#166**                             | Zwei Spikes 18 Minuten auseinander, beide „wo liegt die Zeit"; die Maßnahmenlisten überlappen zu rund zwei Dritteln | #166 behalten (es betrifft die Modelle, die wir haben), #165 schließen, sobald seine Verdikte in `docs/decisions/` stehen — heute leben sie nur im Issue |
| **#147** (Stufen 2+3) ↔ **#162**                | #162 nennt „Vokabelkarte mit passender Antwortform" selbst als Punkt 3 und verweist auf #147 Stufe 1                | #162 behalten, #147 Stufen 2/3 dorthin falten, sobald er die offene Frage beantwortet hat                                                                |
| **#164** (erste Hälfte) ↔ **#162**              | #164 sagt selbst, die Zuschneide-Ansicht „gehört zu den Lernflächen (#162)"                                         | zusammen bauen; nicht zwei Vertikalschnitte daraus machen                                                                                                |

---

## Widersprüche, die mir beim Prüfen aufgefallen sind

1. **Zwei Zahlen zum Präfix-Cache, die sich ausschließen.** #166 Befund 5 sagt
   „`cached_tokens` ist in Produktion bei **allen** Aufrufen 0" (77 Live-Aufrufe). #168 und
   Commit `49ce7fa` sagen „rund **18 300** von 20 700 Eingabe-Tokens kommen aus dem Präfix-Cache".
   Die eine Zahl ist live über Vercel, die andere aus den Eval-Läufen — aber keine der beiden
   Stellen sagt das, und #168 baut seine ganze Begründung auf der zweiten. Das gehört geklärt,
   **bevor** jemand am Prompt schneidet.
2. **`docs/speed-audit.md` behauptet, TTS sei konfiguriert.** Dort steht:
   „TTS: lokal `SPEECH_BACKEND` nicht gesetzt — übersprungen (auf Vercel konfiguriert …)". #176
   hat bewiesen, dass es auf Vercel **nicht** gesetzt ist. Die Zeile ist falsch und hat genau das
   kaschiert, was #176 gefunden hat.
3. **Die Gerätezahlen aus #169 fehlen in `docs/speed-audit.md`.** Sie stehen nur im Commit
   `d292023` und im Issue-Kommentar. #59 verlangt ausdrücklich „Werte in docs/speed-audit.md",
   und CLAUDE.md verlangt die Doku in derselben Änderung.
4. **`docs/OWNER-INPUT.md` ist einen Tag alt und nennt drei geschlossene Issues** (#123, #124,
   #128) als offene Fragen an ihn. Das ist genau die Datei, die seine Übersicht retten soll.
5. **Der Verantwortliche widerspricht sich.** `docs/dpia.md` §1 sagt „Privatperson;
   Familienbetrieb", #107 hat am 29.09. „Zero X Ventures (bestätigt)" entschieden, und #107 sagt
   selbst, der Widerspruch bei LearnBuddy „braucht ein eigenes Issue". Das Issue gibt es nicht.
6. **`eas.json` zeigt auf den Team-Alias, nicht auf die Produktions-Domain.**
   `EXPO_PUBLIC_API_URL` im `preview`-Profil ist
   `https://learn-buddy-api-zero-x-ventures-projects.vercel.app`. #107 Nebenbefunde sagen
   ausdrücklich: „App auf die Produktions-Domain (`eas.json:26`)". Vom Owner am 29.09.
   zurückgestellt, aber unverändert offen.
7. **Vier offene PRs, alle in Konflikt.** #101 und #100 vom 29.09., **#5 vom 15.06. und #4 vom
   19.05.** — die beiden letzten stammen aus der App **vor** dem Neuanfang (ADR 0004) und können
   nicht mehr gemergt werden. Sie stehen in derselben Liste wie die Issues und machen sie länger,
   als sie ist.

---

## Titel und Körper, die nicht mehr zum Inhalt passen

| #        | Was nicht mehr stimmt                                                                                                                                                                                               |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **#133** | Der Körper ist **beschädigt**: die Tabelle ist zerfallen, die Positionen 4–18 stehen **zweimal** da, sechs Zeilen sind leer (`- [ ] **4** · 🟡 ·`). Der Titel sagt „fünfzehn kleinere Befunde", offen ist **einer** |
| **#164** | „…und gegen eine falsche Bewertung gibt es keinen Weg" — es gibt einen, seit `ab637f5`. Nur die erste Hälfte des Titels ist noch wahr                                                                               |
| **#126** | „…und der Reduced-Motion-Pfad springt, statt zu überblenden" — behoben in `6b62b33`. Offen ist nur noch seine Systemeinstellung                                                                                     |
| **#188** | „Warum die Browser-Suite das nicht sehen konnte" — beantwortet und mit einem Test geschlossen in `6a5866c`. Offen ist nur die zweite Hälfte                                                                         |
| **#37**  | „(sobald Handy per USB/adb da ist)" — das Handy ist da, und auch der im Kommentar genannte JDK-Blocker ist weg                                                                                                      |
| **#147** | „Vokabeln brauchen eine eigene Übungsform" — sie haben eine, seit `a992496`. Offen sind Stufen 2 und 3                                                                                                              |
| **#44**  | „Release-Checkliste für den Test mit der Tochter (29.09.)" — ein Verlaufsprotokoll von drei Tagen                                                                                                                   |
| **#6**   | „Prototyp aufs Android-Handy" — der Prototyp ist seit dem 28.09. drauf                                                                                                                                              |
| **#189** | Der Körper behauptet eine flache, chronologische Blätterliste; `library.tsx` gruppiert nach Fach                                                                                                                    |
| **#193** | „Buddy kann heute vier Formen" — `ItemKind` hat sieben                                                                                                                                                              |
| **#192** | Abschnitt „## Umsetzung" liest sich als geschehen; der Code liegt uncommittet im Arbeitsbaum                                                                                                                        |

---

## Seine Worte gegen Audit-/Agentenbefunde

Alle 30 Issues sind formal von `0xKurt` angelegt — das sagt nichts, weil der Agent über sein Konto
schreibt. Unterschieden nach Inhalt: trägt das Issue ein wörtliches Zitat von ihm mit Datum?

**Seine eigenen Worte (20)** — #193 · #192 · #189 · #188 · #187 · #186 · #176 · #175 · #169 ·
#168 · #166 · #165 · #147 · #127 · #126 · #107 · #59 · #41 · #37 · #35

Davon mit einem Zitat, das in derselben Zeile seinen Ärger benennt — die, die er am ehesten
wiedererkennt: **#126** („scheisse war die langsam und hakelig"), **#127** („gefuehlt funktioniert
alles schlechter als vorher :P"), **#176** („alle finden die abgehakte computerstimme gruselig"),
**#175** („die aussprache hapert oft sehr"), **#187** („der plus button muss sich genauso
verhalten"), **#59** („meine tochter sagt die ist viel viel viel zu langsam"), **#192** („die
sphere mit weissen hintergrund"), **#189** („ggfs sollte es eine art archiv geben"), **#193**
(„neues issue: ueberlegen, welche faecher…").

**Aus Audits, Produktplänen oder eigener Messung des Agenten (10)**

| #       | Herkunft                                                      |
| ------- | ------------------------------------------------------------- |
| #184    | Eigene Messung des Agenten beim Abarbeiten von #127           |
| #183    | Eigene Gerätemessung des Agenten für #169                     |
| #177    | Eigene Gerätesichtprüfung des Agenten während #174            |
| #164    | `reports/LEARNBUDDY-PRODUKTPLAN-2026-09-30.md` §6 (`ba9dff6`) |
| #162    | derselbe Produktplan §2                                       |
| #133    | `reports/MOBILE-APP-AUDIT-2026-09-30.md` §Priority Fix List   |
| #130    | derselbe Audit §Store Readiness                               |
| #32     | Consent-Research 28.09.                                       |
| #44, #6 | Sammelstellen, die der Agent angelegt hat                     |

Ein Grenzfall: **#188** zählt zu seinen zwanzig, weil die Quelle sein Zitat ist („wieso haben wir
eigentlich keine browser test suite fuer all diese dinge?") — der Befund darin (im Web wächst das
Feld gar nicht) ist aber unser eigener.

Wenn er nach seinen eigenen Sachen sucht, sind es diese zwanzig. Die zehn anderen sind
Hausaufgaben, die wir uns selbst gestellt haben — von denen allerdings zwei (#184, #183) direkt
das treffen, was er erlebt.

---

## Labels: was benutzt wird, und was ich stattdessen vorschlagen würde

**Benutzt wird genau ein Label.** `bug` steht an sieben Issues (#192, #188, #187, #184, #183,
#177, #176) — und alle sieben sind vom 01.10. Alles Ältere ist unbeschriftet. Die anderen acht
Labels im Repo sind die GitHub-Vorgaben (`documentation`, `duplicate`, `enhancement`,
`good first issue`, `help wanted`, `invalid`, `question`, `wontfix`) und sind **nie** vergeben
worden.

Priorität steckt stattdessen im Titel: `[P1]` (7×), `[P2]` (2×), `[P3]` (2×), `[Spike]` (2×),
`[Später]` (1×) — und die neuen Issues vom 01.10. tragen gar keine mehr. Eine Liste, in der die
Hälfte der Einträge ihre Dringlichkeit im Titel trägt und die andere Hälfte nicht, ist nicht
sortierbar.

**Das kleinste Schema, das diese Liste lesbar macht — fünf Labels:**

| Label   | Bedeutung                                                                      | wäre heute an                                                     |
| ------- | ------------------------------------------------------------------------------ | ----------------------------------------------------------------- |
| `owner` | kann sich ohne ihn nicht bewegen (Entscheidung, Konsole, Gerät, Zugang)        | #32, #41, #126, #130, #133, #147, #165, #176, #189 — **9 von 30** |
| `p1`    | seine Tochter trifft es heute, oder es ist eine Korrektheits-/Datenschutzregel | #184, #183, #192, #188, #177, #59                                 |
| `p2`    | echte Arbeit, aber es blutet nicht                                             | #175, #186, #168, #169, #166, #164, #162, #193, #37               |
| `p3`    | später, bewusst                                                                | #35, #107                                                         |
| `bug`   | etwas tut nicht, was es behauptet (bleibt wie es ist)                          | unverändert                                                       |

`owner` ist das eine, das sein Problem wirklich löst: **neun von dreißig Issues warten auf ihn,
und nichts in der Liste zeigt das.** Dafür gibt es `docs/OWNER-INPUT.md`, aber die Datei ist einen
Tag alt und nennt geschlossene Issues.

Dazu zwei Handgriffe, die nichts kosten: die acht nie benutzten Vorgabe-Labels löschen, und die
`[Pn]`-Präfixe aus den Titeln nehmen, sobald `p1`/`p2`/`p3` vergeben sind — sonst stehen zwei
Prioritäten an einem Issue, und eine davon ist falsch.

---

## Vorgeschlagene Reihenfolge für REAL AND OPEN

| #   | Issue                       | Warum hier                                                                                                                                                                              |
| --- | --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **#192 + #188**             | Beide Fixes liegen fertig im Arbeitsbaum. Solange sie dort liegen, blockiert der schmutzige Baum jeden anderen sauberen Commit — und beide Issues lesen sich fälschlich als erledigt    |
| 2   | **#184**                    | Seine Tochter trifft es in jedem Gespräch, es ist die belegte Ursache seines „fühlt sich schlechter an", und der Eval-Fall ist rot (48/49). Nichts sonst ist gerade kaputt und gemessen |
| 3   | **#183**                    | Ein englischer Jargon-Satz steht vor einem Kind, überlebt Bildschirmwechsel und verdeckt Bedienelemente. Dazu ein Loch in der Zusage „keine Codes, keine Schuldzuweisung"               |
| 4   | **#177**                    | Dunkelmodus ist ihre Wahl, und jedes Sheet bricht ihn sichtbar. Reine Regression gegenüber dem, was die App behauptet                                                                   |
| 5   | **#37**                     | Der genannte Blocker ist weg; einmal laufen lassen kostet eine halbe Stunde und löst drei andere Issues auf (#41, #133 Pos. 18, #126 Befund 1)                                          |
| 6   | **#175**                    | „Alles was ich sage gilt immer allgemein" — die Aussprache ist bei jedem Vorlesen zu hören, und Ordnungszahlen sind der nächste kleine, geschlossene Schritt                            |
| 7   | **#186**                    | Jede Sprechübung zeigt ihr vier Knopfformen; Regel 16 ist genau dafür da. Ein Entwurf, dann sein Blick                                                                                  |
| 8   | **#168**                    | Erst den Cache-Widerspruch klären (§Widersprüche 1), dann messen, was vom STATE benutzt wird. Der größte Tempohebel, der ganz in unserer Hand liegt                                     |
| 9   | **#169**                    | Die Maßnahme nach der Messung, mit Vorher/Nachher — und die Zahlen endlich in `docs/speed-audit.md`                                                                                     |
| 10  | **#166**                    | Hebel I und D in der Reihenfolge, die #169 belegt hat (der Weg, nicht das Modell)                                                                                                       |
| 11  | **#59**                     | Zum Schluss der Tempo-Runde: Abnahme auf sein neues Ziel umschreiben und einmal am Gerät gegenmessen                                                                                    |
| 12  | **#164 (1. Hälfte) + #162** | Zusammen bauen, wie #164 selbst sagt. Lernflächen sind das größte Stück offenes Produkt, aber heute bricht nichts daran                                                                 |
| 13  | **#193**                    | Der Bericht entscheidet, was danach gebaut wird — also vor der nächsten Übungsform, aber nach allem, was gerade blutet                                                                  |
| 14  | **#35**                     | P3, und braucht zuerst den Gerätetest aus #37                                                                                                                                           |
| 15  | **#107**                    | Nicht anfassen. Vom Owner geparkt, und zwar richtig                                                                                                                                     |
