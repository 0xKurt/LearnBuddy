# Was nur der Owner entscheiden oder tun kann

**Stand: 30.09.2026.** Eine Seite für alles, was an dir hängt — damit du es an einer Stelle
findest und nicht über zwanzig Issues verteilt.

> **Der Rahmen, den du am 30.09. gesetzt hast:** _„wir sind noch nicht prod ready und brauchen
> es auch nicht sein … erstmal werden wir ein paar wochen intern mit meiner tochter testen."_
>
> Danach ist diese Liste sortiert. Was nur für einen Store-Start zählt, steht unten und wartet.
> Was das Testen mit deiner Tochter in den nächsten Wochen betrifft, steht oben.

---

## 1 · Jetzt, weil es das Testen betrifft

| #        | Frage                                                                                                             | Warum sie wartet                                                                                                                                                                                                                                                       |
| -------- | ----------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **#124** | Gefällt dir das neue dunkle Hintergrundlicht? Zu blass, zu kräftig, anderer Ton?                                  | Der Fehler ist weg (die hellen Pastelltöne lagen über dem dunklen Grund). Ob die neuen Töne **gefallen**, kann ich nicht entscheiden. Es sind Tokens — jede Änderung ist eine Zeile. [Vergleich](https://claude.ai/code/artifact/fd08f6ba-c0eb-4c29-94ea-f75bb152ce70) |
| **#126** | Darf ich die Animationsskalen auf deinem Handy per `adb` auf 1 setzen und danach zurückdrehen?                    | Auf dem Testgerät stehen alle drei auf **0** — vermutlich ein Rest aus den Entwickleroptionen. Dadurch _springt_ die App, statt zu gleiten. Ein guter Teil von „hakelig" ist das. Systemeinstellung ⇒ nur mit deinem Wort.                                             |
| **#127** | Ein bis zwei **echte Sätze** aus deinem Test — was du getippt hast, was zurückkam. Oder ungefähr die Uhrzeit.     | „Fühlt sich schlechter an" kann ich ohne ein Beispiel weder bestätigen noch widerlegen. Mit der Uhrzeit hole ich den Verlauf selbst aus der Datenbank.                                                                                                                 |
| **#123** | „merk dir nichts mehr": **A** ehrlich erklären (mein Vorschlag), **B** echter Schalter, **C** Schalter mit Ablauf | B macht Buddy spürbar schlechter, ohne dass das Kind den Zusammenhang sieht.                                                                                                                                                                                           |
| **#128** | Screenshot-Sperre als **Einstellung**, oder dabei belassen?                                                       | Die Sperre ist raus (deine Entscheidung). Meine Empfehlung: keine Einstellung — sie schützt vor der falschen Person, das Kind hält das Telefon.                                                                                                                        |

---

## 2 · Zugänge und Konsolenarbeit, die ich nicht habe

Nichts davon blockiert das interne Testen. Es blockiert alles danach.

- **Supabase-Konsole** (#44, #32)
  - E-Mail-Vorlage aus `docs/consent-email-templates.md` eintragen
  - Leaked-Password-Schutz einschalten
  - `pg_net` in ein eigenes Schema verschieben (SQL-Editor), danach Advisor erneut laufen lassen
  - Ein Backup-Restore proben (#78 war nie geprüft)
- **Google Cloud / Firebase** (#6): FCM-Schlüssel für Push aufs Handy; Cloud-TTS-Datenbedingungen lesen
- **Verträge** (#32 §7): Auftragsverarbeitung mit Supabase, Google Cloud, Vercel; schriftliche Bestätigung der Verarbeiterbedingungen für Vertex und TTS (kein Training, Abuse-Logging aus, EU)

---

## 3 · Werte, die nur du kennst

**#130 — die Release-Konfiguration.** `eas.json` hat im `production`-Profil **gar kein** `env`.
Ein Release-Build startet damit nicht, und die optionalen Variablen verschwinden still:

| Variable                    | Fehlt →                                                                   |
| --------------------------- | ------------------------------------------------------------------------- |
| `EXPO_PUBLIC_PRIVACY_URL`   | Kein Datenschutz-Knopf im Consent-Screen **und** keine Zeile unter „Über" |
| `EXPO_PUBLIC_IMPRINT_URL`   | Kein Impressum (in DE verpflichtend)                                      |
| `EXPO_PUBLIC_SUPPORT_EMAIL` | Keine Support-Zeile                                                       |
| `EXPO_PUBLIC_SENTRY_DSN`    | Keine Absturzmeldungen (die Naht ist fertig gebaut)                       |

Ich lege die Struktur an und dokumentiere, was hineingehört. **Die Werte musst du liefern.**
Für das interne Testen mit einem Dev-Build ist das egal — vor einer Store-Einreichung ist es
der eine Punkt, der sie stoppt.

---

## 4 · Fachliche Prüfungen, die kein Code ersetzt

- **#32 DPIA §7.5** — pädagogische **und** rechtliche Prüfung der Notfalltexte und der
  Entscheidung, Eltern bei einer Notlage _nicht_ zu benachrichtigen (D-10). Die **Erkennung**,
  die zu diesen Texten führt, ist seit dem 30.09. in beide Richtungen belegt (100 % erkannt,
  0 % Fehlalarm über 161 Züge). Ob die **Texte selbst** richtig sind, ist keine Messfrage.
- **#32 §7.12** — deine Durchsicht der DPIA, danach Datum und Fassung erhöhen.
- **iPhone** — die Auf-dem-Gerät-Spracherkennung ist auf iOS unbewiesen (`docs/privacy.md`
  §Processors sagt das ausdrücklich). Dafür braucht es ein iPhone; das Testgerät ist Android.

---

## 5 · Erledigt — hier nur, damit du es nicht suchst

- **Handy angeschlossen, App läuft, Maestro installiert** (#6, #37 teilweise). Du bist auf dem
  Gerät angemeldet, ich brauche keinen eigenen Zugang.
- **Screenshots** gehen wieder (#128) — die Sperre lag auf dem ganzen Fenster, nicht nur auf
  vier Bildschirmen.
- **Migrationen** sind auf der gehosteten Datenbank, zuletzt `0057_repeating_steps`.
- **Die Kopfzeile** ist weg, das Menü sitzt bei den Aktionen, das Vorlesen ist eine Zeile mit
  Worten (#125, #52).

---

## Wie diese Datei gepflegt wird

Jede Frage hier hat ein Issue. Wenn du eine beantwortest, wandert sie aus dieser Liste in den
Abschnitt „Erledigt" und die Arbeit beginnt. Neue Fragen kommen dazu, sobald sie entstehen —
sie stehen dann **auch** in ihrem Issue, aber hier findest du sie ohne Suche.
