# Befunde: Domäne `time` (100 Fälle)

Statische Prüfung von `apps/api/evals/asks/time.ts` gegen den Code, der tatsächlich existiert.
**Keine Modellaufrufe** — jeder Satz unten ist aus den Quellen belegt:

- `apps/api/src/modules/buddy/decision.ts` — `FlatDay`/`DaySpecSchema`, `FlatUntil`/`UntilSpecSchema`,
  `LocalTimeSchema`, `plan_step`, `update_step`, `schedule_check`, `set_contact`, `plan_exam`, `update_goal`
- `apps/api/src/modules/buddy/tools.ts` — `resolveFutureDay`, `resolveEnd`, `runPlanStep`,
  `runUpdateStep`, `runSetContact`, `runScheduleCheck`, `requireQuote`
- `apps/api/src/modules/buddy/context.ts` — `## Now` und die 22 Tage mit Offsets
- `apps/api/src/modules/buddy/prompts.ts` — `buddy.26`, Regeln zu Tagen und Wortlaut
- `apps/api/src/modules/buddy/policy.ts`, `plan.ts`, `registry.ts`, `routes.ts`, `lib/time.ts`,
  `infra/supabase/migrations/0001_baseline.sql` (Standardwerte), `apps/mobile/components/settings/ContactSection.tsx`

---

## 1. Was die Zeit-Werkzeuge wirklich können

**Tag** (`DaySpecSchema`): `date` (YYYY-MM-DD, nur wenn die Lernende ein Kalenderdatum nannte) ·
`in_days` (0–366) · `weekday` (1–7 + `weeks_ahead` 0–8, wobei `weeks_ahead: 0` der _nächste_ solche
Wochentag **strikt nach heute** ist) · `unknown` (führt zu einer Ablehnung, damit Buddy fragt).
**Kleinste Einheit: ein ganzer Tag.**

**Uhrzeit**: ein freier String `HH:MM` (`LocalTimeSchema`), an `plan_step`, `update_step` und
`schedule_check`. Es gibt keine relative Zeit, keine Ungefähr-Zeit, keinen Ereignis-Anker.

**Dauer** (`UntilSpecSchema`): `end_of_day` (0–60) · `end_of_week` (+0–8) · `through` (ein DaySpec) ·
`unknown`. Ein **Ende**, nie ein Anfang. Maximal 60 Tage (`MAX_CONSTRAINT_DAYS`).

**Was `## Now` dem Modell gibt** (context.ts:128–135): Wochentag, Datum, **lokale Uhrzeit auf die
Minute**, Zeitzone — und 22 Tage als `+0 Mon 2026-09-29, +1 Tue …`. Für den _Tag_ muss das Modell
also nur die Zahl abschreiben. Für die _Uhrzeit_ gibt es nichts abzuschreiben.

**Was der Code ablehnt** (`ToolRejection`, bricht die ganze Entscheidung ab, eine Reparaturrunde):

| Regel                                                                               | Ort                             |
| ----------------------------------------------------------------------------------- | ------------------------------- |
| Tag in der Vergangenheit                                                            | tools.ts:201 `resolveFutureDay` |
| Tag > 366 Tage voraus                                                               | tools.ts:205                    |
| Uhrzeit schon vorbei                                                                | tools.ts:668 `runPlanStep`      |
| Uhrzeit in den Ruhezeiten (Standard **20:00–07:00**)                                | tools.ts:670, 782               |
| Vereinbarte Erinnerung ohne Zeit, wenn `preferred_start` (15:00) schon vorbei ist   | tools.ts:689                    |
| Zeitumstellung: Uhrzeit existiert nicht / zweimal                                   | tools.ts:661, 776, 1031         |
| Check unter 1 Stunde oder über 21 Tage; mehr als 3 offene Checks                    | tools.ts:1041–1052              |
| Ruhezeiten später legen (= mehr Kontakt)                                            | tools.ts:879–885                |
| Einen stillen Wochentag entfernen                                                   | tools.ts:899                    |
| Pause über 60 Tage / Ende schon vorbei                                              | tools.ts:218–222                |
| Höchstens 6 Aktionen pro Antwort                                                    | registry.ts:237                 |
| Zitatpflicht: der Wortlaut der Lernenden, ganze Wörter, seit Buddys letzter Antwort | tools.ts:147–155                |

