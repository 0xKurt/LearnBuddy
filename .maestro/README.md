# Gerätetests mit Maestro (Issue #37)

<!-- requires live verification in Claude Code session (braucht ein echtes Telefon) -->

Der Browser-Walkthrough (`scripts/web-walkthrough.sh`) prüft die App gegen die echte API,
aber im Browser. Drei Dinge kann er grundsätzlich nicht: **das Mikrofon**, **die Kamera** und
**das Zeitverhalten eines echten Telefons**. Genau dafür sind diese Flows da.

## Voraussetzungen

1. **Telefon per USB**, USB-Debugging an. Prüfen: `adb devices` zeigt eine Zeile mit `device`.
2. **Metro läuft** und der Dev-Build zeigt darauf:
   ```bash
   cd apps/mobile && npx expo start --dev-client
   adb reverse tcp:8081 tcp:8081
   ```
3. **Java.** Maestro ist eine JVM-Anwendung. Ohne JDK bricht schon `maestro --version` ab:
   ```
   Unable to locate a Java Runtime.
   ```
   → `brew install --cask temurin` (oder ein anderes JDK 17+). Das ist eine
   System-Installation und daher eine Owner-Entscheidung; die Flows hier stehen fertig
   bereit, sobald sie da ist.

## Laufen lassen

```bash
# alles, was ohne Konto geht
maestro test .maestro/flows/01-welcome.yaml

# mit Konto (Zugangsdaten NIE im Repo — sie kommen aus der Umgebung)
MAESTRO_LB_EMAIL='…' MAESTRO_LB_PASSWORD='…' maestro test .maestro/flows
```

Ohne die beiden Variablen bleibt `02-sign-in` mit einer klaren Meldung stehen, statt ein
leeres Feld zu tippen und drei Schritte später unverständlich zu scheitern. Im Repo steht
kein einziges Kennwort und keine Adresse.

## Die Flows

| Datei             | Was er prüft                                                                                                             | Konto nötig           |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------ | --------------------- |
| `01-welcome.yaml` | Startet der Build überhaupt; beide Wege hinein; der Unter-16-Hinweis steht auf der ersten Seite; die CTA sagt, was fehlt | nein                  |
| `02-sign-in.yaml` | Anmelden auf dem Gerät                                                                                                   | ja (aus der Umgebung) |
| `03-chat.yaml`    | Sie schreibt, Buddy antwortet wirklich (echtes Modell, gehostete API)                                                    | ja                    |
| `04-voice.yaml`   | Vorlesen und Gesprächsmodus — der Zustand, in dem die zwei Messmarken fallen                                             | ja + Mikrofon         |

## Die zwei Zahlen aus `04-voice`

Der Flow **behauptet keine Zeiten**. Er bringt die App nur in den Zustand, in dem
`lib/perf.ts` misst; gelesen wird im Log:

```bash
adb logcat -c && maestro test .maestro/flows/04-voice.yaml
adb logcat -d -s ReactNativeJS | grep lb-perf
#   [lb-perf] first_audio <ms>   Buddys Worte erscheinen → der erste hörbare Ton
#   [lb-perf] relisten   <ms>    sein letztes Wort → der Erkenner läuft wieder
```

Abnahme aus #41: `first_audio` < 1000 ms, `relisten` < 500 ms.

**Warum das kein `assertTrue` ist:** eine Schwelle, die bei langsamem Funknetz umfällt, würde
die App beschuldigen, wo das Netz schuld war — und eine, die großzügig genug ist, nie
umzufallen, misst nichts. Die zwei Zahlen liest ein Mensch und trägt sie in
`docs/speed-audit.md` ein, mit dem Netz, an dem sie entstanden sind.

## MIUI / HyperOS

Das Testgerät (Xiaomi 2412DPC0AG, Android 16) hat zwei Eigenheiten, die beim Schreiben
dieser Flows aufgefallen sind:

- **Screenshots gingen bis zum 30.09. gar nicht**, sobald man angemeldet war: vier Bildschirme
  setzten `FLAG_SECURE`, und weil das ein _Fenster_-Flag ist und das Zuhause unter allem
  montiert bleibt, war die ganze App schwarz — auch die Einstellungen. Das ist raus (#128),
  Screenshots funktionieren wieder überall. Die Flows belegen ihre Schritte trotzdem per
  `assertVisible` und nicht per Bild: eine Behauptung, die der Testlauf selbst prüft, ist mehr
  wert als eine Datei, die jemand ansehen müsste.
- **Die Mikrofon-Berechtigung** fragt MIUI beim ersten Mal in einem eigenen Dialog. Einmal
  von Hand erteilen, danach läuft `04-voice` unbeaufsichtigt.

## Was diese Flows NICHT sind

Kein Ersatz für die Integrationstests (echtes Postgres) oder den Walkthrough (jeder Bildschirm
in fünf Sprachen, Passform auf 390 × 844 und 360 × 740). Sie prüfen genau das, was nur ein
echtes Gerät zeigt — und sind absichtlich kurz, damit sie nicht bei jeder Textänderung
umfallen.
