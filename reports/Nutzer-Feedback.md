# LearnBuddy – Nutzer-Feedback aus echter Benutzung (Web-Build, 390×844)

Stand: 27.09.2026, vor den Audit-Fixes (Commit `20e4d27`). Die zehn wichtigsten Screenshots liegen in `nutzer-feedback/`; die übrigen Namen verweisen auf Screenshots, die nicht eingecheckt sind.

## Kurzurteil

LearnBuddy fühlt sich **ruhig, freundlich und erwachsen genug** an. Die Pastell-Optik, der Orb und
die Sprache („Noch nicht ganz“, „Mit etwas Hilfe“, „Die wackligen nochmal üben“, „Selbst gelöst!“)
treffen den DESIGN-BRIEF gut. Nichts wirkt kindisch, nichts wirkt klinisch. Der Kernablauf
(Arbeit nennen → Foto → vorbereitete Übung → Tipps → Zusammenfassung) funktioniert ohne Erklärung.

Die Schwächen liegen **nicht im Look, sondern in drei Dingen**:

1. **Der Startbildschirm wird schnell voll.** Sobald Buddy etwas vorbereitet hat, stapeln sich oben
   Karten, darunter hängt die Zeile mit den Schnellaktionen fest, und für das Gespräch bleiben etwa
   250 px. Lenas eigene Nachricht verschwindet hinter den Karten.
2. **Zahlen, die sich wie Noten anfühlen.** „0 von 1 gleich beim ersten Mal richtig“ direkt nachdem
   Lena eine Hausaufgabe _selbst gelöst_ hat. Außerdem sagen Zusammenfassung und Startkarte
   Gegensätzliches.
3. **Die Eltern sind schlecht informiert.** Sie geben mit der PIN etwas frei, ohne zu sehen _was_.
   Nach der PIN kommt keine Bestätigung. Einen Blick auf „lernt mein Kind?“ gibt es nicht. Ein
   15-Jähriger, der sich allein anmeldet, landet in einer Sackgasse.

## Wie getestet wurde (und was das begrenzt)

- Ich habe den echten Web-Build (`expo export`) gegen die echte API, das echte Schema und den
  echten Scheduler auf lokalem Postgres 16 benutzt. Dazu diente eine **Kopie von
  `apps/api/src/testing/dev-stack.ts` im Scratchpad** mit zwei Ergänzungen:
  - eine **verstellbare Server-Uhr** (`deps.now()` plus Versatz), um „am nächsten Tag“ darzustellen;
  - ein **eigenes Skript für das Modell**, passend zu den Personas.
- Mit Playwright habe ich per Klick durch die App gesteuert (Chromium, 390×844, de-DE, Europe/Berlin).
  Für eine Stichprobe kam 360×740 dazu.
- **Grenzen durch das geskriptete Modell:** Was Buddy im Chat _sagt_, welche Fragen aus dem Foto
  entstehen, welche Tipps es gibt und wie der Tutor bewertet, habe **ich** vorgegeben. Diese Texte
  bewerte ich deshalb nicht als Produktqualität. Bewertet werden die App-Hülle, also Screens,
  Karten, Abläufe, feste Texte, Zustände und die Regeln des Servers. Zwei sichtbare Artefakte meines
  Skripts:
  - Der Tipp „In wie viele Stücke ist der Kuchen geteilt?“ taucht an unpassender Stelle auf
    (`p2-18`, `p5-27`).
  - Bei „buyed“ im Probetest wertete mein Skript die Antwort als „kein Versuch“ (`p5-22-test-0`).
    Ein echtes Modell würde sie als falsche Antwort notieren.
- **Grenze bei der Uhr:** Nur die Server-Uhr wurde verstellt. Mit verstellter Browser-Uhr hält die
  Dev-Anmeldung ihre Tokens für abgelaufen. Mit echtem Supabase dürfte das anders sein.
- **Grenze bei der Anmeldung:** Der Dev-Auth-Server verbraucht Refresh-Tokens. Deshalb musste
  „Lena am nächsten Tag“ sich neu anmelden (`p3-00-login`). Mit echtem Supabase passiert das
  vermutlich nicht.
- Push, echte Kamera, Sprache (Mikro) und Biometrie waren nicht testbar.

Legende in den Erzählungen:

- **[gesehen]** – so in der App erlebt, Screenshot vorhanden.
- **[vermutet]** – Einschätzung, wie die Person reagieren würde, oder Verhalten, das ich nicht
  direkt beobachten konnte.

---

## Persona 1 – Mutter richtet die App für Lena (12, Klasse 6) ein

**Erster Eindruck** (`p1-01-welcome`)

- [gesehen] Ruhiger Einstieg mit Orb, klarer Überschrift und einem großen Button.
- [gesehen] Der Hinweis „Unter 16? Dann richten deine Eltern das Konto für dich ein“ steht
  sichtbar, aber freundlich da. Gut.

