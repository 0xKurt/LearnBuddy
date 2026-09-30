# Was das Modell wirklich tut — die Live-Stichprobe (Issue #106, Schritt 4)

Vier Domänen (`learning`, `time`, `material`, `life`) waren bisher nur **statisch** geprüft:
gibt es für diesen Wunsch ein Werkzeug? Die fünfte (`buddy`, Notlagen) wird getrennt und viel
häufiger gemessen (`evals/concern`, Issue #109).

Diese Datei hält fest, was passiert, wenn das echte Modell die Sätze wirklich bekommt.

**Lauf:** 30.09.2026, `npx tsx evals/asks/live.ts`, 60 Fälle, je ein echter Turn auf einer
eigenen Wegwerf-Datenbank, Prompt `buddy.34`, $1,18.

| Domäne     | eigener Maßstab erfüllt |
| ---------- | ----------------------- |
| learning   | 12/15                   |
| time       | 12/15                   |
| material   | 9/15                    |
| life       | 13/15                   |
| **gesamt** | **46/60**               |

## Wie die 60 ausgewählt wurden

Die Auswahl steht mit Begründung je Fall in `sample.ts`. Kurz: jeder Fall, den die statische
Prüfung als zweifelhaft markiert hat **und** dessen Zweifel nur ein Modellaufruf klären kann;
jeder Fall, dessen Urteil sich seit den statischen Befunden geändert hat (#108, #111, #112,
#113, #114, #115 sind dazwischen gelandet); dazu drei unauffällige Kontrollen je Domäne, damit
eine schlechte Zahl als „dieser Fall" und nicht als „diese Domäne ist kaputt" lesbar ist.

## Das Wichtigste zuerst: 14 „Fehlschläge", aber nicht 14 Mängel

Die Zahl 46/60 misst den **Maßstab des Korpus**, und der ist an mehreren Stellen von der
Wirklichkeit überholt worden. Acht der vierzehn sind genau das.

### Vier echte Mängel

**1. `material-014` — „ich hab die rueckseite vergessen"**
Buddy antwortet: _„Kein Problem! Du kannst die Rückseite einfach über den Kamera-Button
fotografieren und dazuhängen."_ — und ruft `open_area`.
Es gibt `request_material`, und es tut genau das: nach einem Foto fragen und den Schritt
anlegen. Statt zu handeln verweist Buddy auf einen Knopf. Das ist dieselbe Kritik, die #111
für Blätter geschlossen hat, hier für die vergessene Seite.

**2. `life-028` — „ich will nie wieder was von dir hören"**
Buddy antwortet: _„Das tut mir leid. Möchtest du, dass ich dir eine Weile gar keine
Nachrichten mehr schicke, oder soll ich das für immer einstellen?"_ — und ändert **nichts**.
Die Reihenfolge ist falsch herum. ADR 0006: Buddy darf Kontakt nur reduzieren, und das ist
nie zu bestätigen. Bei diesem Satz gehört das Stillwerden **vor** die Rückfrage — erst
`set_contact` (pausiert), dann fragen, ob es endgültig sein soll. Bis sie antwortet, kann
noch eine Nachricht rausgehen.

**3. `material-031` — „die eine frage von dem blatt is doof, nimm die raus"**
Buddy fragt richtig zurück, welche Frage gemeint ist. Danach aber kann er nichts tun: es gibt
**kein Werkzeug, eine einzelne Frage zu entfernen** — nur den Weg über die Bibliothek
(`archiveMaterialItem` hinter einem Knopf). #111 hat das für Blätter gelöst und die Fragen
ausgelassen.

**4. `time-017` — „morgen früh vor der schule erinner mich an das arbeitsblatt"**
Buddy antwortet: _„Ich habe dir für morgen früh eine Erinnerung an das Arbeitsblatt in der App
eingetragen."_ Bei „vor der Schule" ist die **Uhrzeit** die ganze Frage — 6:30 liegt in den
Ruhezeiten und wird vom Code abgelehnt, also steht dort eine andere Zeit. Welche, sagt die
Antwort nicht. Das Kind hört eine Zusage für „vor der Schule" und bekommt womöglich etwas
anderes (Regel 5). Entweder die Uhrzeit nennen, oder sagen, dass so früh nichts geht.

### Acht überholte Maßstäbe im Korpus (kein Mangel)

| Fall           | Korpus erwartet          | Was Buddy tat                                         | Warum das besser ist                                                                               |
| -------------- | ------------------------ | ----------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `material-052` | `open_area`              | fragt „soll ich ‚Screenshot Chat' endgültig löschen?" | #111: es gibt `delete_material`, und weil Löschen endgültig ist, fragt der Code die Bestätigung ab |
| `material-065` | `open_area`              | fragt, welches der beiden Blätter                     | „das Blatt von gestern" passt auf zwei — nachfragen ist richtig                                    |
| `material-058` | nur antworten            | `open_area`                                           | zeigt ihr den Weg zum Fotografieren statt ihn zu beschreiben                                       |
| `material-071` | nur ablehnen             | ablehnen **und** `open_area`                          | sagt ehrlich, dass Fotos nicht zurückkommen, und zeigt, wo sie neu fotografiert                    |
| `learning-030` | nur antworten            | `offer_learning`                                      | „weitermachen" mit einem Startknopf zu beantworten ist die Tat statt der Ankündigung               |
| `learning-099` | nur antworten            | `remember`                                            | merkt sich, dass sie Gitarre lernen will — genau das soll er                                       |
| `time-013`     | `plan_step` + `remember` | nur `plan_step`                                       | „ich geh raus" ist ein Zustand für drei Stunden, kein Satz fürs Gedächtnis                         |
| `time-024`     | `plan_step`              | fragt, ob Erinnerung oder Lernzeit gemeint ist        | „morgen vormittag so gegen halb 10" sagt nicht, wofür                                              |

Zwei weitere sind Grenzfälle, die ich nicht als Mangel zähle: `learning-098`
(Führerschein-Theorie — fragt nach dem Bereich statt sofort ein Angebot zu machen) und
`life-046` (Schulwechsel im Sommer — fragt nach dem Datum, statt es sofort zu merken; im
nächsten Turn merkt er es sich dann mit Datum).

## Was daraus folgt

- **Erledigt:** die acht Maßstäbe sind nachgezogen, jeder mit einem Kommentar am Fall, warum.
  Nachgemessen am selben Tag: **8/8**. Ohne das fängt jede spätere Messung mit acht falschen
  Roten an und beschreibt einen Stand, den es nicht mehr gibt.
- **Erledigt:** die vier echten Mängel sind Issues #118 (vergessene Rückseite), #119 („nie
  wieder was von dir hören"), #120 (einzelne Frage entfernen), #121 (Uhrzeit verschwiegen).
  Keiner davon stand schon in #109, #112, #114 oder #117.

Damit stünde der Lauf bei **54/60**; die verbleibenden sechs sind die vier Issues und die
zwei Grenzfälle. Diese Zahl ist gerechnet, nicht am Stück gemessen — die acht wurden einzeln
nachgefahren, die anderen 52 nicht noch einmal.

## Was diese Zahl **nicht** sagt

Ein Turn pro Fall. Das Modell antwortet nicht deterministisch — in derselben Woche hat
derselbe Fall im Eval einmal gefragt und einmal gehandelt, beides vertretbar. 46/60 ist eine
Momentaufnahme mit einer Stichprobe von 60 aus 500, kein Gütesiegel und keine Quote, die man
fortschreiben darf. Wo es auf Verlässlichkeit ankommt (Notlagen), wird wiederholt gemessen,
nicht einmal (`evals/concern`).
