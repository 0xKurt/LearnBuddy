# LearnBuddy – Werbevideo (9:16, DE + EN, Overlays + Sprechertext)

Stand: Repo-HEAD `ef57038` vom 24.10.2026 (`/home/claude/0xkurt/learnbuddy`). Die Aufnahme ist eine
**live bediente App** (Playwright-Video, Web-Build gegen den Dev-Stack, 390×844, geskriptetes
Modell), aufgenommen in **einer** Session ohne Neuladen – je Sprache ein eigener Lauf. Die
maschinenlesbare Fassung liegt in `scenes.json`: `languages.de|en` enthält die Texte (Headline,
Caption, Sprechertext, Dauer je Szene, Intro, Outro). `scenes[]` enthält die
sprachunabhängigen Schritte; wo Labels oder getippter Text sich unterscheiden, steht dort
`{"de": …, "en": …}`. `session` enthält Konfiguration, Vorlauf, die Schritte nach Szene 1 und den
Rest der Übung. Verknüpft wird über `n`; die Konventionen stehen in `session.conventions`.

## 1. Kernbotschaft

- **DE:** Sag Buddy, was ansteht, und zeig ihm dein Blatt – er macht daraus eine ruhige Übung, hilft mit Tipps und meldet sich so, wie die Eltern es erlauben.
- **EN:** Tell Buddy what's coming up and show him your sheet – he turns it into calm practice, helps with hints and checks in the way the parents allow.

## 2. Intro und Outro

| | DE | EN |
|---|---|---|
| Intro – Wortmarke | LearnBuddy | LearnBuddy |
| Intro – Satz (≤ 6 W.) | Dein Lernbuddy für Arbeiten und Tests. | Your study buddy for tests. |
| Intro – Sprecher (≤ 12 W.) | Das ist LearnBuddy – dein Lernbuddy für Arbeiten und Tests. (9) | This is LearnBuddy – your study buddy for tests and exams. (10) |
| Outro – Claim | Buddy denkt mit. | Buddy thinks ahead. |
| Outro – CTA (≤ 8 W.) | Erzähl Buddy einfach, was bei dir ansteht. | Just tell Buddy what's coming up. |
| Outro – Sprecher (≤ 18 W.) | Buddy denkt mit, damit Mia in Ruhe lernen kann. Erzähl Buddy einfach, was bei dir ansteht. (16) | Buddy thinks ahead, so Mia can learn calmly. Just tell Buddy what's coming up. (14) |

Alle Claims und CTAs sind echte App-Texte: `auth:welcome.title`, `common:onboarding.s3_title`
(„Buddy denkt mit“ / „Buddy thinks ahead“), `memory`-Leerzeile bzw. `common:onboarding.s1_title`.
Als Hintergrund fürs Intro eignen sich die ersten ~2,5 s der Aufnahme: der Welcome-Screen mit
Orb und genau diesem Satz.

## 3. Die 7 Szenen

Breiten gemessen mit Figtree aus `/home/claude/promo/figtree-src` (Headline ExtraBold 84 px,
Caption Bold 44 px, Grenze 960 px bei 1080 px Breite; Kerning ignoriert). Die Referenz-Caption
des alten Videos misst 935 px – das ist der Maßstab.

### Deutsch

| Nr | Headline (px) | Caption (px) | USP (§1.1) | Dauer |
|---|---|---|---|---|
| 1 | Mit Eltern-PIN (560) | Ob Buddy sich meldet, entscheiden die Eltern. (929) | 5 EU/Kinder · 1 nur mit Erlaubnis | 7,5 s |
| 2 | Eine Arbeit steht an (776) | Ein Satz genügt – Buddy trägt die Arbeit ein. (897) | 1 Proaktiv · 4 ruhiger Screen | 7,5 s |
| 3 | Foto vom Arbeitsblatt (867) | Ein Foto im Chat – Buddy liest das Blatt. (804) | 2 Ihr Material ist die Quelle | 7,5 s |
| 4 | Übung ist bereit (630) | Aus ihrem Blatt macht Buddy eine Übung. (840) | 1 bereitet vor · 2 | 7,0 s |
| 5 | Ein Tipp hilft weiter (774) | Buddy gibt einen Tipp – sie findet die Lösung. (917) | 3 Verlässliche Prüfung | 7,5 s |
| 6 | Geschafft! (418) | Buddy zeigt in Ruhe, was heute gelungen ist. (900) | 4 Ein ruhiger Screen | 7,5 s |
| 7 | Bis morgen, 16 Uhr (725) | Buddy meldet sich zur verabredeten Zeit. (834) | 1 meldet sich · 5 Kontaktregeln | 8,5 s |