**Datenschutz** (`p1-03-consent`)

- [gesehen] Sechs kurze Punkte in klarer Sprache, z. B. „Fotos löschen wir spätestens 7 Tage …“.
  Das schafft Vertrauen.
- [gesehen] Der Text duzt („was du Buddy erzählst“). Er richtet sich also an das Kind, obwohl hier
  die Mutter liest und einwilligt.
- [gesehen] Es gibt keinen Link zur vollständigen Datenschutzerklärung.
- [vermutet] Eine vorsichtige Mutter sucht genau diesen Link, und sei es nur, um zu sehen, dass es
  ihn gibt.

**Wer lernt?** (`p1-04-who`, `p1-06-child-filled`)

- [gesehen] „Ich selbst“ oder „Mein Kind“, danach Spitzname, Geburtsdatum und Sprache.
- [gesehen] Eine **Klassenstufe wird nicht abgefragt.** Buddy weiß also nicht, dass Lena in
  Klasse 6 ist.
- [vermutet] Die Mutter würde „Klasse“ erwarten. Das Alter allein sagt wenig über den Stoff.
- [gesehen] Die Felder TT/MM/JJJJ haben nur Platzhalter. Sind sie ausgefüllt, sieht man nicht mehr,
  welches Feld Tag und welches Monat ist.

**Eltern-Schritt** (`p1-07-parent-step`, `p1-08-parent-pin-filled`)

- [gesehen] Einwilligung nach DSGVO Art. 8 und PIN in einem Schritt, knapp und verständlich.
- [gesehen] Die beiden PIN-Felder sehen gleich aus („••••“). Man sieht nicht, dass das zweite zum
  Wiederholen ist.
- [gesehen] Es fehlt ein Hinweis, was passiert, wenn man die PIN vergisst.
- [vermutet] Die Mutter fragt sich: „Und wenn ich die vergesse?“

**Übergabe** ([p1-09-handover-home](nutzer-feedback/p1-09-handover-home.png))

- [gesehen] Nach „Los geht's“ steht sofort „Hallo Lena“ da, mit dem Orb in der Mitte und fünf
  Aktionen im Kreis.
- [gesehen] Es gibt **keinen Übergabe-Moment**: kein „Fertig! Gib Lena jetzt das Handy“ und keine
  Zusammenfassung wie „Nachrichten aufs Handy: aus · PIN gesetzt“.
- [vermutet] Die Mutter ist unsicher, ob alles eingerichtet ist.

**Später: PIN für „aufs Handy schreiben“** ([p3-02-parent-pin](nutzer-feedback/p3-02-parent-pin.png), `p3-03-after-pin`)

- [gesehen] Lena tippt „Eltern fragen“. Es erscheint ein schönes PIN-Feld: „Das dürfen nur deine
  Eltern erlauben. Gib ihnen kurz das Handy.“
- [gesehen] Die Mutter sieht aber **nicht, was sie erlaubt**: wann Buddy schreibt, wie oft, und
  dass es nie abends ist.
- [gesehen] Diesen Text gibt es in der App durchaus. Jonas (16+) bekommt ihn auf seiner Karte
  angezeigt ([p5-09-exam](nutzer-feedback/p5-09-exam.png): „Höchstens einmal am Tag und nie abends.“). Lena bekommt nur „Das
  müssen deine Eltern erlauben.“
- [gesehen] Nach der richtigen PIN verschwindet die Karte einfach. Es kommt **keine Bestätigung**.

**Elternbereich** (`p3-18-settings`, `p4-04-parents-area`, `p4-01-settings-contact-open`)

- [gesehen] „Für Eltern“ ist als geschlossene Gruppe klar abgesetzt, gut.
- [gesehen] Die Gruppe öffnet sich ohne PIN. Einzelne Aktionen (E-Mail ändern und Ähnliches)
  verlangen dann die PIN.
- [gesehen] Lena sieht dadurch die E-Mail der Mutter und „Abmelden“.
- [gesehen] Laut Code (`components/settings/AdultSection.tsx`) braucht „Abmelden“ keine PIN.
- [vermutet] Meldet sich Lena ab, kommt sie ohne das Passwort der Mutter nicht wieder hinein.
- [gesehen] Einen **Blick auf den Lernfortschritt** („lernt mein Kind?“, Frage 7 im DESIGN-BRIEF)
  gibt es für Eltern nirgends.

---

## Persona 2 – Lena, erster Nachmittag

**Start** (`p2-01-home`)

- [gesehen] Der Startbildschirm ist aufgeräumt und einladend. Der Orb im Kreis der fünf Aktionen
  ist ein kleiner Wow-Moment und nicht kindisch.
- [vermutet] Das Kopfhörer-Symbol oben links (= „Mit Buddy sprechen“) versteht eine 12-Jährige
  nicht als „reden“.

