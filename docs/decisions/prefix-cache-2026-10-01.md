# Der Präfix-Cache: welche Zahl was gemessen hat — 01.10.2026

Anlass: `docs/issue-audit-2026-10-01.md` §Widersprüche 1. Zwei offene Issues sagen
Entgegengesetztes über denselben Hebel, und an #168 hängt der Plan, den Prompt zu
schneiden:

- **#166** Befund 5: „`cached_tokens` ist in Produktion bei **allen** Aufrufen 0" (77 Live-Aufrufe).
- **#168**: „Der Präfix-Cache fängt den Preis ab (~**18 300 von 20 700** Tokens kommen aus ihm)" —
  darauf baut die ganze Begründung.

Beide Zahlen sind falsch benannt. Was wirklich gemessen ist, steht hier. Jede Zahl mit
der Quelle, aus der sie kommt.

## Kurz

| Frage                                                 | Antwort                                                                                                                                                                            |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ist `cached_tokens` in Produktion immer 0?            | **Nein.** 4 von 51 Aufrufen, die der Zähler überhaupt erfassen konnte, tragen einen Wert.                                                                                          |
| Ist die 0 ein Aufzeichnungsfehler?                    | **Nicht mehr.** Für 43 der 77 Aufrufe aus #166 war sie einer — danach schreibt Vercel den Wert.                                                                                    |
| Fängt der Cache den Preis ab (#168)?                  | **Nein.** `buddy_turn` live: **28 348 von 308 726** Eingabe-Tokens, **9,2 %**.                                                                                                     |
| Ist der Präfix vergiftet (Zeitstempel, Name, Schema)? | **Nein** für Systemprompt und STATE. **Ja** für die zwei Antwort-Schemata — siehe §Befund 3.                                                                                       |
| Wer hatte recht?                                      | **#166 im Ergebnis** (der Cache trägt live fast nichts), aber mit falscher Begründung und falscher Grundmenge. **#168s Prämisse ist falsch**; sein Plan überlebt und wird stärker. |

## Woher jede Zahl kommt

Es gibt **einen** Schreibpfad und **einen** Leser, beide von beiden Messungen benutzt:

- `apps/api/src/llm/vertex.ts:79` — `usageOf()` liest `usageMetadata.cachedContentTokenCount`
  aus der Provider-Antwort (fehlend ⇒ 0).
- `apps/api/src/llm/call.ts:54–66` — `record()` schreibt es nach `llm_calls.cached_tokens`.

Der **Eval-Lauf** (`apps/api/evals/buddy/run.ts`) baut dieselbe `VertexGateway`, läuft
in-process gegen eine Wegwerf-Datenbank und summiert am Ende aus **derselben** Tabelle
(`run.ts:216`). **Produktion** läuft über Vercel gegen die gehostete Datenbank. Der Code
dazwischen ist identisch — es gibt keine zweite Implementierung, keinen zweiten Pfad.

Damit ist die Erklärung „wir speichern es auf dem einen Pfad nur nicht" ausgeschlossen,
und zwar nicht durch Lesen, sondern durch Werte: in der gehosteten Datenbank stehen von
Vercel geschriebene Zeilen mit `cached_tokens` = 6 073, 18 225, 4 050 und 1 979.

**Auch der gestreamte Pfad zählt richtig.** Die App schickt `accept: text/event-stream`
(`apps/mobile/lib/api/client.ts:206`), die API antwortet mit SSE
(`apps/api/src/modules/buddy/routes.ts:103`), und `vertex.ts` liest die Usage aus dem
**letzten** Stream-Chunk. Alle drei `buddy_turn`-Treffer sind also über den gestreamten
Pfad entstanden — `cachedContentTokenCount` übersteht das Streamen.

## Befund 1 — #166s „alle 77 auf 0" ist falsch, und seine Grundmenge ist falsch

Gemessen heute (01.10., gehostete Datenbank `ngxtokmtfrblcnjonxsv`, nur lesend):

```sql
-- genau das Fenster, das #166 benutzt (28.–30.09.)
select count(*) as calls,
       count(*) filter (where cached_tokens > 0) as with_cache,
       sum(cached_tokens) as cached_sum
from llm_calls
where created_at >= '2026-09-28' and created_at < '2026-10-01';
```

→ **77 Aufrufe, 2 davon mit Cache-Treffer, Summe 24 298 Tokens.** Dieselben 77 Aufrufe,
die #166 in seiner Tabelle aufschlüsselt. „Bei allen 0" stimmt also schon gegen die
eigene Datenbasis nicht.

Schlimmer ist der Nenner. **43 der 77 Aufrufe konnten die Zahl gar nicht tragen:**

| Was                                            | Wann (UTC)              | Quelle                                                           |
| ---------------------------------------------- | ----------------------- | ---------------------------------------------------------------- |
| Code, der `cached_tokens` schreibt, committet  | 2026-09-29 **06:03**    | `git log -1 f4ed06f` (`usageOf` + `record`)                      |
| Migration 0052 auf der gehosteten DB angewandt | 2026-09-29 **06:51:56** | `list_migrations` → Version `20260929065156`                     |
| Letzter Aufruf **vor** beidem                  | 2026-09-28 (43 Zeilen)  | `select count(*) from llm_calls where created_at < '2026-09-29'` |

Am 29.09. steht keine einzige Zeile in der Tabelle. Alle 43 Zeilen vom 28.09. wurden von
einem Deployment geschrieben, dessen `insert` die Spalte nicht einmal nannte — sie stehen
auf dem Spaltenstandard `0`. Für diese Hälfte der Stichprobe war die 0 **ein
Aufzeichnungsartefakt, keine Messung**. #166 hat beide Sorten in einen Topf geworfen.

Dazu kommt eine zweite Sorte struktureller Nullen: Vertex Implicit Caching braucht für
dieses Modell mindestens **4 096 Tokens** Präfix (dokumentiert in `docs/speed-audit.md`
§Lesart / Commit `f4ed06f`). `tutor` (1,1 k), `hints` (0,8 k), `summary` (0,4–0,5 k),
`transcribe`, `reexplain`, `pronounce` und `embedding` liegen darunter und können nie
treffen. In #166s 77 sind sie mitgezählt.

## Befund 2 — was der Cache in Produktion wirklich trägt

Nur Aufrufe, die ein Build mit Zähler aufgenommen hat:

```sql
select purpose,
       count(*) as calls,
       count(*) filter (where cached_tokens > 0) as with_cache,
       sum(input_tokens) as input_sum,
       sum(cached_tokens) as cached_sum,
       round(100.0 * sum(cached_tokens) / nullif(sum(input_tokens),0), 1) as cached_pct
from llm_calls
where created_at >= '2026-09-29 06:52:00+00'
group by purpose
order by input_sum desc;
```

Ergebnis (51 Aufrufe, 29.09. 06:52 UTC – 01.10. 17:55 UTC):

| Purpose       | Aufrufe | davon mit Treffer | Eingabe-Tokens | aus dem Cache | Anteil    |
| ------------- | ------- | ----------------- | -------------- | ------------- | --------- |
| `buddy_turn`  | 14      | **3**             | 308 726        | **28 348**    | **9,2 %** |
| `explain`     | 4       | 1                 | 16 493         | 1 979         | 12,0 %    |
| `tutor`       | 13      | 0                 | 14 569         | 0             | 0 %       |
| `buddy_check` | 2       | 0                 | 13 510         | 0             | 0 %       |
| `extraction`  | 1       | 0                 | 9 433          | 0             | 0 %       |
| `figures`     | 1       | 0                 | 5 270          | 0             | 0 %       |
| `embedding`   | 13      | 0                 | 1 150          | 0             | 0 %       |
| `summary`     | 2       | 0                 | 963            | 0             | 0 %       |
| `hints`       | 1       | 0                 | 809            | 0             | 0 %       |

Die drei `buddy_turn`-Treffer einzeln, mit dem Abstand zum vorherigen `buddy_turn`
derselben Prompt-Version:

| Zeit (UTC)          | Prompt   | Eingabe | aus dem Cache | Abstand |
| ------------------- | -------- | ------- | ------------- | ------- |
| 2026-09-30 09:36:16 | buddy.42 | 21 818  | 6 073         | 2,0 s   |
| 2026-09-30 09:36:18 | buddy.42 | 21 492  | **18 225**    | 1,4 s   |
| 2026-10-01 16:51:16 | buddy.45 | 22 438  | 4 050         | 24,6 s  |

Elf von vierzehn `buddy_turn`-Aufrufen bekamen **nichts**, darunter Aufrufe 24,5 s und
24,8 s nach dem vorherigen — zwei Nachbarn mit fast gleichem Abstand, einer trifft, zwei
nicht. Implicit Caching ist best-effort; das ist hier live zu sehen, nicht nur im
Handbuch.

**Ein Nebenbefund, der nicht verloren gehen soll:** die 18 225 sind der größte
Cache-Treffer, der in diesem Projekt je aufgezeichnet wurde — deutlich über der lokal am
29.09. gemessenen Decke von 12 013–12 177 Tokens (Systemprompt + Schema). Der Cache hat
dort also **in den geschichteten STATE-Block hineingegriffen**. Die Schichtung aus
`f4ed06f` („stabil zuerst, `## Now` zuletzt") zahlt sich aus, wenn der Cache überhaupt
greift. Sie bleibt.

## Befund 3 — warum der Cache live kalt bleibt (drei Ursachen, keine davon „vergifteter Präfix")

**Der Präfix ist stabil, soweit er unser ist.** Geprüft:

- `TURN_SYSTEM` (`apps/api/src/modules/buddy/prompts.ts:92`) ist eine Modulkonstante. Jede
  Interpolation darin (`grep -n '\${' prompts.ts`) ist selbst eine Konstante
  (`MAX_PAGES`, `PHOTO_RETENTION_DAYS`, `actToolsPrompt('turn')`, `lookupsPrompt('turn')`)
  — kein Zeitstempel, kein Name, keine Lernenden-Daten. **Byte-identisch in jedem Zug und
  über alle Lernenden.**
- `TURN_SCHEMA` / `TURN_STEP_SCHEMA` (`turn.ts:41–45`) sind ebenfalls Modulkonstanten aus
  statischen zod-Schemata.
- STATE ist geschichtet, stabil zuerst, die Uhr zuletzt (`context.ts`, Block `blocks`
  gegen Ende von `buildContext`). Vor dem stabilen Teil steht nichts Variables.

Gemessen in dieser Sitzung (lokal, aus dem Code im Arbeitsbaum):

| Baustein                               | buddy.45 | buddy.46   |
| -------------------------------------- | -------- | ---------- |
| `TURN_SYSTEM`                          | 22 212   | **22 607** |
| `CHECK_SYSTEM`                         | 10 494   | 10 494     |
| `TURN_SCHEMA` (Abschlussrunde)         | 32 362   | **32 362** |
| `TURN_STEP_SCHEMA` (Nachschlagerunden) | 33 431   | **33 431** |
| gemeinsames Präfix der zwei Schemata   | 32       | **32**     |

Zwei Spalten, weil `prompts.ts` während dieser Sitzung von buddy.45 auf buddy.46 wechselte
(+395 Zeichen Systemprompt). Genau das ist Ursache C unten: der Systemprompt bewegt sich
stündlich, die Schema-Zahlen stehen still — und die load-bearing Zahl, die 32 gemeinsamen
Zeichen, ist von der Prompt-Arbeit unberührt.

Nachmessen (ohne Modellaufruf, ohne Kosten):

```ts
// cd apps/api && npx tsx <datei>
import { z } from 'zod';
import { TURN_SYSTEM, CHECK_SYSTEM } from './src/modules/buddy/prompts.js';
import { TurnDecisionForModel } from './src/modules/buddy/registry.js';
import { lookupsField } from './src/modules/buddy/lookups.js';
import { toJsonSchema } from './src/llm/json-schema.js';
const FINAL = JSON.stringify(toJsonSchema(TurnDecisionForModel));
const STEP = JSON.stringify(
  toJsonSchema(z.object({ lookups: lookupsField }).extend(TurnDecisionForModel.shape)),
);
let i = 0;
while (i < FINAL.length && FINAL[i] === STEP[i]) i++;
console.log(TURN_SYSTEM.length, CHECK_SYSTEM.length, FINAL.length, STEP.length, i);
```

### Ursache A: die zwei Antwort-Schemata teilen 32 von ~32 350 Zeichen

`TURN_STEP_SCHEMA` entsteht als `z.object({ lookups: lookupsField }).extend(...)` — also
steht `lookups` als **erste** Eigenschaft im serialisierten Schema. Ab Zeichen 33 laufen
Nachschlagerunde und Abschlussrunde auseinander. Da das Antwort-Schema **vor** `contents`
in die Anfrage geht, haben die beiden Rundenarten keinen gemeinsamen Cache-Eintrag; der
Systemprompt allein (3 442 Tokens, dokumentiert in `f4ed06f`) liegt unter dem
4 096er-Minimum und kann für sich nichts tragen.

Das erklärt die Form des 09:36-Bündels: drei Aufrufe in vier Sekunden, und der Abschluss
der Runde steht vor einem anderen Präfix als die Schritte davor.

**Der Umbau, der das behebt** (ein Zeichen Reihenfolge, keine Semantik; **nicht in dieser
Änderung umgesetzt**, das ist eine eigene Entscheidung):

```ts
// turn.ts:43 — statt z.object({ lookups: lookupsField }).extend(TurnDecisionForModel.shape)
const TURN_STEP_SCHEMA = toJsonSchema(TurnDecisionForModel.extend({ lookups: lookupsField }));
```

Gemessen, ebenfalls in dieser Sitzung: das ergibt **dieselbe** serialisierte Länge
(33 431 Zeichen, also identischer Inhalt) und ein gemeinsames Präfix von **32 249 statt 32
Zeichen** — 99,7 % des Abschluss-Schemas. Beide Rundenarten wärmen dann denselben
Cache-Eintrag.

Was damit **nicht** belegt ist: ob Gemini seinen Präfix genau auf dem serialisierten
Schema in dieser Reihenfolge bildet. Der Umbau kostet nichts und ist riskofrei
(`lookups` bleibt Feld, Beschreibung und Validierung unverändert), aber die Wirkung muss
an `cached_tokens` gemessen werden, bevor sie behauptet wird. `evals/buddy` muss
unverändert grün bleiben (das Schema ändert seine Schlüsselreihenfolge, und das Modell
schreibt danach `lookups` als letztes Feld).

### Ursache B: Verkehrsdichte — der Eval ist kein Betrieb

Der Eval-Lauf feuert hunderte Aufrufe mit **einem** identischen Präfix innerhalb von
Minuten; jeder Aufruf hält den Eintrag warm. Produktion feuert eine Handvoll, Minuten bis
Stunden auseinander (gemessen: Abstände zwischen `buddy_turn`-Aufrufen von 1,4 s bis
21 011 s). Derselbe Code, dieselben Bytes, völlig andere Dichte. Das ist der Hauptgrund,
warum 65 % im Eval und 9,2 % live keine Widersprüche sind, sondern zwei verschiedene
Messungen.

### Ursache C: Prompt-Versionen rotieren schneller als der Cache lebt

In den aufgezeichneten Daten steht `buddy.42` am 30.09. und `buddy.45` am 01.10.; Commit
`49ce7fa` nennt sechzehn Prompt-Versionen an einem Tag. Jede Änderung am Systemprompt ist
ein neuer Präfix und setzt den Cache auf null. Ein Prompt-Schnitt (#168) macht genau das
— die Wirkung eines Schnitts ist deshalb **nicht** an den ersten Zügen nach dem Deploy
messbar.

## Was aus #168 wird

Die Prämisse fällt:

- Der Befehl, den #168 als Messung nennt (`pnpm --filter @learnbuddy/api exec tsx
scripts/speed-audit.ts`), **liest `cached_tokens` überhaupt nicht**. Seine
  `llm_calls`-Abfrage (`apps/api/scripts/speed-audit.ts`, Abschnitt „Modellseite") wählt
  `purpose`, `count`, Latenz-Median/Max, Input-Median und Output-Median — keine
  Cache-Spalte. Die „18 300" können aus diesem Lauf nicht stammen.
- Herkunft der Zahl ist Commit `49ce7fa` („von 20 700 Eingabe-Tokens pro Zug kommen rund
  18 300 aus dem Präfix-Cache des Anbieters"), und das ist ein **Eval**-Satz, kein
  Produktionssatz. Selbst für den Eval ist er zu hoch: die Eval-Läufe, die in
  `docs/decisions/model-choice-2026-10-01.md` stehen, melden für 3.6 **561 207 von
  1 156 757** Eingabe-Tokens aus dem Cache (48,5 %) — nicht 88 %. (Diese Eval-Zahlen sind
  hier **zitiert**, nicht in dieser Sitzung nachgemessen; ihre Quelle ist das
  Entscheidungsdokument bzw. der Lauf-Ausdruck.)
- Live trägt der Cache bei `buddy_turn` **9,2 %**. Der Satz „der Präfix-Cache fängt den
  Preis ab" ist damit widerlegt.

Der **Plan** von #168 überlebt und wird stärker, nicht schwächer:

1. Die Begründung dreht sich: Der Prompt kostet **Preis _und_ Wartezeit**, nicht nur
   Wartezeit. Die Einsparung eines Schnitts ist annähernd voll, nicht zu 88 % vom Anbieter
   geschenkt.
2. **Das Antwort-Schema gehört in die Messung.** Es ist mit 32 362 Zeichen der größere der
   beiden statischen Blöcke — größer als der Systemprompt mit 22 212 (buddy.45) bzw. 22 607 Zeichen (buddy.46) — und geht bei
   jedem Aufruf vollständig mit. #168 erwähnt es nicht. Es ist derselbe Hebel mit derselben
   Methode (welches Feld kommt in 49 Zügen je vor?).
3. **Vorsicht an der Untergrenze:** Der Systemprompt allein liegt mit 3 442 Tokens unter dem
   4 096er-Minimum; über die Schwelle hebt ihn erst das Schema. Wer beides gleichzeitig
   kürzt, kann den Cache für immer ausschalten. Also: ein Block pro Schnitt, mit
   `cached_tokens` daneben.
4. **Messfenster statt Momentaufnahme:** Jeder Schnitt bumpt die Prompt-Version und setzt
   den Cache zurück. Vorher/Nachher braucht ein Fenster mit vergleichbarer Dichte — am
   besten dieselbe Eval-Suite, und die Live-Zahl erst, wenn genug Züge auf der neuen
   Version stehen.

Für #166 Hebel E (explizites `cachedContents`): die Datengrundlage dafür ist jetzt besser,
nicht schlechter — 9,2 % statt 0 % heißt, dass ~90 % des stabilen Präfix live weiterhin
voll bezahlt werden. Ursache A gehört aber **vorher** behoben: explizites Caching für zwei
Schemata zu bezahlen, die sich nur in der Feldreihenfolge unterscheiden, wäre doppelte
Speichergebühr für denselben Text.

## Was offen bleibt

- **Warum ein Treffer trifft und der Nachbar nicht.** 24,6 s treffen, 24,5 s und 24,8 s
  nicht. Die Lebensdauer des impliziten Cache ist vom Anbieter nicht zugesagt, und 14
  `buddy_turn`-Aufrufe sind zu wenig für eine Verteilung. Mehr Daten (oder explizites
  Caching mit eigener TTL) klären das, Raten nicht.
- **Ob Ursache A wirklich der Grund für die kalten Abschlussrunden ist.** Belegt ist nur
  die Zeichenmessung (32 gemeinsame Zeichen) und dass der Präfix vor `contents` liegt. Der
  Beweis ist ein Lauf mit vertauschter Feldreihenfolge und `cached_tokens` daneben.
- **Die Transportart pro Zeile.** `llm_calls` schreibt nicht mit, ob ein Aufruf gestreamt
  war. Dass die Treffer aus dem gestreamten Pfad kommen, folgt daraus, dass die App für
  `buddy_turn` immer SSE verlangt — nicht aus der Zeile selbst.

## Nachmessen

```bash
# Live (gehostete DB, nur lesend) — die zwei Abfragen oben, plus:
#   Treffer im Zeitverlauf mit Abstand zum Vorgänger derselben Prompt-Version
```

```sql
with t as (
  select created_at, purpose, prompt_version, input_tokens, cached_tokens,
         lag(created_at) over (partition by purpose, prompt_version order by created_at) as prev
  from llm_calls
  where created_at >= '2026-09-29 06:52:00+00'
)
select purpose, prompt_version,
       round(extract(epoch from (created_at - prev))::numeric, 1) as gap_s,
       input_tokens, cached_tokens
from t
order by purpose, created_at;
```

```bash
# Eval-Seite (kostet echtes Geld, braucht Vertex-Zugang):
cd apps/api && LLM_BACKEND=vertex BUDDY_EVAL_OUT=run.json npx tsx evals/buddy/run.ts
# Die Schlusszeile nennt Eingabe-Tokens und wie viele davon aus dem Cache kamen.
```

Die Zeichenmessung der Prompt-Bausteine steht als Skript in §Befund 3 — sie braucht kein
Modell und keine Datenbank.
