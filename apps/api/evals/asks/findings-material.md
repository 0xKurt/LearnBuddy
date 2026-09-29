# Material — statische Prüfung der 100 Kinder-Anliegen

Quelle: Issue #106, Schritt 2 („Statische Prüfung ohne Modellkosten"). Korpus:
`apps/api/evals/asks/material.ts` (100 Fälle, `material-001` … `material-100`).
**Kein einziger Modellaufruf.** Jeder Fall wurde gegen den Code gehalten, der ihn tragen
müsste — nicht gegen eine Vorstellung davon, was Buddy „eigentlich kann".

## Was geprüft wurde

| Was                                     | Wo                                                                                                   |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Welche Werkzeuge Buddy hat (17 Stück)   | `apps/api/src/modules/buddy/decision.ts:491–509`                                                     |
| Was `request_material` kann             | `decision.ts:401–407`, `tools.ts:840–868`                                                            |
| Was `open_area` öffnen kann             | `decision.ts:479–488`                                                                                |
| Was Buddy nachschlagen kann (3 Lookups) | `apps/api/src/modules/buddy/lookups.ts:34–64`                                                        |
| Was der Prompt über Material sagt       | `apps/api/src/modules/buddy/prompts.ts:42, 56, 57, 59`                                               |
| Was STATE über Material sagt            | `context.ts:210–273`, `state.ts:127–139, 322–341`                                                    |
| Die HTTP-Oberfläche für Material        | `apps/api/src/modules/materials/routes.ts:36–109`                                                    |
| Lebenszyklus, Seiten, Fehlerfälle       | `materials/service.ts:137–302, 305–324, 327–476, 478–529, 536–572, 1017–1037, 1045–1104, 1283–1301`  |
| Der Vertrag                             | `packages/shared-types/src/contracts/learning.ts:8–119`                                              |
| Was die App als Knopf anbietet          | `apps/mobile/app/material/[id].tsx:224, 257, 285`, `library.tsx:156, 179`, `buddy.tsx:651, 670, 697` |

## Ergebnis in Zahlen

| Urteil                                                                                                                       | Zahl |
| ---------------------------------------------------------------------------------------------------------------------------- | ---- |
| **Pfad** — Buddy kann es selbst (Werkzeug, Lookup, oder Gesprächsregel, die im Prompt steht)                                 | 56   |
| **nur ein Knopf** — das Kind sagt es, die Handlung liegt hinter einem Knopf; Buddy kommt höchstens bis `open_area`           | 11   |
| **Faktenlücke** — Buddy antwortet, aber die Tatsache steht nirgends in Prompt oder STATE; er kann sie nur erfinden (Regel 5) | 17   |
| **kein Pfad** — weder Buddy noch die App können es                                                                           | 15   |
| **unsicher** — braucht die Live-Stichprobe                                                                                   | 1    |

**Fälle ohne Pfad: 15.** Rechnet man „nur ein Knopf" und „Faktenlücke" dazu — also alles,
was das Kind im Gespräch sagt und wofür Buddy keinen belastbaren Weg hat —, sind es **43
von 100**.

---

## Die 15 Fälle ohne Pfad