**„Arbeit“ antippen** (`p2-02-tap-arbeit`)

- [gesehen] Ein Tipp schickt sofort „Ich schreibe bald eine Arbeit“ in den Chat, ohne Formular.
  Das passt zu den UX-PRINCIPLES.
- [gesehen] Danach **springt das Layout um**: Der große Orb verschwindet, die Aktionen schrumpfen
  zu einer kleinen Zeile oben.
- [gesehen] „Erklär mir was“ stößt rechts an den Rand. Bei 360 px bricht die Beschriftung um
  (`p6-01-lena-home-360`).
- [gesehen] Die Beschriftungen sind sehr klein, etwa 11 px.

**Arbeit eintragen** (`p2-03-hallo`, [p2-04-exam-planned](nutzer-feedback/p2-04-exam-planned.png))

- [gesehen] Lena schreibt „Am Donnerstag schreiben wir eine Mathearbeit über Brüche“. Buddy trägt
  die Arbeit ein und zeigt „✓ Eingetragen: Mathearbeit Brüche am Donnerstag, 1. Oktober ·
  Rückgängig“. Das ist konkret, vertrauenswürdig und korrigierbar.
- [gesehen] Gleichzeitig erscheinen **oben zwei große Karten**: „Schick mir ein Foto“ und „Darf ich
  dir aufs Handy schreiben?“. Beide haben einen violetten Hauptbutton.
- [gesehen] Darunter stehen „Hallo Lena“ und die Aktionszeile. Das Gespräch schrumpft auf ein
  kleines Fenster, **Lenas eigene Nachricht ist abgeschnitten.**
- [gesehen] Die zweite Bestätigung „✓ Um ein Foto gebeten: Arbeitsblatt Brüche · Rückgängig“ ist
  Systemsprache. Eine „Bitte“ rückgängig zu machen ergibt aus ihrer Sicht keinen Sinn.
- [gesehen] Die Aktion „Arbeit“ heißt plötzlich „Probetest“ und hat ein anderes Symbol.
- [vermutet] Lena sucht „Arbeit“ und wundert sich.

**Foto** (`p2-05-capture-empty`, [p2-06-capture-blurry](nutzer-feedback/p2-06-capture-blurry.png), `p2-07-capture-sharp`)

- [gesehen] Die Aufnahme ist sehr gut gemacht. „Tipp: Ganze Seite, gutes Licht, von oben“ steht da,
  und die 7-Tage-Löschung wird genannt.
- [gesehen] Beim verwackelten Foto kommt freundliches Coaching („Halt das Handy ruhig …“) mit
  „Neu fotografieren“ als Hauptaktion. Das entspricht dem Brief genau.
- [gesehen] Das saubere Blatt aus den Fixtures (800×1080) wurde als „sehr klein“ und „Schwer
  lesbar“ markiert, obwohl es gut lesbar ist.
- [vermutet] Blätter, die Lehrkräfte per Messenger schicken, lösen diese Warnung oft aus. Lena
  schickt dann trotzdem oder bricht verunsichert ab.

**Warten** (`p2-08-after-send`, `p2-09-reading`)

- [gesehen] Zwei Karten übereinander: „Ich lese dein Blatt … Das dauert meist etwa eine Minute“ und
  „Ich mache aus deinem Blatt gerade Übungen …“. Das ist doppelt.
- [gesehen] Das Foto selbst taucht im Chat nicht auf.
- [vermutet] Lena fragt sich, ob das Foto angekommen ist.

**Übung bereit** (`p2-10-prepared`)

- [gesehen] „Übung bereit: Mathearbeit Brüche · 5 Aufgaben · ca. 5 Min. · Jetzt üben / Heute
  nicht“. Klar und kurz. Genau das Versprechen des Produkts.
- [gesehen] Die Karte zum Handy-Schreiben steht weiterhin darunter, obwohl Lena sie nicht beachtet.

**Üben mit Fehlern und Tipps** (`p2-11-practice-q1` bis `p2-22-q-erweitern`)

- [gesehen] Die Frage steht oben fest, die Brüche sind schön gesetzt, die Mathe-Tasten liegen über
  dem Eingabefeld. Visuell sehr ruhig.
- [gesehen] Bei einer falschen Antwort („2/6“) erscheint die Plakette „Noch nicht ganz“ und darunter
  der nächste Tipp als Buddy-Nachricht (`p2-16`). Das fühlt sich nicht nach „Falsch!“ an.
- [gesehen] Beim Tippfehler „nener“ kommt „Fast – so schreibt man es: Nenner. Tipp es nochmal.“
  (`p2-20`). Sehr gut.
- [gesehen] „Lösung zeigen“ ist ab der ersten Sekunde gleichwertig neben „Tipp“ sichtbar.
- [vermutet] Eine 12-Jährige tippt bei Unlust sofort darauf. Der Brief sieht die Auflösung erst
  nach zwei Tipps vor.