**Was `set_contact` _nicht_ hat**: `quiet_end`, `contact_enabled`, `only_important`, einen
Pausen-_Anfang_, ein Zeitfenster pro Wochentag. Alle vier gibt es in `PATCH /buddy/settings`
(routes.ts:501–560) und im Einstellungs-Screen (`ContactSection.tsx`) — also nur als Formular,
nicht im Gespräch.

---

## 2. Die Urteile

| Kürzel | Bedeutung                                                                                           |
| ------ | --------------------------------------------------------------------------------------------------- |
| **P**  | Pfad: Werkzeuge und Code tragen es so, wie das Kind es meint.                                       |
| **R**  | Pfad, **aber das Modell muss den Zeitpunkt selbst ausrechnen** (Bruch von CLAUDE.md Regel 2).       |
| **½**  | Ein Teil landet, ein Teil fällt still weg.                                                          |
| **T**  | Nur über eine andere Tür: `open_area('settings')` — ein Formular, nicht Buddy (Bruch von Regel 16). |
| **✗**  | **Kein Pfad.** Keine Werkzeugkombination drückt es aus.                                             |

**Ergebnis: 19 Fälle ✗ (kein Pfad) und 8 Fälle T (nur über die Einstellungen) — zusammen 27 von
100, in denen Buddy im Gespräch nicht liefern kann.** Dazu 10 Fälle R, in denen er nur liefert,
weil er rechnet, was er laut Regel 2 nicht rechnen darf.

---

## 3. Die drei schwerwiegendsten Lücken

### L1 — Buddy kann nichts wiederholen. Gar nichts. _(Ausdruck)_

`plan_step` plant **genau ein Datum**. Es gibt in `decision.ts`, `tools.ts`, `plan.ts` und dem
Scheduler kein Feld, keinen Job-Typ und keine Spalte für eine Wiederholung (eine Suche nach
`recurr`, `repeat`, `weekly`, `rrule` in `modules/buddy` und `modules/scheduler` findet nichts).
Das Einzige, was sich wiederholt, sind die Prüfungs-Weckrufe (`scheduleExamWakeups`, 5/3/1 Tage
vorher) — vom System gesetzt, nicht von der Lernenden.

Betroffen: **time-021, 025, 027, 028, 029, 030, 031, 032, 033, 035, 036** (11 Fälle).

Das trifft den Zweck des Produkts. „Erinner mich jeden Tag um 5" ist die häufigste Bitte eines
Kindes an einen Lernbegleiter, und die einzige Antwort, die Buddy geben kann, ist sechsmal
`plan_step` (Aktions-Obergrenze 6) und danach Schweigen. Ein Kind, das „jeden Tag" sagt, hört
„klar" und merkt am siebten Tag, dass nichts kommt — genau die Art von unbelegter Zusage, die
Regel 5 verbietet.

### L2 — Es gibt keine relative Zeit; das Modell rechnet den Zeitpunkt selbst aus. _(Ausdruck)_