| Fall           | Wortlaut                                                      | Warum es keinen Weg gibt                                                                                                                                                                                                                                                                                                                                                                                                 |
| -------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `material-014` | „ich hab die rueckseite vergessen"                            | `request_material` kennt nur `goal` und `title` (`decision.ts:401–407`). `completes` — die Seite gehört an _dieses_ Blatt — gibt es nur im Vertrag (`learning.ts:57–61`) und als Route-Parameter der App. Buddy legt einen neuen Foto-Schritt an, und die Rückseite wird ein zweites Blatt.                                                                                                                              |
| `material-017` | „ich glaub ich hab dieselbe seite zweimal fotografiert"       | Nichts vergleicht Seiten. Die Extraktion macht aus beiden Fragen; sie kommen doppelt in die Übung.                                                                                                                                                                                                                                                                                                                       |
| `material-018` | „die seiten sind in der falschen reihenfolge"                 | Die Reihenfolge ist `material_photos.position` und wird beim Anlegen festgeschrieben (`service.ts:241–247`). Umsortieren gibt es nur im Composer **vor** dem Senden (`PhotoStrip`), danach nirgends.                                                                                                                                                                                                                     |
| `material-020` | „kannst du seite 2 nochmal lesen, die war zu dunkel"          | `retryMaterial` verlangt `status = 'failed'` (`service.ts:490`) — ein gelesenes Blatt mit einer dunklen Seite ist `ready` und kann gar nicht neu gelesen werden. Und selbst dann liest es das **ganze** Blatt, nie eine Seite.                                                                                                                                                                                           |
| `material-022` | „passt so, die letzte seite brauch ich eh nich"               | `POST /materials/:id/pages-ok` (`routes.ts:97`) ist ein Knopf an der Hinweis-Karte (`buddy.tsx:670`). Im Chat gibt es kein Werkzeug dafür. Gesagt werden kann es, getan nicht.                                                                                                                                                                                                                                           |
| `material-027` | „das pdf hat 40 seiten, ich brauch nur 2"                     | Die Grenze (20 Seiten, `learning.ts:48–51`, `service.ts:454`) greift erst beim Senden und lehnt dann das ganze Blatt ab. Einzelne PDF-Seiten auswählen kann die App nicht.                                                                                                                                                                                                                                               |
| `material-034` | „das foto is von letzter woche, is das schlimm"               | Ein Blatt trägt nur `created_at` — den Upload-Zeitpunkt. Ein eigenes Datum („das Blatt ist von letzter Woche") kann niemand setzen, auch `remember` nicht: eine Erinnerung hält etwas über _sie_ fest, nicht über ein Blatt.                                                                                                                                                                                             |
| `material-040` | „is das zu verwackelt"                                        | Buddy bekommt Fotos **nie** zu sehen — sie gehen an die Extraktion, nicht in den Turn. Die Qualitätsprüfung sitzt auf dem Gerät (`lib/photo/quality.ts`, `PhotoCheckCard`). Gefragt wird aber Buddy.                                                                                                                                                                                                                     |
| `material-055` | „auf dem foto is ausversehen mein kumpel mit drauf"           | Ein **einzelnes** Foto eines Blattes lässt sich nicht entfernen. `archiveMaterial` löscht das ganze Blatt (`service.ts:1045`); pro Seite gibt es nichts.                                                                                                                                                                                                                                                                 |
| `material-064` | „das is falsch einsortiert, das is englisch und nich deutsch" | `renameMaterial` ändert nur den Titel (`service.ts:1283–1301`). Für `subject_id` gibt es keinen Endpunkt, keinen Knopf und kein Werkzeug. Das Fach kommt allein aus der Extraktion bzw. dem Ziel — falsch einsortiert bleibt falsch einsortiert.                                                                                                                                                                         |
| `material-071` | „schick mal das bild nochmal"                                 | Es gibt keinen Weg, ein hochgeladenes Seitenfoto wieder anzusehen: kein Endpunkt in `routes.ts`, kein Bildschirm. Nach `PHOTO_RETENTION_DAYS` sind die Dateien ohnehin gelöscht (`purge.ts`).                                                                                                                                                                                                                            |
| `material-072` | „zeig mir das blatt nochmal so wie ichs fotografiert hab"     | Dieselbe Lücke in der Bibliothek. `material/[id].tsx` zeigt Fragen, nie die Seite. Nur Bildausschnitte einzelner Fragen erscheinen in Sitzungen (`ItemImage`, Issue #50).                                                                                                                                                                                                                                                |
| `material-096` | „ich hab das blatt ausversehen zweimal geschickt"             | Zwei `client_request_id` = zwei Blätter (`service.ts:191–232`). Nichts erkennt gleiche Seiten, nichts führt zwei Blätter zusammen. Sie sieht beide und hat alles doppelt.                                                                                                                                                                                                                                                |
| `material-097` | „bei dem einen blatt steht seit gestern noch hochladen"       | Die Home-Karte „wird gesendet" verschwindet nach 10 Minuten (`home.ts:32, 312`). Buddys Kontextblock nennt `awaiting_upload` überhaupt nicht (`context.ts:264–273`: nur queued/processing, failed, page_problems). Nach 24 h setzt `abandonStaleUploads` das Blatt auf `failed` **und archiviert es zugleich** (`service.ts:1021–1023`) — die Fehler-Karte erscheint also nie. Niemand erklärt ihr je, was passiert ist. |
| `material-100` | „mein blatt is weg obwohl ich nix geloescht hab"              | Genau die Folge davon. Ein still archiviertes Blatt (aufgegebener Upload, abgelehnte Datei — `service.ts:457–471`) ist aus STATE, Bibliothek und Home verschwunden. Buddy kann nicht einmal sagen, dass es das gab.                                                                                                                                                                                                      |