- [gesehen] „Frage passt nicht“ steht oben rechts auffällig neben dem Fortschritt.
- [vermutet] Das wird als Ausweg zum Überspringen benutzt.
- [gesehen] Multiple Choice mit zwei Optionen: Nach einem Fehlversuch bleibt nur eine Option übrig
  (`p2-13`). Der Klick darauf ist dann kein Lernen mehr, zählt aber als „Richtig“.
- [gesehen] Nach dem richtigen Ergebnis steht zusätzlich eine grüne Karte „Lösung: 3/4“. Das ist
  doppelt, schadet aber nicht.
- [gesehen] Die Fortschrittsleiste ist nach Frage 1 noch leer und füllt sich erst nach „Weiter“.

**Zusammenfassung** ([p2-23-summary](nutzer-feedback/p2-23-summary.png), `p2-24-back-home`)

- [gesehen] „Geschafft!“ mit Orb, „Sitzt: …“ und „Schauen wir nochmal an: …“. Dazu kommt der
  Button „Die wackligen nochmal üben“. Ein schöner, ruhiger Abschluss.
- [gesehen] Die großen Zahlen („5 Beantwortet · 2 Auf Anhieb richtig“) wirken wie eine Note.
- [gesehen] **Widerspruch 1:** In der Zusammenfassung steht „Begriffe“ unter „nochmal ansehen“, auf
  der Startkarte kurz danach unter „Das sitzt“.
- [gesehen] Auslöser war ein Tippfehler („nener“), der nicht als „auf Anhieb“ zählt.

**Gefühl mitteilen** (`p2-25-remember`)

- [gesehen] „Brüche addieren find ich echt schwer“ führt zu „✓ Gemerkt: Findet Brüche addieren
  schwer · Rückgängig“. Der Eintrag erscheint auch unter „Was Buddy über dich weiß“
  (`p3-17-memory`), mit Ändern und Entfernen.
- [gesehen] Das ist transparent und wirkt respektvoll.

---

## Persona 2b – Lena am nächsten Tag (Server-Uhr +32,5 h, Montag ca. 16 Uhr)

**Wiederkommen** (`p3-01-next-day-home`)

- [gesehen] Oben steht „Übung bereit … Vor allem: Brüche addieren“. Buddy hat von selbst
  vorbereitet und die Sorge von gestern aufgegriffen. Das ist der Kern des Versprechens und fühlt
  sich gut an.
  - Einschränkung: Dass Buddy handelt, kam aus meinem Skript. Karte und Darstellung sind echt.
- [gesehen] Es gibt **keinen Tagesgruß** und keinen „Neuer Tag“-Trenner. Das Gespräch von gestern
  steht einfach weiter da.
- [vermutet] Lena empfindet den Chat als „alt“.

**Hausaufgabe** (`p3-04-homework-sheet` bis `p3-09-homework-done`)

- [gesehen] Das Sheet „Hilfe bei Hausaufgaben – Ich gebe dir Tipps, die Lösung findest du selbst“
  mit „fotografieren / eintippen“ ist klar.
- [gesehen] Im Hausaufgaben-Modus gibt es **keinen Tipp-Button** (Code:
  `givesHints()` in `apps/api/src/modules/practice/service.ts` nur für practice/explain).
- [gesehen] Lena muss also erst etwas Falsches oder „keine Ahnung“ tippen, um den versprochenen
  Tipp zu bekommen.
- [gesehen] Nach dem Lösen erscheint „Selbst gelöst! Das hast du allein herausgefunden.“ Toll.
- [gesehen] Direkt danach kommt der Abschluss-Screen mit einer großen **„0 · Auf Anhieb richtig“**.
- [gesehen] Die Startkarte sagt danach „Geschafft! **0 von 1** gleich beim ersten Mal richtig.“
  ([p3-10-explain-offer](nutzer-feedback/p3-10-explain-offer.png)).
- [vermutet] Das ist der Moment, in dem sich Lena bewertet statt begleitet fühlt.
- [gesehen] **Die vorbereitete Übung für Donnerstag ist weg.** Die Ergebniskarte verdrängt sie. Der
  Server zeigt nur eine Karte, und das Ergebnis hat 30 Minuten Vorrang
  (`apps/api/src/modules/buddy/home.ts`).
- [gesehen] Die Übung existiert noch (Zustand `prepared` in der DB), ist aber nicht sichtbar.

**Erklären** ([p3-10-explain-offer](nutzer-feedback/p3-10-explain-offer.png), `p3-11-explain-intro`)

- [gesehen] Buddy antwortet mit einer Karte „Erklär mir was · Brüche erweitern · Los geht's“.
- [gesehen] Die Erklärung ist kurz, mit Formelsatz und „Verstanden – frag mich!“. Sehr gut.
- [gesehen] Nach „Übung beenden“ steht die alte „Los geht's“-Karte weiter im Chat (`p3-13`).
  Unklar, ob sie neu startet oder fortsetzt.