### English

| No | Headline (px) | Caption (px) | USP | Duration |
|---|---|---|---|---|
| 1 | Parents' PIN (484) | Parents decide whether Buddy may reach out. (933) | 5 · 1 | 7.5 s |
| 2 | Test coming up (602) | One sentence – Buddy adds the test. (741) | 1 · 4 | 8.5 s |
| 3 | Photo of a worksheet (839) | A photo in the chat – Buddy reads it. (735) | 2 | 7.5 s |
| 4 | Practice is ready (657) | Buddy turns her sheet into short practice. (840) | 1 · 2 | 7.5 s |
| 5 | A hint helps (463) | Buddy gives a hint – she finds the answer. (843) | 3 | 7.5 s |
| 6 | Done! (230) | Buddy calmly shows what went well today. (872) | 4 | 7.5 s |
| 7 | Tomorrow at 4 pm (728) | Buddy checks in at the agreed time. (723) | 1 · 5 | 8.5 s |

### Sprechertext je Szene

| Nr | DE (Wörter) | EN (words) |
|---|---|---|
| 1 | Zuerst richten die Eltern alles ein. Sie setzen ihre PIN und entscheiden, ob Buddy sich melden darf. (17) | First, a parent sets things up. They choose a PIN and decide whether Buddy may reach out. (17) |
| 2 | Mia erzählt Buddy, was ansteht. Buddy trägt die Mathearbeit am Freitag ein und bittet um das Blatt. (17) | Then Mia tells Buddy what's coming up. Buddy adds her maths test on Friday and asks for her worksheet. (19) |
| 3 | Mia fotografiert ihr Arbeitsblatt direkt im Chat. Buddy liest die Aufgaben – ihr eigenes Material ist die Quelle. (17) | Mia snaps her worksheet in the chat. Buddy reads it, so her own sheet is the source. (17) |
| 4 | Kurz darauf ist die Übung bereit – mit Aufgaben aus genau ihrem Blatt, passend zur Arbeit. (15) | Soon the practice is ready, with tasks from her very own sheet, made for Friday's test. (16) |
| 5 | Beim Hängenbleiben gibt Buddy einen freundlichen Tipp. Und „Richtig“ sagt er erst, wenn die Antwort wirklich stimmt. (17) | When she gets stuck, Buddy gives a friendly hint. Buddy says “right” only when it really is. (17) |
| 6 | Am Ende zeigt Buddy in Ruhe, was Mia heute geschafft hat. Das Ergebnis bleibt im Chat. (16) | At the end, Buddy calmly shows what Mia got done today. The result stays in the chat. (17) |
| 7 | Zum Schluss verabredet Mia eine Erinnerung für morgen, 16 Uhr. Buddy meldet sich dann, wie die Eltern es erlauben. (19) | Finally, Mia sets a reminder for tomorrow at four. Buddy will check in then, just as her parents allowed. (19) |

Dauer je Szene = Sprechdauer bei 150 W./Min. + ~0,7 s, auf 0,5 s aufgerundet. **Gesamtlänge:**
DE 53 s Szenen + 4,5 s Intro + 7,5 s Outro = **65 s**, EN 54,5 s + 5 s + 6,5 s = **66 s**.
Mit 6–11 s Sprechtext je Szene sind die ursprünglich geplanten 35–45 s nicht erreichbar (siehe §7).

## 4. Aufnahme-Setup (`tests/web/promo.spec.ts`)

- Lauf: `scripts/web-walkthrough.sh promo` (Workflow `.github/workflows/promo.yml` auf
  `claude/promo-video`, lädt `test-results/web` als Artefakt hoch). Zwei Tests, je Sprache einer,
  jeder mit eigener Lernerin (`freshEmail('promo-de')` / `freshEmail('promo-en')`).
- `test.use({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, video: { mode: 'on', size: { width: 780, height: 1688 } }, colorScheme: 'light', reducedMotion: 'no-preference' })`.
  Ohne `size` skaliert Playwright das Video auf ≤ 800×800 herunter. Die Bewegung bleibt an
  (Orb, Einblendungen), deshalb **kein** `screenLook()` (das setzt `reducedMotion: 'reduce'`).