Das ist die Lücke aus Issue #106, und sie ist größer als „in einer Stunde". `DaySpec` ist
tagesgenau, `LocalTimeSchema` ist ein absolutes `HH:MM`. Um „in einer Stunde" zu erfüllen, muss das
Modell aus `## Now` die Minute lesen, addieren, entscheiden, ob der Tag umspringt, und **beides**
schreiben (`in_days` + `HH:MM`). Genau das verbietet CLAUDE.md Regel 2 („the model never writes
ids, dates or **instants**"), und genau dafür gibt es keinerlei Prüfung: der Code sieht nur ein
fertiges `HH:MM` und kann nicht wissen, ob es „in einer Stunde" entspricht. Ein Rechenfehler wird
angewendet, nicht abgelehnt.

Betroffen: **time-001, 002, 003, 006, 007, 008, 009, 010, 013, 053** (10 Fälle R).

Verschärfend: `update_step` nimmt ebenfalls nur ein absolutes `HH:MM`, also muss das Modell für
„mach die Erinnerung ne Stunde später" (time-053) die alte Uhrzeit aus STATE lesen und addieren —
und wenn das Ergebnis über 20:00 rutscht, wird die ganze Antwort abgelehnt.

Zwei Hunches werden hier **widerlegt**: „in 20 min" (time-002) und „in 10 min" (time-007) sind
nicht unerreichbar — `schedule_check` hat zwar eine Untergrenze von einer Stunde (tools.ts:1041),
aber `plan_step` hat keine, und der Scheduler-Tick läuft jede Minute (`scheduler/tick.ts`,
`health.ts:12`). Eine Erinnerung in 10 Minuten _kommt_ — wenn das Modell richtig rechnet.

### L3 — Die Ruhezeiten sperren die halbe Kinderzeit, und Buddy kann sie nicht anfassen. _(Ausdruck + Durchsetzung)_

Standard ist `quiet_start 20:00`, `quiet_end 07:00` (Baseline-Migration, Zeilen 87–88). Damit sind
**„vorm Schlafen gehen" und „morgen früh vor der Schule" strukturell unerreichbar** — die beiden
Zeitpunkte, an denen ein Kind am ehesten erinnert werden will. `runPlanStep` und `runUpdateStep`
lehnen jede Uhrzeit in diesem Fenster ab (tools.ts:670, 782).

Der Ausweg existiert, aber nicht bei Buddy: `set_contact` hat **kein `quiet_end`** (decision.ts:409–425)
und darf `quiet_start` nur **früher** legen (tools.ts:879–885). `PATCH /buddy/settings` kann beides
(routes.ts:516–517), der Einstellungs-Screen zeigt beides (`ContactSection.tsx:379–384`) — und für
eine Minderjährige braucht das Lockern zusätzlich die Erwachsenen-PIN (`loosens()` →
`assertAccountHolder`). Ein 13-jähriges Kind, das um 6:30 an sein Arbeitsblatt erinnert werden
will, muss dafür ein Formular öffnen und einen Elternteil holen.

Umgekehrt schmerzt es genauso: „morgens erst ab 9" (time-072) ist eine _Verringerung_ des Kontakts —
laut Regel 6 genau das, was Buddy selbst darf — und er kann es trotzdem nicht ausdrücken, weil das
Feld fehlt.

Betroffen: **time-012, 016, 017, 029, 040, 042, 056, 072, 073, 074, 095, 097** (12 Fälle).

---

## 4. Weitere Befunde

### B4 — Zwei Zeitangaben, die sich widersprechen, werden still aufgelöst _(Ausdruck + Durchsetzung)_

„in 3 tagen, also freitag" (**time-044**), wenn Freitag in zwei Tagen ist. Ein `DaySpec` ist genau
_eine_ Angabe — das Modell schickt entweder `in_days: 3` oder `weekday: 5`, beide sind gültig, und
der Code hat nichts, womit er merken könnte, dass das Kind sich verrechnet hat. Der Termin landet
auf einem der beiden Tage, ohne dass irgendwer davon erfährt. Genau der Fall, für den `unknown`
gedacht wäre — aber `unknown` heißt „ich weiß es nicht", nicht „sie hat sich widersprochen".

### B5 — Ein Termin ohne Tag kann nicht festgehalten werden _(Ausdruck)_

„nächste woche is die arbeit, wann genau weiß ich noch nich" (**time-041**). `plan_exam.day` ist
Pflicht, und `unknown` wird von `resolveFutureDay` abgelehnt (tools.ts:193–199). Die Spalte
`buddy_goals.due_date` ist nullable, aber **kein Werkzeug kann ein Ziel ohne Tag anlegen**. Der
Prompt löst das per Verhalten („sag ihr, sie kann den Tag später nennen", prompts.ts:43) — wenn sie
nicht zurückkommt, ist die Arbeit nirgends.

### B6 — Eine Uhrzeit am Termin selbst gibt es nicht _(Ausdruck)_

„dienstag 3. stunde bio test" (**time-038**), „abgabe is sonntag um 23:59" (**time-040**).
`plan_exam` und `update_goal` haben `day`, aber kein `time`. Die Stunde fällt weg, ohne dass es
jemand sagt. Bei der Abgabe ist das die eigentliche Information.

### B7 — „egal wann, aber heute noch" wird abgelehnt statt verschoben _(Durchsetzung)_

**time-058**. Eine vereinbarte Erinnerung ohne Uhrzeit bekommt `preferred_start` (15:00); ist die
vorbei, lehnt der Code ab (tools.ts:689, 794). Der Kommentar nennt den Grund richtig (audit M-58:
eine Erinnerung darf nicht still in die Vergangenheit fallen) — aber die naheliegende Lösung, den
nächsten freien Zeitpunkt vor `quiet_start` zu nehmen, ist nicht implementiert. Um 16 Uhr „mach das
heut noch" zu sagen, führt zu einer Rückfrage statt zu einer Erinnerung um 17 Uhr.

### B8 — Eine Pause kann nur jetzt beginnen _(Ausdruck)_

„nach der arbeit am freitag brauch ich ne woche pause" (**time-084**). `UntilSpec` ist ein **Ende**.
Es gibt keinen Anfang, also keine geplante Pause. Buddy muss entweder sofort pausieren (falsch)
oder fragen und es später selbst nicht vergessen (kann er nicht — er hat keinen Wecker für sich).

### B9 — Kein Zeitfenster pro Wochentag _(Ausdruck)_

„samstags erst ab mittag" (**time-067**). `avoid_weekdays` schweigt den _ganzen_ Tag, die Ruhezeiten
gelten an _allen_ Tagen gleich. Dazwischen gibt es nichts. Für ein Kind, dessen Woche aus
unterschiedlichen Tagen besteht, ist das die falsche Auflösung.

### B10 — Ereignis-Anker gibt es nicht _(Ausdruck)_

„wenn ich vom training komm" (**time-019**), „nach dem abendessen" (015), „in der großen pause"
(020), „nach dem training" (018). Jede Erinnerung ist ein Wanduhr-Zeitpunkt. Buddy _kann_ sich
merken, dass sie montags Handball hat (`remember`) — aber nichts liest diese Erinnerung, um daraus
einen Zeitpunkt zu machen. Die einzige ehrliche Antwort ist eine Rückfrage nach einer Uhrzeit, also
genau die Übersetzungsarbeit, die Buddy dem Kind abnehmen sollte.

### B11 — Ein Zeitzonenwechsel verschiebt bereits geplante Erinnerungen _(Durchsetzung)_

**time-094, time-096.** Die Zone kommt aus dem Header `x-timezone` und ändert sich stillschweigend
mit dem Gerät; `http/context.ts:122–133` erhöht dabei korrekt `context_version`. Aber der Job einer
vereinbarten Erinnerung hält einen **absoluten** `run_at` (`plan.ts:110–124`), der mit dem _alten_
Offset berechnet wurde, und **nichts rechnet ihn um** (`timezone` kommt in `modules/scheduler/*.ts`
gar nicht vor). Nach dem Flug nach Spanien steht in STATE weiter „17:00", die Nachricht kommt aber
um 18:00 Ortszeit. Es gibt außerdem **keine Oberfläche und kein Werkzeug** für die Zone — weder
Buddy noch die Lernende kann sie korrigieren (in `apps/mobile` taucht `timezone` nur in
`lib/api/client.ts` auf, dem Header).

### B12 — Mengenänderungen scheitern an der Aktions-Obergrenze _(Durchsetzung)_

„schieb alles um ne woche" (**time-054**), „streich alles für diese woche" (**time-065**),
„die nächsten 5 tage jeden tag" (**time-036**). Ein `update_step` pro Schritt, höchstens sechs
Aktionen pro Antwort (registry.ts:237). Bei sieben offenen Schritten bleibt ein Teil des Plans
stehen, und die Karte zeigt nur, was verschoben wurde — nicht, was nicht.

### B13 — „schreib nicht so oft" hat kein Werkzeug _(Ausdruck)_

**time-068.** `phone_only_important` wird ausschließlich vom Benachrichtigungs-Button
`less_often` (routes.ts:374) und vom Einstellungs-PATCH gesetzt. Genau der mittlere Wunsch —
weniger, aber nicht nichts — ist der, den Buddy im Gespräch nicht erfüllen kann; er kann nur
pausieren (alles) oder nichts.

### B14 — Die Frage nach der Zahl der Tage darf Buddy nicht beantworten _(Durchsetzung, Prompt)_

**time-089** „wie viele tage sind es noch bis zur arbeit". `prompts.ts:25` verbietet ausdrücklich
„in 4 Tagen" und verlangt das Wort aus STATE („am Donnerstag"). Die Regel ist als Korrektur eines
echten Live-Befunds entstanden (das Modell rechnete falsch) — aber sie beantwortet die Frage des
Kindes nicht. STATE liefert die Zahl (`fmtDay`: „in 4 days"), Buddy darf sie nur nicht sagen.

### B15 — „lass mich in Ruhe" gilt nur fürs Handy _(gewollt, aber unausgesprochen)_

**time-059, 061, 083.** `set_contact.pause` und die Ruhezeiten regeln ausschließlich die
Telefon-Zustellung; Nachrichten in der App sind nach ADR 0006 nie begrenzt (policy.ts:5–7,
context.ts:303–305). Das ist eine bewusste Entscheidung, aber ein Kind, das „nerv nicht" sagt,
meint sie nicht. Buddy muss das jedes Mal erklären, und der Prompt sagt ihm nicht, dass er es soll.

### B16 — Kleine Kanten, die richtig behandelt sind (kein Befund, zur Absicherung geprüft)

- **time-047** „am 31. februar": `isLocalDate` fängt es ab → `invalid_time` → Rückfrage. Richtig.
- **time-057** „schieb es auf gestern": `resolveFutureDay` lehnt ab. Richtig.
- **time-095** Zeitumstellung: `resolveLocalDateTime(..., 'reject')` lehnt nicht existierende und
  doppelte Zeiten ab statt zu raten (CLAUDE.md Regel 2). Richtig.
- **time-071, 076** Lockern: `set_contact` und `loosens()` verweigern beides. Richtig.
- **time-099** Die Instant-Berechnung nutzt die Offsets **um das Zieldatum herum**
  (`resolveLocalDateTime`, `offsetMinutes` ±1 Tag), eine über die Umstellung hinweg geplante
  Erinnerung liegt also richtig. Der Hunch ist widerlegt — Buddy hat nur nichts in STATE, womit er
  es belegen könnte.
- **time-022** „morgen nachmittag": `in_days 1` ohne Uhrzeit landet auf `preferred_start` 15:00.
  Das ist genau der Nachmittag. Richtig.

---

## 5. Fall für Fall

| Fall                                             | Urteil | Weg bzw. warum keiner                                                                      |
| ------------------------------------------------ | ------ | ------------------------------------------------------------------------------------------ |
| time-001 in einer stunde                         | R      | `plan_step` — Modell rechnet `HH:MM` (L2)                                                  |
| time-002 in 20 min gucken                        | R      | `schedule_check` ✗ (<1 h), `plan_step` ja — Modell rechnet (L2); Hunch teilweise widerlegt |
| time-003 in ner halben stunde                    | R      | wie 001                                                                                    |
| time-004 gleich                                  | P      | Rückfrage nach einer Uhrzeit                                                               |
| time-005 nachher                                 | P      | Rückfrage                                                                                  |
| time-006 in 2 stunden                            | R      | wie 001                                                                                    |
| time-007 in 10 min                               | R      | `plan_step` trägt es, Tick läuft jede Minute — Hunch widerlegt                             |
| time-008 viertelstunde                           | R      | wie 007                                                                                    |
| time-009 gib mir 5 minuten                       | R      | nur als vereinbarte Erinnerung (Karte), nicht als Rückkehr ins Gespräch                    |
| time-010 in 90 minuten                           | R      | wie 001                                                                                    |
| time-011 kurz nach 4                             | ½      | `HH:MM` ist exakt; „ungefähr" geht verloren                                                |
| time-012 heute abend                             | ½      | bis 19:59 ja, danach Ruhezeit (L3)                                                         |
| time-013 in 3 stunden + bin raus                 | R      | `plan_step` (Rechnung) + `remember` (P)                                                    |
| time-014 wann genau?                             | P      | aus STATE (`planned_time`)                                                                 |
| time-015 nach dem abendessen                     | P/✗    | Rückfrage möglich; der Anker selbst: kein Pfad (B10)                                       |
| time-016 vorm schlafen                           | T      | Ruhezeit; nur Einstellungen, bei Minderjährigen mit PIN (L3)                               |
| time-017 morgen früh vor der schule              | T      | `quiet_end` 07:00, kein Feld in `set_contact` (L3)                                         |
| time-018 nach dem training                       | P      | Rückfrage                                                                                  |
| time-019 wenn ich vom training komm              | ✗      | kein Ereignis-Trigger (B10)                                                                |
| time-020 in der großen pause                     | P      | Rückfrage                                                                                  |
| time-021 immer nach dem mittagessen              | ✗      | Wiederholung (L1) + Anker (B10)                                                            |
| time-022 morgen nachmittag                       | P      | `plan_step` `in_days 1`, Zeit null → 15:00                                                 |
| time-023 heute mittag (schon vorbei)             | P      | Ablehnung → Rückfrage, korrekt                                                             |
| time-024 morgen halb 10                          | P      | `plan_step` 09:30                                                                          |
| time-025 jeden tag um 5                          | ✗      | Wiederholung (L1)                                                                          |
| time-026 immer montags handball                  | ½      | `remember` ja; Blockieren nur als ganzer Tag (`avoid_weekdays`)                            |
| time-027 jeden 2. tag                            | ✗      | Wiederholung (L1)                                                                          |
| time-028 jede woche mittwochs                    | ✗      | `schedule_check` einmalig, 21 Tage, 3 offene (L1)                                          |
| time-029 sonntags abends                         | ✗      | Wiederholung (L1) + Ruhezeit (L3)                                                          |
| time-030 jeden morgen um 7                       | ✗      | 07:00 wäre erlaubt, „jeden" nicht (L1)                                                     |
| time-031 freitags test, donnerstags erinnern     | ½      | `remember` ja, wöchentliche Erinnerung nein (L1)                                           |
| time-032 ab nächster woche jeden tag             | ✗      | Wiederholung (L1) + kein Start in der Zukunft (B8)                                         |
| time-033 immer am 1. des monats                  | ✗      | Wiederholung (L1), kein Monatsrhythmus                                                     |
| time-034 zweimal am tag                          | P      | zwei `plan_step` in einer Antwort                                                          |
| time-035 jeden tag außer mittwoch                | ✗      | Wiederholung (L1)                                                                          |
| time-036 nächste 5 tage                          | ½      | fünf `plan_step`, Obergrenze 6 (B12)                                                       |
| time-037 freitag mathearbeit                     | P      | `plan_exam` `weekday 5`                                                                    |
| time-038 dienstag 3. stunde                      | ✗      | Tag ja, **Uhrzeit am Ziel: kein Feld** (B6)                                                |
| time-039 referat am 14.10.                       | P      | `plan_exam` `date`                                                                         |
| time-040 abgabe sonntag 23:59                    | ✗      | Uhrzeit am Ziel fehlt (B6) + 23:59 ist Ruhezeit (L3)                                       |
| time-041 nächste woche, tag unklar               | ✗      | kein Ziel ohne Tag anlegbar (B5)                                                           |
| time-042 übermorgen aber früh                    | P      | Rückfrage; „früh" trifft danach L3                                                         |
| time-043 am wochenende irgendwann                | P      | Rückfrage; „einer von beiden" ist nicht ausdrückbar                                        |
| time-044 in 3 tagen, also freitag                | ✗      | Widerspruch wird still aufgelöst (B4)                                                      |
| time-045 nächsten monat                          | P      | Rückfrage                                                                                  |
| time-046 nach den ferien                         | P      | Rückfrage (kein Schulkalender)                                                             |
| time-047 31. februar                             | P      | `invalid_time` → Rückfrage                                                                 |
| time-048 arbeit war gestern                      | P      | `close_goal` mit `outcome`                                                                 |
| time-049 doch lieber später                      | P      | Rückfrage                                                                                  |
| time-050 verschieb auf morgen                    | P      | `update_step`                                                                              |
| time-051 nach dem wochenende                     | P      | `update_step` `weekday 1`                                                                  |
| time-052 nicht um 5, um 6                        | P      | `update_step` `time`                                                                       |
| time-053 ne stunde später                        | R      | alte Zeit aus STATE + rechnen; über 20:00 abgelehnt (L2, L3)                               |
| time-054 alles um ne woche                       | ½      | ein `update_step` je Schritt, max. 6 (B12)                                                 |
| time-055 nächsten dienstag                       | P      | `update_goal`; `weeks_ahead`-Mehrdeutigkeit bleibt                                         |
| time-056 heute abend schieben                    | T      | Ruhezeit (L3)                                                                              |
| time-057 auf gestern schieben                    | P      | Ablehnung → Rückfrage, korrekt                                                             |
| time-058 doch heute noch, egal wann              | ✗      | wird abgelehnt statt auf den nächsten Slot gelegt (B7)                                     |
| time-059 nerv nicht                              | P      | Rückfrage nach der Dauer; gilt nur fürs Handy (B15)                                        |
| time-060 hör auf zu erinnern                     | P      | Rückfrage: diese oder alle                                                                 |
| time-061 lass mich heute in ruhe                 | P      | `set_contact` `pause end_of_day 0` (nur Handy, B15)                                        |
| time-062 nie mehr aufs handy                     | T      | kein `contact_enabled` im Werkzeug; Pause max. 60 Tage                                     |
| time-063 erinnerung morgen weg                   | P      | `update_step` `cancelled`                                                                  |
| time-064 mach ich heut nich                      | P      | `update_step` `skipped`                                                                    |
| time-065 streich alles diese woche               | ½      | max. 6 Aktionen (B12)                                                                      |
| time-066 wochenende nix                          | P      | `set_contact` `avoid_weekdays [6,7]`                                                       |
| time-067 samstags erst ab mittag                 | ✗      | kein Zeitfenster pro Wochentag (B9)                                                        |
| time-068 nicht so oft                            | T      | `only_important` nur in den Einstellungen (B13)                                            |
| time-069 nach 8 nix mehr                         | P      | `set_contact` `quiet_start 20:00` (entspricht dem Standard)                                |
| time-070 ab 7 ruhe                               | P      | `set_contact` `quiet_start 19:00`                                                          |
| time-071 bis 10 abends erlaubt                   | P      | Ablehnung, korrekt (Regel 6)                                                               |
| time-072 morgens erst ab 9                       | T      | **`set_contact` hat kein `quiet_end`** (L3)                                                |
| time-073 weck mich 6:30                          | T      | Ruhezeit; Lockern braucht Einstellungen + PIN (L3)                                         |
| time-074 nachts um 1 lernen                      | T      | wie 073 (L3)                                                                               |
| time-075 sonntag nie                             | P      | `set_contact` `avoid_weekdays [7]`                                                         |
| time-076 doch wieder sonntags                    | P      | Ablehnung, korrekt                                                                         |
| time-077 zwischen 2 und 4                        | P      | `preferred_start/end`; gilt nur für Buddys Eigeninitiative                                 |
| time-078 diese woche nix                         | P      | `pause end_of_week 0`                                                                      |
| time-079 2 wochen urlaub                         | P      | `pause end_of_day 14` + `remember`                                                         |
| time-080 krank bis freitag                       | P      | `pause through weekday 5`; Krankheit wird korrekt **nicht** gespeichert                    |
| time-081 bis nach den ferien                     | P      | Rückfrage                                                                                  |
| time-082 3 monate pause                          | P      | Ablehnung (60 Tage), Buddy bietet das Maximum                                              |
| time-083 für immer ruhe                          | T      | kein „aus" im Werkzeug, Pause endlich                                                      |
| time-084 pause ab freitag                        | ✗      | `UntilSpec` hat kein Anfangsdatum (B8)                                                     |
| time-085 morgen keine zeit                       | P      | `remember` `constraint` `end_of_day 1`                                                     |
| time-086 was steht heut an                       | P      | aus STATE                                                                                  |
| time-087 hatten wir was ausgemacht               | P      | STATE markiert `[agreed with learner]`                                                     |
| time-088 wann is die mathearbeit                 | P      | aus STATE                                                                                  |
| time-089 wie viele tage noch                     | ½      | STATE hat die Zahl, der Prompt verbietet sie (B14)                                         |
| time-090 hab ich morgen was                      | P      | aus STATE                                                                                  |
| time-091 wann erinnerst du mich                  | P      | aus STATE                                                                                  |
| time-092 was is nächste woche los                | P      | aus STATE; Gesamtzahlen verhindern „das ist alles"                                         |
| time-093 bis zu den sommerferien                 | P      | ehrliche Absage (kein Schulkalender)                                                       |
| time-094 flug nach spanien                       | ✗      | geplante Jobs behalten den alten Zeitpunkt (B11)                                           |
| time-095 zeitumstellung halb 3 nachts            | P      | Ablehnung, korrekt                                                                         |
| time-096 bei oma in polen                        | ✗      | kein Werkzeug und keine Oberfläche für die Zone (B11)                                      |
| time-097 am 25. um 2 nachts                      | P      | Ablehnung (Ruhezeit)                                                                       |
| time-098 handy zeigt falsche zeit                | ½      | Buddy kann nur auf Einstellungen zeigen, die keine Zone haben (B11)                        |
| time-099 erinnerung durch umstellung verschoben? | P      | rechnerisch richtig; Hunch widerlegt                                                       |
| time-100 wie spät is es                          | P      | `## Now`                                                                                   |

**Die 19 Fälle ohne Pfad (✗):** time-019, 021, 025, 027, 028, 029, 030, 032, 033, 035, 038, 040,
041, 044, 058, 067, 084, 094, 096.

**Die 8 Fälle nur über die Einstellungen (T):** time-016, 017, 056, 062, 068, 072, 073, 074.

---

## 6. Was diese Prüfung _nicht_ beantwortet

Die statische Prüfung sagt, ob ein Weg **existiert** — nicht, ob das Modell ihn findet. Folgende
Fälle gehören in die Live-Stichprobe (Schritt 3 von Issue #106), weil dort die Rechnung, nicht das
Schema entscheidet:

- **R-Fälle (001, 003, 006, 007, 008, 010, 013, 053):** rechnet das Modell die Uhrzeit richtig,
  auch über Mitternacht und mit krummen Minuten?
- **time-044:** wählt das Modell bei einem Widerspruch stillschweigend eine Variante, oder fragt es?
- **time-055:** was bedeutet „nächsten Dienstag" für das Modell, an einem Dienstag gesagt?
- **time-012, 016, 017:** sagt Buddy nach der Ablehnung _ehrlich_, dass er zu dieser Zeit nicht
  darf — oder verspricht er es trotzdem (Regel 5)?
- **time-025 ff.:** sagt Buddy bei „jeden Tag" klar, dass er nur einzelne Tage kann?