**Menü, Mein Stoff, Gedächtnis, Verlauf** (`p3-14-menu`, `p3-15-mein-stoff`,
`p3-16-material`, `p3-17-memory`, `p3-20-history`)

- [gesehen] Das Menü hat drei klare Einträge.
- [gesehen] „Mein Stoff“ ist schlicht (Fach → Blatt → Üben / Fragen ansehen / Löschen). Die Fragen
  tragen Plaketten wie „Auf Anhieb gewusst“ und „Mit etwas Hilfe“, schön formuliert.
- [gesehen] Die **Arbeit am Donnerstag** ist außer im Chatverlauf nirgends zu sehen. In „Mein Stoff“
  hängt das Blatt nicht an der Arbeit, und es gibt keinen kleinen Hinweis „Mathe-Arbeit Do“.
- [vermutet] Lena fragt: „Wo sehe ich, was ansteht?“ Der Brief erlaubt dafür ausdrücklich einen
  kleinen Chip „Test in 3 Tagen“.
- [gesehen] Der Button „Löschen“ steht in „Mein Stoff“ gleichwertig neben „Üben“.

---

## Persona 3 – Jonas (15) richtet die App selbst ein

**Sackgasse** (`p5-01-self-empty`, [p5-02-self-15](nutzer-feedback/p5-02-self-15.png))

- [gesehen] Jonas hat schon E-Mail und Passwort vergeben und dem Datenschutz zugestimmt. Er wählt
  „Ich selbst“ und gibt 2010 ein.
- [gesehen] Darauf erscheint in Rot: „Unter 16 kannst du das Konto nicht selbst einrichten. Bitte
  frag deine Eltern.“ „Los geht's“ bleibt grau.
- [gesehen] Es gibt keinen Weg weiter: keinen Button „Eltern sind da“ und keine Erklärung, was mit
  dem schon angelegten Konto passiert.
- [gesehen] Die Altersprüfung kommt erst **nach** der Kontoanlage. Der Brief sieht sie **vor** der
  E-Mail vor.

**Was er stattdessen tut** (`p5-06-teen-sees-parent-step`, `p5-07-teen-lies-2009`)

- [gesehen] Unter „Mein Kind“ könnte er die Eltern-Checkbox selbst setzen und eine PIN wählen.
- [gesehen] Unter „Ich selbst“ mit Geburtsjahr 2009 kommt er ohne jede Hürde durch.
- [vermutet] Genau das machen viele 15-Jährige. Danach hat er ein Erwachsenenprofil, und alle
  Schutzregeln für Minderjährige greifen nicht.
- [vermutet] Ein Übergabe-Weg („Hol kurz Mama/Papa – 1 Minute“) mit Eltern-Schritt auf _seinem_
  Handy würde das Lügen seltener machen.

**Benutzung als „16-Jähriger“** (`p5-08-home` bis `p5-30-settings-own-area`)

- [gesehen] Der Startbildschirm ist identisch mit dem der 12-jährigen Lena. Für 15 ist das okay,
  nichts wirkt kindisch.
- [gesehen] Der Brief wünscht mit dem Alter etwas mehr Dichte. Das ist hier nicht zu sehen.
- [gesehen] „Wir schreiben Dienstag Englisch, simple past“ führt zu „✓ Eingetragen … Dienstag, 29. September“ und einer Karte „Probetest · Simple Past · Los geht's“.
- [gesehen] Die Handy-Karte erklärt hier gut: „Höchstens einmal am Tag und nie abends.“
- [gesehen] Probetest (`p5-10-test-q1`, `p5-23-test-result`): „Eine Antwort pro Frage,
  keine Tipps. Das Ergebnis siehst du am Ende.“ Das ist klar.
- [gesehen] Jede Frage braucht zwei Taps (Antwort, dann „Weiter“).
- [gesehen] Der Titel ist abgeschnitten („Simple Past – Prob…“).
- [gesehen] Im Ergebnis steht „**3** Beantwortet“, obwohl eine Frage übersprungen wurde.
- [gesehen] **Widerspruch 2:** Die Startkarte zeigt „Das sitzt: Irregular verbs“ und zugleich „Da
  üben wir nochmal: Irregular verbs“ ([p5-24-no-mood](nutzer-feedback/p5-24-no-mood.png)).
- [gesehen] Das Wiederaufnehmen klappt gut: „Weiter mit deinem Probetest – noch 2 Aufgaben ·
  Weitermachen“ (`p5-20b-reopen.png`).
- [gesehen] „keine lust mehr, will zocken“ wird ohne Vorwurf beantwortet und mit einem kleinen
  Angebot (5 Minuten). Die Antwort selbst stammt aus meinem Skript, die Karte ist echt.