- EN-Lauf zusätzlich `test.use({ locale: 'en-GB' })`: `lib/i18n/index.ts` liest die
  Gerätesprache (`expo-localization` → `navigator.languages`), Welcome und alle weiteren Schritte
  sind dann von Anfang an Englisch, und die Profilsprache der Lernerin wird `en`. Prüfen mit
  `expect(page.getByText('Your study buddy for tests and exams.')).toBeVisible()`. Falls die
  Seite doch Deutsch zeigt, die Sprache auf dem Welcome umstellen wie `languages.spec.ts`:
  `getByRole('button', { name: /Deutsch/ })` (Pill „Sprache wählen: Deutsch“) →
  `getByRole('radio', { name: 'English' })`.
- **Keine** Helfer aufrufen, die das Fenster verkleinern oder Screenshots ziehen (`shot`,
  `bothSchemes`, `screenShots`, `settle`): die verändern das Video. `expectSeen()` aus
  `tests/web/seen.ts` ist gut, damit eine Pause erst beginnt, wenn der Text wirklich sichtbar ist.
- Tippen sichtbar machen: `locator.pressSequentially(text, { delay })` statt `fill()`, vorher
  `fill('')`. Alle Repo-Specs nutzen `fill()`; ob `pressSequentially` mit den
  React-Native-Web-Feldern sauber läuft, ist ungeprüft. Wenn nicht, `fill()` nehmen.
- Szenenmarken: `const t0 = Date.now()` als erste Zeile; zu Beginn und Ende jeder Szene
  `{ n, from, to }` (ms seit `t0`) sammeln und nach `test-results/web/promo-marks-<lang>.json`
  schreiben. Video sichern: `const v = page.video(); await page.close(); await v?.saveAs('test-results/web/promo-<lang>.webm')`.
  Der Versatz zwischen Videostart (Seite angelegt) und `t0` ist klein und konstant.
- Optional einen Tipp-Punkt einblenden, weil das Video keinen Zeiger zeigt
  (`page.addInitScript`, beim `pointerdown` ein 44-px-Kreis in Violett, `rgba(124,92,255,.28)`,
  der in 450 ms ausblendet; `pointer-events: none`).

## 5. Interaktionsskript (eine Session, ohne Neuladen)

Labels: links DE, rechts EN (aus `apps/mobile/locales/{de,en}`). „⏸ n ms“ = Lesepause.
✂ = Teil der Aufnahme, den der Schnitt entfernt. Die Helfer heißen wie in `tests/web/coreLoop.ts`.

### Vorlauf ✂ (außer die ersten 2,5 s als Intro-Hintergrund)

Entspricht `signUpMia()` bis vor die PIN.

1. `page.goto('/')`. Warten auf „Dein Lernbuddy für Arbeiten und Tests.“ / „Your study buddy for tests and exams.“ ⏸ 2500 (Intro-Hintergrund).
2. `getByLabel('E-Mail')` / `'E-mail'` ← `freshEmail('promo-de')`; `getByLabel('Passwort', { exact: true })` / `'Password'` ← `geheim-1234`; `getByLabel('Passwort wiederholen')` / `'Repeat password'` ← `geheim-1234`; tippen auf Button „Konto erstellen“ / „Create account“.
3. Warten auf „Kurz zum Datenschutz“ / „A quick word on privacy“ → `getByRole('checkbox')` → Button „Weiter“ / „Continue“.
4. Warten auf „Wer lernt mit LearnBuddy?“ / „Who is learning with LearnBuddy?“ → Radio „Mein Kind“ / „My child“ → `getByLabel('Wie heißt dein Kind? (Spitzname genügt)')` / `"What's your child's name? (A nickname is fine)"` ← `Mia` → Button „Bundesland wählen“ / „Choose your federal state“ → Radio „Niedersachsen“ / „Lower Saxony (Niedersachsen)“ → `getByLabel('Tag'|'Monat'|'Jahr', { exact: true })` / `'Day'|'Month'|'Year'` ← `14`, `03`, `2013` → Button „Weiter“ / „Next“.

### Szene 1 – Mit Eltern-PIN / Parents' PIN