## Die 11 Fälle, die es nur als Knopf gibt

Das Kind sagt es im Chat; die Handlung existiert, aber nur hinter einem Tipp. Buddy kommt
höchstens bis `open_area` — ein Knopf in eine Liste, in der sie das Richtige erst wiederfinden
muss. Das ist genau der Fall, den Regel 16 ausschließen will („kann Buddy das im Chat?").

| Fall           | Wortlaut                                                         | Der Knopf, den es stattdessen gibt                                                                         |
| -------------- | ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `material-015` | „kann ich noch ne seite zu dem mathe blatt dazutun"              | „Seiten hinzufügen" im Blatt (`material/[id].tsx:224`)                                                     |
| `material-019` | „oh ich hab nur die obere haelfte erwischt"                      | dasselbe                                                                                                   |
| `material-028` | „das pdf geht nich auf"                                          | Die Meldung `file_unreadable` erscheint im Aufnahme-Bildschirm; Buddy erfährt davon nichts                 |
| `material-031` | „die eine frage von dem blatt is doof, nimm die raus"            | `DELETE /materials/:id/items/:itemId` (`routes.ts:64`), Knopf in `material/[id].tsx:285`                   |
| `material-049` | „ups falsches bild"                                              | „Blatt löschen" in der Bibliothek (`library.tsx:179`)                                                      |
| `material-050` | „das war ausversehen n selfie hahaha"                            | dasselbe                                                                                                   |
| `material-052` | „das is n screenshot von meinem chat mit lisa, loesch das bitte" | dasselbe — ein ausdrücklicher Löschwunsch endet bei einem Listen-Knopf                                     |
| `material-054` | „kannst du das bild wieder loeschen"                             | dasselbe                                                                                                   |
| `material-063` | „nenn das blatt mal bruchrechnen teil 2"                         | „Umbenennen" im Blatt (`material/[id].tsx:257`)                                                            |
| `material-065` | „loesch das blatt von gestern"                                   | „Blatt löschen" in der Bibliothek                                                                          |
| `material-075` | „kannst du mir das vorlesen, ich hab meine brille nich auf"      | Vorlesen ist der Sprachmodus bzw. das Nachrichtenmenü (`MessageMenu.tsx:74`); Buddy kann es nicht auslösen |

## Die 17 Faktenlücken

Buddy _antwortet_ — aber weder Prompt noch STATE enthalten die Tatsache, nach der gefragt
wird. Er kann sie nur aus allgemeinem Modellwissen erfinden. Das ist kein Pfad, das ist ein
Risiko gegen Regel 5 („Never claim what isn't proven"). Der Prompt erwähnt Material in genau
vier Zeilen (`prompts.ts:42, 56, 57, 59`) — und keine davon sagt, **was die App annimmt**.

`material-006` (mehrere Seiten = ein Blatt) · `material-007` (wie viele Seiten gehen) ·
`material-009` (warum das Lesen dauert — `read_stage` steht nicht in STATE) ·
`material-011` (Senden hängt) · `material-023` (geht PDF) · `material-025` (Teilen aus
WhatsApp) · `material-026` (PDF aus der Dateien-App) · `material-029` (Word) ·
`material-033` (Bild aus der Galerie) · `material-036` (Kamera geht nicht — welche
Alternative) · `material-038` (ein Bild vor dem Senden wieder wegnehmen) ·
`material-056` (nach `not_learning_material` ist ein zweiter Versuch **gesperrt**,
`service.ts:492–496`, und die Fotos sind sofort gelöscht, `service.ts:560–563` — Buddy weiß
das nicht und wird „versuch es nochmal" sagen) · `material-070` (`MaterialBrief` trägt kein
`photos_deleted`, `state.ts:127–139`) · `material-093`, `material-094`, `material-095`
(abgebrochener Upload: der Entwurf überlebt zwar auf dem Gerät, `lib/capture/draft.ts`,
aber Buddy weiß nichts davon) · `material-099` (Wiederholgrenze 3, `service.ts:512`).

## Der unsichere Fall

`material-058` („das is mein stundenplan, kannst du den auch lesen"). Die Extraktionsregel
(`extract.ts:131`) nennt als Lernmaterial „worksheets, textbook or notebook pages,
vocabulary, tasks" und als Nicht-Lernmaterial „a recipe, a letter, a receipt, an advert,
packaging". Ein Stundenplan ist keins von beidem. Ob er als `not_learning_material`
abgelehnt wird, entscheidet allein das Modell — das gehört in die Live-Stichprobe
(Issue #106 Schritt 3). Nützlich wäre er: Buddy plant Zeiten.

---

## Die drei schwerwiegendsten Lücken

### 1. Kein einziges Werkzeug ändert ein Blatt

Von 17 Act-Werkzeugen (`decision.ts:491–509`) ändern acht Ziele und Schritte, drei die
Erinnerungen, zwei die Kontakt- und Stimmeinstellungen, eins fragt nach einem Foto, eins
öffnet einen Bildschirm. **Keins benennt, löscht, sortiert oder ergänzt Material.** Alles,
was ein Kind über sein Material _sagt_, endet bei `open_area` — einem Knopf in eine Liste.

Betroffen: `material-014`, `-015`, `-019`, `-022`, `-031`, `-049`, `-050`, `-052`, `-054`,
`-063`, `-064`, `-065`. Zwölf von hundert. Das widerspricht Regel 16 direkt: Buddy ist die
Oberfläche, und genau hier ist er es nicht.

Das Auffälligste dabei ist `material-052` („loesch das bitte" zu einem Chat-Screenshot):
ein ausdrücklicher, datenschutzrelevanter Löschwunsch, im Klartext gesagt, und die Antwort
ist ein Knopf in eine Bibliothek.

### 2. Buddy weiß nichts über die Aufnahme-Oberfläche

Der Prompt sagt Buddy, _dass_ er nach einem Foto fragen kann. Er sagt ihm nicht, **was die
App annimmt**: Bilder und PDF (`learning.ts:48–51`), höchstens 20 Seiten, höchstens 15 MB,
Galerie und Dateien-App, Teilen aus anderen Apps (`ShareIntake.tsx`), Fotos werden nach der
Aufbewahrungsfrist gelöscht, ein zweiter Leseversuch ist begrenzt und nach
`not_learning_material` gesperrt.

17 Fälle hängen daran. Ein Kind, das fragt „kannst du auch word dateien" oder „wie viele
seiten kannst du auf einmal", bekommt eine erfundene Zahl. Das ist Regel 5, gebrochen an
der Stelle, an der ein Kind am ehesten fragt.

### 3. Ein hängengebliebener Upload verschwindet lautlos

Drei Stellen greifen ineinander:

1. Die Home-Karte „wird gesendet" zeigt `awaiting_upload` nur 10 Minuten lang
   (`home.ts:32, 312`).
2. Buddys Kontextblock nennt `awaiting_upload` überhaupt nicht — er kennt nur „wird gerade
   gelesen", „konnte nicht gelesen werden" und fehlende Seiten (`context.ts:264–273`).
3. Nach 24 h setzt `abandonStaleUploads` das Blatt auf `failed` **und `archived_at` in
   derselben Anweisung** (`service.ts:1021–1023`). Archiviert heißt: aus jeder Abfrage
   heraus. Die Fehler-Karte, die `failed` sonst erzeugen würde, erscheint nie.

Ergebnis: Das Kind hat fotografiert, das WLAN brach ab, und einen Tag später ist das Blatt
spurlos weg. Fragt es Buddy, hat er nichts dazu — nicht einmal, dass es das Blatt gab.
`material-093`, `-094`, `-095`, `-097`, `-100`.

---

## Alle 100 Fälle mit Urteil

`P` Pfad · `K` nur ein Knopf · `F` Faktenlücke · `–` kein Pfad · `?` unsicher

|       |       |       |       |       |       |       |       |       |       |
| ----- | ----- | ----- | ----- | ----- | ----- | ----- | ----- | ----- | ----- |
| 001 P | 002 P | 003 P | 004 P | 005 P | 006 F | 007 F | 008 P | 009 F | 010 P |
| 011 F | 012 P | 013 P | 014 – | 015 K | 016 P | 017 – | 018 – | 019 K | 020 – |
| 021 P | 022 – | 023 F | 024 P | 025 F | 026 F | 027 – | 028 K | 029 F | 030 P |
| 031 K | 032 P | 033 F | 034 – | 035 P | 036 F | 037 P | 038 F | 039 P | 040 – |
| 041 P | 042 P | 043 P | 044 P | 045 P | 046 P | 047 P | 048 P | 049 K | 050 K |
| 051 P | 052 K | 053 P | 054 K | 055 – | 056 F | 057 P | 058 ? | 059 P | 060 P |
| 061 P | 062 P | 063 K | 064 – | 065 K | 066 P | 067 P | 068 P | 069 P | 070 F |
| 071 – | 072 – | 073 P | 074 P | 075 K | 076 P | 077 P | 078 P | 079 P | 080 P |
| 081 P | 082 P | 083 P | 084 P | 085 P | 086 P | 087 P | 088 P | 089 P | 090 P |
| 091 P | 092 P | 093 F | 094 F | 095 F | 096 – | 097 – | 098 P | 099 F | 100 – |

Die 56 `P`-Fälle tragen: `search_material` und `find_questions` beantworten „wo ist mein
blatt", „was steht da", „welche aufgaben" (`lookups.ts:34–62`); `open_area` bringt sie zur
Kamera und zur Bibliothek; `offer_learning` nimmt abgetippte Aufgaben und Vokabeln;
`set_voice` regelt das Vorlesetempo; die Seiten-Hinweise aus der Extraktion
(`page_problems`) erklären „mein daumen is mit drauf" und „wieso kannst du das nich lesen"
ohne Raten; die Notlage in `material-076` läuft über `concern` in den festen Text
(`turn.ts:374, 480`).

## Nächste Schritte (Issue #106 Schritt 4)

Jede der drei Lücken oben gehört als eigenes Issue ins Repo, mit dem Wortlaut des Falls als
Beleg — nicht als Zeile in dieser Datei. Diese Prüfung hat keinen Code geändert.

---

## Nachtrag 29.09.2026 — Lücken 2 und 3 sind geschlossen (Issue #115)

Der Befund oben ist der Stand vom 29.09. **vor** Issue #115. Was seitdem im Code steht:

**Lücke 2 (Buddy weiß nichts über die Aufnahme):** Der Turn-Prompt trägt jetzt einen eigenen
Abschnitt `MATERIAL` (`prompts.ts`, `buddy.27`) mit den echten Grenzen — nur Bild und PDF und
woher sie kommen dürfen (Kamera, Galerie, Dateien, Teilen aus anderen Apps), 20 Seiten je Blatt
und 15 MB PDF, ein Blatt geht in **einem** Senden, Lesen dauert etwa eine Minute, höchstens drei
Leseversuche, was mit Nicht-Lernmaterial passiert (kein zweiter Versuch, Fotos sofort gelöscht),
dass ein abgebrochenes Senden nach einem Tag aufgegeben wird und es dann sagt, dass die Fotos
sieben Tage nach dem Lesen gelöscht werden, und dass Buddy die Fotos selbst nie sieht. Damit hat
jede der 17 Faktenlücken eine belegte Tatsache statt Modellwissen. Nur der Prompt, nicht STATE:
die Zahlen sind für jede Lernende dieselben.

**Lücke 3 (hängender Upload):** `abandonStaleUploads` trennt jetzt, was sie senden wollte, von
Seiten, die nur im Composer lagen (`service.ts`): ein aufgegebenes Senden wird `failed` /
`photos_missing` und bleibt — Bibliothek, Home-Karte (nur „Neues Foto", weil `retryMaterial` ein
zweites Lesen ablehnt) und Buddys STATE. Die Fehlerkarte findet ihr Blatt über `failed_at`
(Migration 0056) statt über `created_at`, sonst läge sie schon außerhalb des Tagesfensters.
STATE nennt außerdem ein laufendes Senden mit Uhrzeit und bei jedem gescheiterten Blatt, was
sein Grund für sie bedeutet (`context.ts`). Integrationstest über die 24-Stunden-Grenze:
`material-lifecycle.int.test.ts` („a send that never finished …", „pages nobody asked to send …").

Urteile, die sich damit ändern: `097` und `100` von `–` auf `P`; die Faktenlücken `006`, `007`,
`009`, `011`, `023`, `025`, `026`, `029`, `033`, `036`, `038`, `056`, `070`, `093`, `094`, `095`,
`099` haben die Tatsache jetzt im Prompt bzw. in STATE. **Nicht** geändert: `096` (zwei gleiche
Blätter erkennt weiterhin nichts) und die elf Knopf-Fälle. Ob das Modell die Tatsachen auch
ausspricht, beantwortet erst die Live-Stichprobe (Issue #106 Schritt 3) — hier steht nur, dass
sie ihm überhaupt vorliegen.