- [gesehen] Pythagoras-Erklärung (`p5-26`, `p5-28-pythagoras-right`): Formelsatz, Einheit „cm“
  im Eingabefeld und „Erklärung nochmal lesen“. Das wirkt für einen 15-Jährigen ernsthaft und
  nicht verspielt.

---

## Priorisierte Verbesserungen

Jeder Punkt nennt: **Was** ist zu tun, **Warum** aus Nutzersicht, **Wo** in der App, und ob es
gesehen [G] oder vermutet [V] ist.

### P1 – vor echten Nutzern

1. **Keine Trefferquote nach Hausaufgaben und kleinen Runden.** [G]
   - Was: Bei `help` (Hausaufgabe) weder „Auf Anhieb richtig“ noch „x von y“ zeigen, sondern nur
     „Selbst gelöst“. Allgemein die Zahl „Auf Anhieb richtig“ nicht als große Kachel darstellen,
     und nie eine „0“ zeigen.
   - Warum: „0 von 1“ direkt nach „Selbst gelöst!“ widerspricht sich und fühlt sich wie eine Note
     an. Der Brief verlangt „Encouraging without being fake“ und keine Zahlen mit Verpflichtung.
   - Wo: `apps/mobile/components/practice/SessionSummary.tsx`; Startkarte
     `components/buddy/NowCard.tsx` mit `buddy.json › result_body`; Daten aus
     `apps/api/src/modules/buddy/home.ts` (`practice_result`).
2. **Ergebniskarte darf die vorbereitete Übung nicht verdecken.** [G]
   - Was: Nach einer Sitzung zeigt die Ergebniskarte „Als Nächstes: Übung für Donnerstag · Jetzt
     üben“. Alternativ bekommt die vorbereitete Übung Vorrang, wenn die beendete Sitzung nichts mit
     ihr zu tun hat.
   - Warum: Lena macht kurz Hausaufgaben, danach ist „Übung bereit für die Arbeit“ für 30 Minuten
     unsichtbar. Das Kernversprechen verschwindet.
   - Wo: `apps/api/src/modules/buddy/home.ts` (Reihenfolge `justFinished` vor `prepared`);
     `components/buddy/NowCard.tsx`.
3. **„Sitzt“ und „Nochmal“ dürfen sich nicht widersprechen.** [G]
   - Was: Die Einteilung der Themen in sicher und wacklig einmal im Server berechnen. Zusammenfassung
     und Startkarte nutzen dieselbe Liste, und ein Thema steht nie in beiden.
   - Warum: „Das sitzt: Irregular verbs“ neben „Da üben wir nochmal: Irregular verbs“ (Jonas).
     „Begriffe“ wechselt zwischen den Listen (Lena). Das untergräbt das Vertrauen in Buddys Urteil.
   - Wo: `components/practice/SessionSummary.tsx`, `components/buddy/NowCard.tsx`, Berechnung von
     `secure_topics`/`shaky_topics` in `apps/api/src/modules/practice/service.ts`.
4. **PIN-Freigabe muss sagen, was erlaubt wird, und es danach bestätigen.** [G]
   - Was:
     - Vorher: Der Text `optin_body` („kurz vor einer Arbeit … höchstens einmal am Tag, nie
       abends“) steht auch auf der Karte für Minderjährige und auf dem PIN-Screen.
     - Nachher: eine Bestätigung wie „Erlaubt. Buddy schreibt Lena höchstens 1× am Tag, nie abends.
       Ändern unter Einstellungen.“
   - Warum: Die Mutter tippt die PIN, ohne zu wissen wofür, und sieht danach nichts.
   - Wo: `locales/de/buddy.json › optin_minor_body`; Karte in `components/buddy/DecisionCard.tsx`;
     `app/pin.tsx` mit `locales/de/auth.json` (Zeile 62); Toast über `components/lb/Toast.tsx`.
5. **Unter-16-Sackgasse auflösen und das Alter zuerst fragen.** [G]
   - Was: Das Geburtsdatum vor E-Mail und Passwort abfragen, wie im Brief unter Onboarding 1–2.
     Unter 16 gibt es einen Button „Erwachsene Person ist hier“, der direkt zum Eltern-Schritt auf
     demselben Handy führt. Das schon angelegte Konto nicht verwaist zurücklassen.
   - Warum: Jonas steht mit rotem Text und grauem Button da. Die naheliegende Lösung ist, sich
     älter zu machen, und dann greift kein Jugendschutz.
   - Wo: `app/welcome.tsx`, `app/profile.tsx`, `locales/de/auth.json`.