| # | Aktion | Was erscheint |
|---|---|---|
| 1 | warten | „Noch kurz für die Eltern“ / „One more thing for the parents“ ⏸ 1000 |
| 2 | tippen: Checkbox `/sorgeberechtigt/` / `/parental responsibility/` | Haken gesetzt ⏸ 400 |
| 3 | tippen in `getByLabel('PIN der Eltern')` / `"Parents' PIN"` ← `4826` (delay 180) | vier Punkte ⏸ 200 |
| 4 | tippen in `getByLabel('PIN wiederholen')` / `'Repeat PIN'` ← `4826` (delay 180) | ⏸ 500 |
| 5 | Button „Weiter“ / „Next“ (exact) | Frage „Darf Buddy Mia Benachrichtigungen schicken?“ / „May Buddy send Mia notifications?“, darunter „Zum Beispiel eine Erinnerung vor einer Arbeit. Nie abends – und ändern könnt ihr es jederzeit in den Einstellungen, mit eurer PIN.“ / „For example a reminder before a test. Never in the evening – and you can change it any time in the settings, with your PIN.“, „2 von 4“ ⏸ 2800 |
| 6 | Button „Ja, erlauben“ / „Yes, allow“ | Übergabe „Fertig! Das ist eingestellt:“ / „Done! This is set up:“ mit **Einwilligung zum Datenschutz:** erteilt · **PIN der Eltern:** gesetzt – nur ihr kennt sie · **Push-Benachrichtigungen:** erlaubt …; „Gib Mia jetzt das Handy.“ / „Now hand the phone to Mia.“ ⏸ 2500 |

Danach ✂: Button „Los geht's, Mia!“ / „Let's go, Mia!“ → nur mit `LB_DEV_SPEECH=fake` die
Stimmenseite („Buddys Stimme“, dann „Weiter“) → „Sag es Buddy einfach“ / „Just tell Buddy“ →
Button „Überspringen“ / „Skip“ → warten auf `getByText('LearnBuddy')`.

### Szene 2 – Eine Arbeit steht an / Test coming up

| # | Aktion | Was erscheint |
|---|---|---|
| 1 | warten | Überschrift „Hallo Mia. Was steht an?“ / „Hello Mia. What's coming up?“, „Erzähl mir von deiner nächsten Arbeit oder zeig mir ein Arbeitsblatt. Ich mach daraus Übungen.“, drei Einstiege („Ich schreibe bald eine Arbeit“ · „Foto vom Arbeitsblatt“ · „Einfach mal üben“) ⏸ 1500 |
| 2 | tippen in `getByLabel('Schreib Buddy …')` / `'Write to Buddy …'` (delay 35) – DE: **„Ich schreibe am Freitag eine Mathearbeit über Brüche.“** EN: **„I have a maths test on Friday about fractions.“** | ihr Text im Feld ⏸ 400 |
| 3 | Button „Senden“ / „Send“ | ihre Blase; Buddy (Wort für Wort): „Super, dann bereiten wir uns bis Freitag zusammen vor. Hast du ein Arbeitsblatt dazu? Ein Foto reicht.“ / „Great, let's get ready for Friday together. Do you have a worksheet for it? A photo is enough.“; Beleg-Chip „Eingetragen: Mathearbeit Brüche am Freitag, 30. Oktober“ / „Added: Fractions test on Friday 30 October“ mit „Zurücknehmen“ / „Take back“; oben die Karte „Arbeitsblatt Brüche · Schick mir ein Foto.“ / „Fractions worksheet · Send me a photo.“ mit „Foto hinzufügen“ / „Add photo“ ⏸ 3000 |

Das Datum ist der nächste Freitag *nach* dem Aufnahmetag (`apps/api/src/lib/time.ts`), deshalb
im Spec per Regex prüfen: `/Eingetragen: Mathearbeit Brüche am /`. Solange die Foto-Karte oben
steht, zeigt der Chat **keinen** Beleg „Ich warte auf dein Foto“ (`core-loop-plan.spec.ts:58`).

### Szene 3 – Foto vom Arbeitsblatt / Photo of a worksheet