6. **Startbildschirm: Platz für das Gespräch.** [G]
   - Was:
     - Höchstens **eine** Karte oben. Die Handy-Frage nach „Lieber nicht“ oder nach einmaligem
       Ignorieren einklappen oder später stellen.
     - Die Aktionszeile im Gespräch ausblenden, sobald Karten da sind, oder in den Composer legen
       (z. B. ein „+“).
     - Eigene Nachrichten nie hinter Karten verschwinden lassen.
   - Warum: In `p2-04`, `p2-08` und `p3-01` bleiben etwa 250 px Chat. Zwei violette Hauptbuttons
     konkurrieren. Nach UX-PRINCIPLES §32 hat jeder Screen einen Zweck.
   - Wo: `app/buddy.tsx`, `components/buddy/NowCard.tsx`, `components/buddy/DecisionCard.tsx`,
     `components/lb/StartRow.tsx` und `OrbitMenu.tsx`.

### P2 – bald

7. **Tipp-Button auch bei Hausaufgaben.** [G]
   - Was: Im `help`-Modus einen „Tipp“-Button zeigen, der den Tutor um einen Hinweis bittet (ohne
     Lösung).
   - Warum: Das Sheet verspricht „Ich gebe dir Tipps“. Sie bekommt aber erst einen, wenn sie etwas
     Falsches oder „keine Ahnung“ tippt.
   - Wo: `givesHints()` in `apps/api/src/modules/practice/service.ts`; `app/practice/[id].tsx`
     (`hint_available`).
8. **„Lösung zeigen“ erst nach Versuch oder Tipp.** [G/V]
   - Was: „Lösung zeigen“ erst nach mindestens einem Versuch oder Tipp einblenden, oder als
     sekundären Textlink nach dem 2. Tipp.
   - Warum: Der Brief sagt „Nach zwei Tipps wird die Antwort gezeigt“. Sofort sichtbar lädt es
     12-Jährige zum Abkürzen ein [V].
   - Wo: `components/practice/AnswerComposer.tsx`, `components/practice/ChoiceList.tsx`.
9. **Multiple Choice mit zwei Optionen nach Fehlversuch.** [G]
   - Was: Nach dem ersten Fehler nicht „die einzig übrige“ tippen lassen. Stattdessen die Lösung mit
     Begründung zeigen (oder um ein „Warum?“ bitten). Das nicht als richtig zählen.
   - Warum: Das Tippen ist kein Lernen und verfälscht „Sitzt“.
   - Wo: `components/practice/ChoiceList.tsx`, Bewertung in `apps/api/src/modules/practice/service.ts`.
10. **Übergabe-Moment nach dem Einrichten.** [G]
    - Was: Ein kurzer Screen „Fertig – das ist eingestellt: Nachrichten aufs Handy aus · PIN
      gesetzt · Datenschutz. Jetzt Lena das Handy geben.“
    - Warum: Die Mutter weiß nicht, ob sie fertig ist, und Lena nicht, dass sie „dran“ ist.
    - Wo: `app/profile.tsx` → `app/buddy.tsx`.
11. **Klassenstufe im Profil.** [G]
    - Was: Ein optionales Auswahlfeld „Klasse“ mit Chips 4–13 / Studium / Beruf. Buddy kennt sie
      sonst nur über `set_level` aus dem Chat.
    - Warum: Die Mutter erwartet das. Stoff und Ton hängen daran (Brief: Klasse 4 bis
      Erwachsenenbildung).
    - Wo: `app/profile.tsx`.
12. **Anstehende Arbeit sichtbar machen (klein).** [G]
    - Was: Ein ruhiger Chip „Mathe-Arbeit · Do“ beim Fach in „Mein Stoff“, oder unter dem Gruß.
      Keine Zählung.
    - Warum: Außer im Chatverlauf gibt es keinen Ort dafür. Der Brief erlaubt ausdrücklich „Test in
      3 Tagen“.
    - Wo: `app/library.tsx`, `components/library/MaterialCard.tsx`, `app/buddy.tsx`.
13. **Elternbereich hinter die PIN.** [G/V]
    - Was: „Für Eltern · Öffnen“ verlangt bei Minderjährigen gleich die PIN, zumindest für
      „Abmelden“ und die Anzeige der E-Mail.
    - Warum: Lena sieht die E-Mail der Mutter und kann sich abmelden, danach kommt sie nicht mehr
      hinein [V]. Der Brief sagt: „Admin surface is always gated“.
    - Wo: `components/settings/AdultSection.tsx`, `adultGate.tsx`, `app/settings.tsx`.

### P3 – Feinschliff

14. **Aktions-Bestätigungen in Lena-Sprache.** [G] „Um ein Foto gebeten: … · Rückgängig“ weglassen
    oder ersetzen durch „Ich warte auf dein Foto“, ohne Rückgängig.
    - Wo: `locales/de/buddy.json › action.request_material`, `components/buddy/describe.ts`,
      `NoticeBubble.tsx`.
15. **Eine statt zwei Wartekarten; Foto im Chat zeigen.** [G] „Ich lese dein Blatt …“ und „Ich mache
    Übungen …“ zu einer Karte mit Fortschritt zusammenlegen, mit einem Vorschaubild des Fotos.
    - Wo: `components/buddy/WorkingNote.tsx`, `NowCard.tsx`, `Conversation.tsx`.
16. **Warnung „sehr klein“ weniger streng.** [G/V] Ein gut lesbares Bild mit 800×1080 bekommt
    „Schwer lesbar“. Die Schwelle an der Lesbarkeit der Schrift messen, nicht an der Pixelzahl.
    - Wo: `apps/mobile/lib/photo/`, `components/capture/PhotoCheckCard.tsx`.
17. **Schnellaktionen lesbarer.** [G] Etwa 11 px Beschriftung, „Erklär mir was“ am Rand bzw.
    umbrochen (360 px). Das Umbenennen „Arbeit“ → „Probetest“ irritiert.
    - Wo: `components/lb/StartRow.tsx`, `OrbitMenu.tsx`.
18. **Kopfhörer-Symbol erklären.** [V] Für „Mit Buddy sprechen“ lieber eine Sprechblase oder
    Welle mit kurzem Label beim ersten Mal.
    - Wo: `app/buddy.tsx`.
19. **Datenschutz-Screen für Eltern.** [G] Bei „Mein Kind“ die Eltern ansprechen („was Ihr Kind
    Buddy erzählt“ bzw. „dein Kind“) und einen Link „Vollständige Datenschutzerklärung“ ergänzen.
    - Wo: `app/consent.tsx`, `locales/de/auth.json`.
20. **PIN-Felder beschriften.** [G] Die Labels „PIN“ und „PIN wiederholen“ sichtbar lassen, einen
    Hinweis „PIN vergessen? → per E-Mail zurücksetzen“ ergänzen. Datumsfelder mit sichtbaren
    Labels.
    - Wo: `app/profile.tsx`, `components/settings/PinCard.tsx`.
21. **Probetest flüssiger.** [G] Nach „Notiert“ automatisch weiter. „Beantwortet“ ohne
    übersprungene Fragen zählen. Den Titel nicht abschneiden.
    - Wo: `app/practice/[id].tsx`, `SessionSummary.tsx`.
22. **Neuer Tag im Chat.** [G/V] Ein dezenter Trenner „Montag“ oder ein Gruß beim Wiederkommen,
    ohne Hinweis auf verpasste Tage.
    - Wo: `components/buddy/Conversation.tsx`.

---

## Was begeistert (bitte so lassen)

- Die Tonalität der festen Texte: „Noch nicht ganz“, „Fast – so schreibt man es“, „Mit etwas
  Hilfe“, „Die wackligen nochmal üben“, „Selbst gelöst!“.
- „✓ Eingetragen: … am Donnerstag, 1. Oktober · Rückgängig“: konkret, prüfbar, korrigierbar.
- Das Foto-Coaching mit „Neu fotografieren“.
- Das Weitermachen nach einer Unterbrechung.
- Die Erklärkarte mit „Verstanden – frag mich!“.
- Formelsatz und Brüche.
- „Was Buddy über dich weiß“ mit Zitat, Ändern und Entfernen.

## Die besten Screenshots

| Datei                                                                  | Warum                                                                  |
| ---------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| [p1-09-handover-home](nutzer-feedback/p1-09-handover-home.png)         | Erster Eindruck des Startbildschirms: ruhig, schön                     |
| [p2-04-exam-planned](nutzer-feedback/p2-04-exam-planned.png)           | Überfüllter Start, Chat verdrängt                                      |
| [p2-16-q-addieren-wrong1](nutzer-feedback/p2-16-q-addieren-wrong1.png) | Fehler mit Tipp: der Ton stimmt                                        |
| [p2-23-summary](nutzer-feedback/p2-23-summary.png)                     | Schöner Abschluss, aber Zahlen wie eine Note                           |
| [p3-02-parent-pin](nutzer-feedback/p3-02-parent-pin.png)               | PIN ohne „was wird erlaubt“                                            |
| [p3-10-explain-offer](nutzer-feedback/p3-10-explain-offer.png)         | „0 von 1 gleich beim ersten Mal richtig“; vorbereitete Übung verdrängt |
| [p5-02-self-15](nutzer-feedback/p5-02-self-15.png)                     | Sackgasse für 15-Jährige                                               |
| [p5-09-exam](nutzer-feedback/p5-09-exam.png)                           | Gute Opt-in-Erklärung, die Minderjährige nicht bekommen                |
| [p5-24-no-mood](nutzer-feedback/p5-24-no-mood.png)                     | Widerspruch „sitzt“ / „nochmal“                                        |
| [p2-06-capture-blurry](nutzer-feedback/p2-06-capture-blurry.png)       | Vorbildliches Foto-Coaching                                            |

Alle Screenshots und Skripte liegen im selben Ordner: `p1*.mjs` bis `p6.mjs`, `lib.mjs`, und
`stack/` (Kopie des Dev-Stacks mit Uhr und Persona-Skript).