| # | Aktion | Was erscheint |
|---|---|---|
| 1 | Button „Foto hinzufügen“ / „Add photo“ (exact; der in der Karte oben) | Quellenmenü „Was möchtest du anhängen?“ / „What do you want to attach?“ mit „Foto aufnehmen“ · „Aus der Galerie“ · „Aus Dateien“ ⏸ 700 |
| 2 | Upload: `page.waitForEvent('filechooser')` + Button „Foto aufnehmen“ / „Take photo“ (exact) → `setFiles(...)` – DE: `await worksheetJpeg(page)` (`test-results/web/worksheet.jpg`), EN: eigenes englisches Blatt, siehe §6.2 | Foto-Kachel im Eingabefeld, Bild „Foto 1 von 1“ / „Photo 1 of 1“ ⏸ 1200 |
| 3 | Button „Senden“ / „Send“ | oben die Lese-Karte mit ihrem Foto („Ich lese dein Blatt …“ / „I'm reading your sheet …“, Schritte Angekommen · Lesen · Übungen / Arrived · Reading · Practice). Der Text wechselt schnell, deshalb ohne `expect` ⏸ 2000 |

Danach ✂: warten auf `getByRole('button', { name: /^Übung bereit: Mathearbeit Brüche\./ })` /
`/^Practice ready: Fractions test\./`, Timeout 30 s (wie `sendWorksheet()`).

Wichtig: Es muss das gerenderte Blatt aus `worksheetJpeg()` sein (800×1000 @2x, die App schickt
es als 1280×1600). Die Leseregel in `core-loop.ts` erkennt es an `<image 1280x1600>`. Das
Fixture `apps/mobile/lib/photo/__tests__/fixtures/sharp.jpg` (`figureWalk.sendPhoto`) würde ein
anderes Szenario-Blatt liefern.

### Szene 4 – Übung ist bereit / Practice is ready

| # | Aktion | Was erscheint |
|---|---|---|
| 1 | warten | Karte oben „Übung bereit: Mathearbeit Brüche“ / „Practice ready: Fractions test“, „4 Aufgaben · ca. 5 Min.“ / „4 tasks · about 5 min“, Button „Jetzt üben“ / „Practise“; im Chat Buddy: „Aus deinem Arbeitsblatt habe ich eine kurze Übung gemacht.“ / „I made a short practice from your worksheet.“ mit „nur hier in der App“ / „only here in the app“ ⏸ 3000 |
| 2 | Button „Jetzt üben“ / „Practise“ (exact) | Übungsscreen, „Aufgabe 1 von 4“ / „Task 1 of 4“, die erste Frage auf der Papierkarte ⏸ 2000 |

Danach ✂: die übrigen Fragen beantworten (Block „Rest der Übung“). Die Reihenfolge kommt vom
Server (`practice/selection.ts`, meist die Reihenfolge auf dem Blatt, aber nicht garantiert).
Deshalb wie `practise()` in `coreLoop.ts` je Screen die sichtbare Frage erkennen. Ist es die
Warum-Frage, folgt Szene 5, sonst der passende Block. Schluss ist, wenn „Geschafft!“ / „Done!“
als Überschrift steht.

**Rest der Übung** (✂, gern in normalem Tempo, als Zwischenschnitt nutzbar):

| Frage (DE / EN) | Antwort | dann |
|---|---|---|
| „Kürze 6/8 und gib das Ergebnis als Dezimalzahl an.“ / „Simplify 6/8 and give the result as a decimal.“ | `getByLabel('Deine Antwort')` / `'Your answer'` ← `0,75` / `0.75` | „Prüfen“/„Check“ → „Richtig“/„Right“ (+ „Stimmt – gut gemacht!“ / „That's right – well done!“) → „Weiter“/„Next“ |
| `/^Welcher Bruch ist größer:/` / `/^Which fraction is larger:/` (gesetzte Brüche 2/3 und 3/5) | Radio „2 Drittel“ / „2 thirds“ (exact) | „Prüfen“ → „Richtig“ → „Weiter“ |
| „Wie heißt die Zahl unter dem Bruchstrich?“ / „What is the number below the fraction bar called?“ | ← `Nenner` / `denominator` | „Prüfen“ → „Richtig“ → „Weiter“ |

### Szene 5 – Ein Tipp hilft weiter / A hint helps

| # | Aktion | Was erscheint |
|---|---|---|
| 1 | warten | Frage „Warum multipliziert man beim Erweitern Zähler und Nenner mit derselben Zahl?“ / „Why do you multiply the numerator and the denominator by the same number?“ ⏸ 1500 |
| 2 | `fill('')`, dann tippen in „Deine Antwort“ / „Your answer“ (delay 45) – DE: **„Damit der Bruch größer wird.“** EN: **„So the fraction gets bigger.“** | ⏸ 400 |
| 3 | Button „Prüfen“ / „Check“ | ihre Blase, kurz „Buddy schaut sich deine Antwort an …“ / „Buddy is looking at your answer …“, dann Marke „Noch nicht ganz“ / „Not quite yet“ und Buddy: „Fast. Denk daran, was mit dem Wert des Bruchs passiert.“ / „Almost. Think about what happens to the value of the fraction.“ Die Frage bleibt offen. ⏸ 2800 |
| 4 | `fill('')`, dann tippen – DE: **„Damit der Wert gleich bleibt.“** EN: **„So the value stays the same.“** | ⏸ 400 |
| 5 | Button „Prüfen“ / „Check“ | Marke „Richtig“ / „Right“, Buddy: „Genau – der Wert bleibt gleich, nur die Darstellung ändert sich.“ / „Exactly – the value stays the same, only the way it looks changes.“, Button „Weiter“ / „Next“ ⏸ 2200 |
| 6 | Button „Weiter“ / „Next“ (✂-Grenze) | nächste Frage oder Ergebnis |

Die falsche Antwort darf weder „wert“ noch „gleich“ enthalten (EN: weder „value“ noch „same“),
weil die Tutor-Regel genau daran unterscheidet (`core-loop.ts`, Regel 4).

### Szene 6 – Geschafft! / Done!

| # | Aktion | Was erscheint |
|---|---|---|
| 1 | warten | Ergebnisseite: „Geschafft!“ / „Done!“, darunter „Fertig“ / „Finished“, „Du hast 4 Aufgaben beantwortet.“ / „You answered 4 tasks.“, je Frage eine Zeile mit „Richtig“ / „Right“; ruhiger Zweitweg „Mehr davon, etwas schwerer“ / „More like this, a bit harder“; Hauptaktion „Zurück zu Buddy“ / „Back to Buddy“ ⏸ 3000 |
| 2 | `getByTestId('bottom-bar').getByRole('button', { name: 'Zurück zu Buddy' / 'Back to Buddy', exact: true })` (der Kopf hat dasselbe Label, deshalb eingegrenzt, siehe `redesign-done.spec.ts`) | Chat; das Ergebnis steht als Karte im Verlauf: „Geschafft!“ / „Done!“ mit „Ansehen“ / „View“ ⏸ 2000 |

Wegen des zweiten Versuchs in Szene 5 fehlt der Satz „Alles saß gleich beim ersten Mal.“. Die
Seite zeigt keine Themenlisten: Jedes Thema hat nur eine Frage, und unter zwei Fragen nennt die
Zusammenfassung kein Thema (`practice/summary.ts`, `ENOUGH_FOR_A_TOPIC = 2`). Am Ende waren alle
Antworten richtig, deshalb gibt es auch keine Zeile „Schauen wir nochmal an“ (`summaryLine.ts`).

### Szene 7 – Bis morgen, 16 Uhr / Tomorrow at 4 pm

| # | Aktion | Was erscheint |
|---|---|---|
| 1 | tippen in „Schreib Buddy …“ / „Write to Buddy …“ (delay 35) – DE: **„Erinnere mich morgen um 16 Uhr an Brüche.“** EN: **„Remind me about fractions tomorrow at 4 pm.“** | ⏸ 400 |
| 2 | Button „Senden“ / „Send“ | Buddy: „Alles klar, ich erinnere dich morgen um 16 Uhr an Brüche.“ / „Okay, I'll remind you about fractions tomorrow at 4 pm.“; Beleg „Verabredet: Brüche üben morgen, 16:00“ / „Agreed: Practise fractions tomorrow, 16:00“ mit „Zurücknehmen“ / „Take back“ ⏸ 3500 |
| 3 | prüfen, dass **nicht** dasteht: „Verabredetes erscheint hier in der App – Benachrichtigungen sind aus.“ / „What you agreed shows up here in the app – notifications are off.“ | belegt das „Ja, erlauben“ aus Szene 1 |

Ende: Seite schließen, Video sichern, Marken schreiben.

### Alternativen (optional)

- **Szene 3, mit Foto-Coaching:** zuerst `apps/mobile/lib/photo/__tests__/fixtures/blur.jpg`
  hochladen → „Foto 1 ist unscharf.“ / „Photo 1 is blurry.“ und „Schwer lesbar“ / „Hard to read“
  mit „Neu fotografieren“ / „Take it again“ und „Trotzdem behalten“ / „Keep it anyway“ ⏸ 2000 →
  Upload über „Neu fotografieren“ mit dem echten Blatt (Ablauf wie `core-loop-plan.spec.ts:66–82`).
- **Szene 4:** Antippen der Karte klappt die Details auf (`now.ready_for_exam`: „Für „Mathearbeit
  Brüche“ am Freitag“). Wortlaut im Spec nicht belegt.
- **Szene 1, PIN später:** im Setup „Nein, danke“ wählen und am Ende Mehr → Einstellungen → „Aufs
  Handy“ → „Eltern fragen“ → PIN-Tasten `4`,`8`,`2`,`6` → „Ja – nie nach 20:00 Uhr.“
  (`tour.spec.ts:217–226`). Dann zeigt Szene 7 aber den Hinweis „Benachrichtigungen sind aus“.

## 6. Texte des geskripteten Modells

### 6.1 Deutsch – schon vorhanden (`apps/api/src/testing/scenarios/core-loop.ts`)

| Auslöser | Buddy / Inhalt |
|---|---|
| Chat `/mathearbeit über brüche/i` (Zitat „am Freitag eine Mathearbeit über Brüche“) | „Super, dann bereiten wir uns bis Freitag zusammen vor. Hast du ein Arbeitsblatt dazu? Ein Foto reicht.“ + `plan_exam` „Mathearbeit Brüche“ (Mathe, Freitag) + `request_material` „Arbeitsblatt Brüche“ |
| Lesen `<image 1280x1600>` | Blatt „Brüche kürzen und vergleichen“ (Mathe), 4 Aufgaben (siehe Rest der Übung + Warum-Frage) |
| Check `new material is ready: "Brüche kürzen und vergleichen"` | `prepare_practice` + Nachricht „Aus deinem Arbeitsblatt habe ich eine kurze Übung gemacht.“ |
| Tutor `/Warum multipliziert man beim Erweitern/` | falsch: „Fast. Denk daran, was mit dem Wert des Bruchs passiert.“ · richtig (enthält „wert“ oder „gleich“): „Genau – der Wert bleibt gleich, nur die Darstellung ändert sich.“ |
| Check nach der Übung | `wait` (nichts Neues) |
| Chat `/^Erinnere mich morgen um 16 Uhr an Brüche\.$/i` | „Alles klar, ich erinnere dich morgen um 16 Uhr an Brüche.“ + `plan_step` „Brüche üben“, morgen 16:00, verabredet |

Jeder Chat-Satz ohne passende Regel bricht laut ab („no scripted chat answer for …“,
`turns.ts`). Getippt werden muss deshalb **genau** der Satz oben. Andere Wörter oder ein anderer
Tag („Donnerstag“) gehen nicht.

### 6.2 Englisch – vom Spec-Autor zu ergänzen

Vorschlag: `apps/api/src/testing/scenarios/promo-en.ts` mit `scriptPromoEn()`, in
`walkthrough.ts` direkt vor `scriptCoreLoop()` registriert. Gleiche Struktur wie
`scriptCoreLoop()`, nur mit diesen Texten:

**Chat 1** – `when: /maths test on friday about fractions/i`, Zitat `quoteFrom(req, 'a maths test on Friday about fractions')`

- reply: „Great, let's get ready for Friday together. Do you have a worksheet for it? A photo is enough.“
- `plan_exam`: title „Fractions test“, subject „Maths“, subject_kind `math`, day `{ kind: 'weekday', weekday: 5, weeks_ahead: 0 }`, topics [„Fractions“]
- `request_material`: `{ goal: 'new', title: 'Fractions worksheet' }`

**Englisches Blatt (Foto)** – wie `worksheetJpeg()`, aber mit **820×1000 @2x** gerendert. Die App
schickt es dann als 1312×1600, `<image 1312x1600>` nutzt kein anderes Szenario. `photographed()`
hat 800×1000 fest eingebaut, deshalb eine kleine eigene Variante im Promo-Spec:

```html
<body style="font-family: Georgia, serif; padding: 48px; background: #fffef8">
  <h1>Fractions – Worksheet</h1>
  <ol style="font-size: 26px; line-height: 2">
    <li>Simplify 6/8.</li>
    <li>Which fraction is larger: 2/3 or 3/5?</li>
    <li>What is the number below the fraction bar called?</li>
    <li>Why does the value stay the same when you make an equivalent fraction?</li>
  </ol>
</body>
```

**Lesen** – `readingRules.add({ when: /<image 1312x1600>/, system: STUDY_READING, answer: () => DEMO_WORKSHEET_EN })`

- title „Simplifying and comparing fractions“, subject `{ name: 'Maths', kind: 'math' }`
- numeric: „Simplify 6/8 and give the result as a decimal.“ → `0.75` · Thema „Simplifying fractions“ · source_excerpt „Simplify 6/8.“
- multiple_choice: „Which fraction is larger: $\frac{2}{3}$ or $\frac{3}{5}$?“ → choices [`$\frac{2}{3}$`, `$\frac{3}{5}$`], correct 0 · „Comparing fractions“
- short: „What is the number below the fraction bar called?“ → `denominator`, accepted [„the denominator“] · „Key terms“
- long: „Why do you multiply the numerator and the denominator by the same number?“ → „So the value of the fraction stays the same.“ · „Equivalent fractions“, difficulty 3

**Check** – `when: /new material is ready: "Simplifying and comparing fractions"/`: `prepare_practice` wie DE; outreach title „Practice is ready“, body „I made a short practice from your worksheet.“, why „The sheet is read and the test is soon.“

**Tutor** – `when: /Why do you multiply the numerator and the denominator/`; richtig, wenn der Text „value“ oder „same“ enthält

- falsch: „Almost. Think about what happens to the value of the fraction.“ (`verdict: 'incorrect'`, `gave_hint: true`)
- richtig: „Exactly – the value stays the same, only the way it looks changes.“

**Check nach der Übung** – `/^(?=[\s\S]*"Fractions test")(?=[\s\S]*the learner just finished practice)/` → `wait`

**Chat 2** – `when: /^Remind me about fractions tomorrow at 4 ?pm\.$/i`

- reply: „Okay, I'll remind you about fractions tomorrow at 4 pm.“
- `plan_step`: title „Practise fractions“, kind `practice`, day `{ kind: 'in_days', days: 1 }`, time `16:00`, agreed true, quote `quoteFrom(req, 'Remind me about fractions tomorrow at 4 pm.')`, focus_topics [„Fractions“], alle übrigen Felder `null` wie DE

Die festen Texte der Oberfläche kommen von selbst aus `apps/mobile/locales/en` und
`apps/api/src/i18n/en.json` („That's right – well done!“, „Not quite yet“, „Done!“ …).

## 7. Offene Punkte und Unsicherheiten

1. **Veraltete Specs beim Foto:** `core-loop-plan.spec.ts:69`, `redesign-photo-review.spec.ts:17`
   und `redesign-capture.spec.ts` tippen noch auf „Foto machen“. Seit #918 heißt der Button in der
   Karte „Foto hinzufügen“ (`buddy:now.capture_cta`) und öffnet erst das Quellenmenü
   (`HomeBar.tsx:75`, `askAttach({ open: 'menu' })`). Aktuell ist `sendWorksheet()` in
   `coreLoop.ts`, und dem folgt das Skript. Die drei Specs dürften im Gesamtlauf rot sein.
2. **Erinnerung mit erlaubten Benachrichtigungen** ist durch keinen Spec belegt.
   `redesign-chat-text.spec.ts` prüft sie nur bei „aus“. Laut Code (`describe.ts`, `onlyInApp`)
   erscheint der Beleg „Verabredet: Brüche üben morgen, 16:00“ ohne den In-App-Hinweis.
3. **Englische Labels** für Eltern-Seite, Kontaktfrage, Übergabe, Chat und Übung stammen aus
   `locales/en`. Kein Spec hat diese Schritte auf Englisch durchlaufen; `languages.spec.ts` deckt
   nur Welcome, Datenschutz und Profiltitel ab. Ob `getByLabel("Parents' PIN")` trifft, ist aus
   `profile.pin_title` abgeleitet (DE trifft `'PIN der Eltern'`). Dass `locale: 'en-GB'` die
   App-Sprache setzt, ist aus `lib/i18n/index.ts` gelesen, nicht ausprobiert.
4. **Fragenreihenfolge** ist nicht fest. Deshalb erkennt der Spec die Frage, und der Schnitt
   ordnet die Szenen über die Marken.
5. **Länge:** Mit 15–19 Wörtern Sprechtext je Szene wird das Video etwa 65 s lang (§3). Für
   35–45 s müsste die Narration auf ~10 Wörter je Szene oder unter mehrere Szenen gelegt werden.
6. **Video-Schärfe:** Dass `deviceScaleFactor: 2` mit `video.size` 780×1688 echte 2×-Frames
   liefert, ist zu prüfen. Sonst ist das Video 390 px breit und im Rahmen weich.
7. **`pressSequentially`** auf React-Native-Web-Feldern ist im Repo nicht erprobt (siehe §4).
8. Das Datum in Szene 2 hängt vom Aufnahmetag ab: an einem Freitag aufgenommen, steht dort der
   Freitag eine Woche später. Das Bundesland ist auch auf Englisch Pflicht (Vorlauf, im Schnitt
   entfernt).
9. Auf dem Screen stehen App-Texte mit „nicht“ / „not“ („Noch nicht ganz“, „Not quite yet“,
   „Nie abends“). Das sind echte UI-Texte; Overlays und Sprechertext sind positiv formuliert.
