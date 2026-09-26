# Lena-Durchlauf – Protokoll

Lauf 1 von 2, vollständig (vor den zwei Korrekturen). Danach: die korrigierten Szenarien und die Geschichte bis in die Hilfe-Sitzung. Zusammenfassung: `reports/Lena-Durchlauf.md`.

**66/67 Prüfungen** · chat: Median 1965 ms, max 5077 ms (16×) · prepare: Median 4127 ms, max 7218 ms (8×) · answer: Median 14 ms, max 1203 ms (41×) · photo → ready: Median 7902 ms, max 7902 ms (2×)

## Morgen Vokabeltest Französisch

_Lena #1 · alt 1.1 · 8/8 Prüfungen_

- **Lena:** morgen vokabeltest franz unité 3
- **Buddy** (2925 ms; plan_exam, request_material): Ich habe deinen Französisch-Vokabeltest für morgen eingetragen! Hast du ein Foto von der Vokabelliste aus Unité 3, damit wir zusammen üben können?
  - _getan:_ {"tool":"plan_exam","title":"Vokabeltest Französisch Unité 3","due_date":"2026-09-29","subject_name":"Französisch"} {"tool":"request_material","title":"Vokabeln Unité 3",}
    ✓ Buddy trägt den Test für morgen ein
- _startet „vocab“:_ le chien - der Hund / la maison - das Haus / le chat - die Katze / l’école - die Schule / un ami - der Freund / la fenêtre - das Fenster
  → 12 Fragen (3787 ms)
  ✓ Vokabeln abgefragt, auch in beide Richtungen
- _Frage (vocab):_ le chien — _Lösung:_ der Hund
  - **Lena:** der Hund
  - **Buddy** [correct, 20 ms, correct]: Stimmt – gut gemacht!
    ✓ richtig: correct
- _Frage (vocab):_ la maison — _Lösung:_ das Haus
  - **Lena:** Haus
  - **Buddy** [partially_correct, 12 ms, open]: Fast – da fehlt noch ein Wort. Schau nochmal genau hin.
    ✓ ohne Artikel: partially_correct
- _Frage (vocab):_ le chat — _Lösung:_ die Katze
  - **Lena:** die Katz
  - **Buddy** [partially_correct, 13 ms, open]: Fast – so schreibt man es: die Katze. Tipp es nochmal.
    ✓ Tippfehler: partially_correct
- _Frage (vocab):_ l’école — _Lösung:_ die Schule
  - **Lena:** ähm keine ahnung
  - **Buddy** [not_an_attempt, 1097 ms, open]: Kein Problem, wir lernen das zusammen! Überlege mal: Welches Wort im Deutschen klingt ähnlich wie "école" und ist der Ort, an dem man lernt?
    ✓ „keine ahnung“: not_an_attempt
- _Frage (vocab):_ un ami — _Lösung:_ der Freund
  - **Lena:** la voiture
  - **Buddy** [incorrect, 1146 ms, open]: "La voiture" heißt "das Auto". Gesucht ist die deutsche Übersetzung für das französische Wort "un ami". Weißt du, was "un ami" bedeutet?
    ✓ falsches Wort: incorrect
    ✓ falsches Wort: verrät die Lösung nicht

## „Ich check den Dativ nicht“

_Lena #2 · alt 1.6 · 6/6 Prüfungen_

- **Lena:** ich check den dativ nicht
- **Buddy** (1448 ms; offer_learning): Ich kann dir den Dativ ganz einfach und Schritt für Schritt erklären. Klicke einfach unten, um zu starten!
  - _getan:_ {"kind":"explain","text":"Dativ","tool":"offer_learning"}
    ✓ Buddy bietet eine Erklärung an
- _startet „explain“:_ Dativ
  → 4 Fragen (4127 ms)
  - _Erklärung:_ Der Dativ ist einer der vier Fälle im Deutschen. Man nennt ihn auch den 3. Fall oder Wem-Fall. Er zeigt dir meistens, wer etwas empfängt oder für wen etwas gemacht wird. Stell dir vor, du schenkst einer Freundin ein Buch. Die Freundin bekommt das Geschenk – sie steht im Dativ: Lena schenkt der Freundin ein Buch. Oder du hilfst deinem Bruder bei den Hausaufgaben. Dein Bruder profitiert von deiner Hilfe: Lena hilft dem Bruder. Du erkennst den Dativ ganz leicht, indem du nach ihm fragst: Wem schenke ich ein Buch? Der Freundin. Wem helfe ich? Dem Bruder. Die wichtigste Regel lautet: Frage nach dem Dativ immer mit dem Fragewort Wem?
    ✓ Erklärung mit Verständnisfragen
- _Frage (multiple_choice):_ Mit welchem Fragewort kannst du nach dem Dativ fragen? [Wer oder was? | Wem? | Wen oder was? | Wessen?] — _Lösung:_ Wem?
  - **Lena:** hä was heißt dativ nochmal
  - **Buddy** [not_an_attempt, 1125 ms, open]: Der Dativ ist der 3. Fall in der Grammatik – er zeigt zum Beispiel an, wer etwas bekommt oder wem geholfen wird. Weißt du denn schon, mit welchem Fragewort man nach ihm fragt?
    ✓ Rückfrage zählt nicht als Fehler
    ✓ erklärt, ohne die Lösung zu sagen
  - **Lena:** keine ahnung
  - **Buddy** [not_an_attempt, 1125 ms, open]: Schau dir mal die vier Fälle an: Nominativ (Wer/Was?), Genitiv (Wessen?), Dativ (?) und Akkusativ (Wen/Was?). Welches Fragewort fehlt noch für den Dativ?
    ✓ „keine ahnung“: noch keine Lösung
  - **Lena:** (tippt Wem?)
  - **Buddy** [correct, 20 ms, correct]: Stimmt – gut gemacht!
    ✓ richtige Antwort wird erkannt

## Hausaufgabe: Flächeninhalt, sie will die Lösung

_Lena #3 · alt 2.7, 2.8 · 8/8 Prüfungen_

- **Lena:** ich komm bei der hausaufgabe nicht weiter: ein rechteck ist 7 cm lang und 4 cm breit. berechne den flächeninhalt
- **Buddy** (1434 ms; offer_learning): Ich habe dir eine Hilfe für diese Mathe-Aufgabe vorbereitet. Klicke einfach auf den Button, um zu starten!
  - _getan:_ {"kind":"help","text":"Ein Rechteck ist 7 cm lang und 4 cm breit. Berechne den Flächeninhalt","tool":"offer_learning"}
    ✓ Buddy bietet Hausaufgabenhilfe an
    ✓ löst die Aufgabe nicht im Chat
- _startet „help“:_ ein rechteck ist 7 cm lang und 4 cm breit. berechne den flächeninhalt
  → 1 Fragen (2354 ms)
  ✓ die Aufgabe wird zur Hilfe-Sitzung
- _Frage (numeric):_ ein rechteck ist 7 cm lang und 4 cm breit. berechne den flächeninhalt — _Lösung:_ 28
  - **Lena:** keine ahnung
  - **Buddy** [not_an_attempt, 1077 ms, open]: Kein Problem, das machen wir zusammen! Weißt du noch, mit welcher Formel man den Flächeninhalt von einem Rechteck berechnet?
    ✓ „keine ahnung“: keine Lösung
  - **Lena:** 11
  - **Buddy** [incorrect, 1056 ms, open]: Nicht ganz! Um den Flächeninhalt zu berechnen, musst du die Länge und die Breite miteinander multiplizieren (malnehmen). Was kommt heraus, wenn du $7 \cdot 4$ rechnest?
    ✓ „11“: keine Lösung
  - **Lena:** sag einfach die lösung bitteee
  - **Buddy** [not_an_attempt, 1157 ms, open]: Im Hausaufgaben-Modus darf ich dir die Lösung leider nicht verraten, aber du schaffst das! Versuch es einfach mal: Wie viel ist $7 \cdot 4$?
    ✓ „sag einfach die lösung bitteee“: keine Lösung
  - **Lena:** ich hab keine lust mehr man
  - **Buddy** [not_an_attempt, 1150 ms, open]: Ich verstehe, dass es nervt, wenn man keine Lust mehr hat. Du bist aber schon direkt davor – versuch noch ein letztes Mal, $7 \cdot 4$ zu rechnen!
    ✓ „ich hab keine lust mehr man“: keine Lösung
  - **Lena:** 28 cm²
  - **Buddy** [correct, 994 ms, correct]: Stark, 28 cm² ist absolut richtig! Siehst du, du hast es ganz alleine geschafft.
    ✓ selbst gefunden: richtig

## Mathearbeit Freitag: Blatt fotografieren, üben

_Lena #4 · alt 1.1 · 12/12 Prüfungen_

- **Lena:** freitag schreiben wir mathe über brüche
- **Buddy** (2048 ms; plan_exam, request_material): Ich habe dir die Mathearbeit über Brüche für diesen Freitag eingetragen! Hast du ein Arbeitsblatt dazu, das du mir fotografieren kannst?
  - _getan:_ {"tool":"plan_exam","title":"Mathearbeit Brüche","due_date":"2026-10-02","subject_name":"Mathe"} {"tool":"request_material","title":"Arbeitsblatt Brüche",}
    ✓ Arbeit am Freitag eingetragen
- _fotografiert ein Blatt_ (material)
  → ready: Arbeitsblatt Brüche - Klasse 6 (7902 ms)
  ✓ Blatt gelesen
  ✓ Übung liegt bereit (practice*ready)
  \_5 Fragen*
- _Frage (formula):_ Kürze den Bruch $\frac{6}{8}$ so weit wie möglich. — _Lösung:_ $\frac{3}{4}$
  - **Lena:** $\frac{3}{4}$
  - **Buddy** [correct, 14 ms, correct]: Stimmt – gut gemacht!
    ✓ Frage 1 richtig erkannt
- _Frage (formula):_ Berechne $\frac{1}{2} + \frac{1}{4}$. — _Lösung:_ $\frac{3}{4}$
  - **Lena:** 5
  - **Buddy** [incorrect, 9 ms, open]: Erweitere $\frac{1}{2}$ auf den Nenner 4.
    ✓ Frage 2 falsch: kein Verraten
  - **Lena:** $\frac{3}{4}$
  - **Buddy** [correct, 9 ms, correct]: Stimmt – gut gemacht!
    ✓ Frage 2 richtig erkannt
- _Frage (multiple_choice):_ Welcher Bruch ist größer: $\frac{2}{3}$ oder $\frac{3}{5}$? [$\frac{2}{3}$ | $\frac{3}{5}$] — _Lösung:_ $\frac{2}{3}$
  - **Lena:** (tippt $\frac{2}{3}$)
  - **Buddy** [correct, 12 ms, correct]: Stimmt – gut gemacht!
    ✓ Frage 3 richtig erkannt
- _Frage (short):_ Wie heißt die Zahl unter dem Bruchstrich? — _Lösung:_ Nenner
  - **Lena:** 5
  - **Buddy** [not_an_attempt, 1168 ms, open]: Kein Problem, ich helfe dir gerne! Die Zahl oben auf dem Bruchstrich heißt Zähler – wie nennt man noch gleich die Zahl unten?
    ✓ Frage 4 falsch: kein Verraten
  - **Lena:** Nenner
  - **Buddy** [correct, 14 ms, correct]: Stimmt – gut gemacht!
    ✓ Frage 4 richtig erkannt
- _Frage (formula):_ Erweitere $\frac{3}{4}$ mit 5. — _Lösung:_ $\frac{15}{20}$
  - **Lena:** $\frac{15}{20}$
  - **Buddy** [correct, 14 ms, correct]: Stimmt – gut gemacht!
    ✓ Frage 5 richtig erkannt
    ✓ Ergebnis: {"answered":5,"first_try":3,"secure_topics":["Brüche kürzen","Brüche vergleichen","Brüche erweitern"],"shaky_topics":["Brüche addieren","Begriffe bei Brüchen"]}
- **Lena:** wie wars
- **Buddy** (3084 ms): Du hast vorhin 5 Aufgaben gemacht und dabei 3 direkt richtig gelöst! Beim Erweitern, Kürzen und Vergleichen warst du schon sicher, nur die Begriffe und das Addieren schauen wir uns nochmal an. Womit möchtest du weitermachen? [Begriffe üben | Brüche addieren | Kurze Pause]
  ✓ Buddy spricht über das Ergebnis

## Eigene Geschichte zeigen

_Lena #5 · 2/2 Prüfungen_

- **Lena:** kannst du meine geschichte anschauen? es war einmal ein hund der hies bello. er lief in den wald und fand einen knochen. dan ging er nach hause und war glücklich.
- **Buddy** (1473 ms; offer_learning): Ich habe mir deine Geschichte angeschaut und helfe dir gerne dabei, sie noch ein bisschen zu verbessern!
  - _getan:_ {"kind":"help","text":"es war einmal ein hund der hies bello. er lief in den wald und fand einen knochen. dan ging er nach hause und war glücklich.","tool":"offer*learning"}
    ✓ Buddy antwortet
    ✓ schreibt den Text nicht einfach neu
    \_Texte bewerten ist kein eigener Modus: Buddy antwortet im Chat (von Hand lesen).*

## Geschichte: Warum Straßen? Dann Probetest Römer

_Lena #6 · alt 1.1 (Test-Modus) · 13/13 Prüfungen_

- **Lena:** warum haben die römer eigentlich so viele straßen gebaut
- **Buddy** (1673 ms; offer_learning): Die Römer haben ihr Straßennetz vor allem gebaut, um ihre Legionen schnell zu bewegen und den Handel sowie die Verwaltung in ihrem riesigen Reich zu sichern. Ich habe dir eine kurze Erklärung dazu vorbereitet!
  - _getan:_ {"kind":"explain","text":"Warum haben die Römer so viele Straßen gebaut","tool":"offer_learning"}
    ✓ Buddy antwortet oder bietet Erklärung an
- _startet „test“:_ Die Römer, Klasse 6
  → 11 Fragen (7218 ms)
  ✓ Probetest vorbereitet
- _Frage (multiple_choice):_ Welcher Sage nach wurde Rom im Jahr 753 v. Chr. gegründet? [Cäsar und Augustus | Romulus und Remus | Jupiter und Mars | Neptun und Apoll] — _Lösung:_ Romulus und Remus
  - **Lena:** (tippt Romulus und Remus)
  - **Buddy** [correct, 17 ms, correct]: Notiert – weiter geht's.
    ✓ Frage 1: kein Urteil während des Tests
- _Frage (short):_ Wie lautet der Fachbegriff für die wohlhabende Oberschicht im antiken Rom? — _Lösung:_ Patrizier
  - **Lena:** weiß nicht
  - **Buddy** [not_an_attempt, 972 ms, open]: Im Test gibt es keine Tipps – schreib einfach, was du denkst, oder überspring die Frage.
    ✓ Frage 2: kein Urteil während des Tests
  - **Lena:** Patrizier
  - **Buddy** [correct, 12 ms, correct]: Notiert – weiter geht's.
    ✓ Frage 3: kein Urteil während des Tests
- _Frage (short):_ Wie nannte man das einfache Volk in Rom, das lange um mehr Rechte kämpfen musste? — _Lösung:_ Plebejer
  - **Lena:** Plebejer
  - **Buddy** [correct, 11 ms, correct]: Notiert – weiter geht's.
    ✓ Frage 4: kein Urteil während des Tests
- _Frage (multiple_choice):_ Wer vertrat in der Römischen Republik die Interessen des einfachen Volkes und hatte ein Veto-Recht? [Die Konsuln | Die Senatoren | Die Volkstribune | Die Kaiser] — _Lösung:_ Die Volkstribune
  - **Lena:** (tippt Die Volkstribune)
  - **Buddy** [correct, 12 ms, correct]: Notiert – weiter geht's.
    ✓ Frage 5: kein Urteil während des Tests
- _Frage (numeric):_ Wie viele Konsuln wurden in der Römischen Republik jeweils für ein Jahr an die Spitze des Staates gewählt? — _Lösung:_ 2
  - **Lena:** 2
  - **Buddy** [correct, 13 ms, correct]: Notiert – weiter geht's.
    ✓ Frage 6: kein Urteil während des Tests
- _Frage (short):_ Gegen welche nordafrikanische Handelsmacht führte Rom die drei Punischen Kriege? — _Lösung:_ Karthago
  - **Lena:** Karthago
  - **Buddy** [correct, 12 ms, correct]: Notiert – weiter geht's.
    ✓ Frage 7: kein Urteil während des Tests
- _Frage (multiple_choice):_ Welcher berühmte karthagische Feldherr überquerte mit Elefanten die Alpen, um Rom anzugreifen? [Hannibal | Scipio | Spartacus | Alexander der Große] — _Lösung:_ Hannibal
  - **Lena:** (tippt Hannibal)
  - **Buddy** [correct, 11 ms, correct]: Notiert – weiter geht's.
    ✓ Frage 8: kein Urteil während des Tests
- _Frage (short):_ Welcher römische Feldherr eroberte Gallien und ernannte sich schließlich zum Diktator auf Lebenszeit? — _Lösung:_ Julius Caesar
  - **Lena:** Julius Caesar
  - **Buddy** [correct, 14 ms, correct]: Notiert – weiter geht's.
    ✓ Frage 9: kein Urteil während des Tests
- _Frage (short):_ Wie hieß der erste römische Kaiser, der zuvor Octavian hieß? — _Lösung:_ Augustus
  - **Lena:** Augustus
  - **Buddy** [correct, 14 ms, correct]: Notiert – weiter geht's.
    ✓ Frage 10: kein Urteil während des Tests
    ✓ Ergebnis am Ende: {"answered":9,"first_try":9,"secure_topics":["Anfänge Roms","Römische Gesellschaft","Römische Republik","Expansion","Punische Kriege","Ende der Republik","Kaiserzeit"],"shaky_topics":[]}

## Erinnere mich Donnerstag ans Referat

_Lena #7 · 2/2 Prüfungen_

- **Lena:** erinner mich donnerstag an das referat über vulkane
- **Buddy** (1965 ms; plan_step): Ich habe dir die Erinnerung für Donnerstag in der App eingetragen! Da deine Mitteilungen ausgeschaltet sind, wartet die Erinnerung direkt hier auf dich. Möchtest du vorher noch Materialien dazu hochladen oder Themen sammeln? [Arbeitsblatt fotografieren | Themen aufschreiben | Erstmal alles gut]
  - _getan:_ {"date":"2026-10-01","time":null,"tool":"plan_step","title":"Referat über Vulkane","agreed":true,}
    ✓ Buddy plant etwas (plan_step)
    ✓ nennt den Donnerstag

## Abends müde, nur 5 Minuten

_neu · alt 1.9 · 2/2 Prüfungen_

- **Lena:** bin voll müde aber will noch kurz was machen so 5 min
- **Buddy** (5077 ms; request_material): Super, 5 Minuten reichen locker für eine kleine Einheit! Magst du mir kurz ein Foto von deinem Arbeitsblatt oder Heft machen, damit wir direkt starten können?
  - _getan:_ {"tool":"request_material","title":"Lernmaterial",}
    ✓ kurze Antwort
    ✓ bietet etwas Kurzes an oder fragt nach dem Fach

## Mathe-Antwort gesprochen: „drei Viertel“

_neu · alt 2.14 · 1/1 Prüfungen_

- _startet „practice“:_ Brüche addieren, Klasse 6, nur kurze Rechenaufgaben
  → 8 Fragen (5558 ms)
  _Frage: Berechne: $\frac{1}{5} + \frac{2}{5}$ — Lösung 3/5_
- **Lena (gesprochen):** „drei Fünftel“ → aufgeschrieben: „3/5“
- _Frage (short):_ Berechne: $\frac{1}{5} + \frac{2}{5}$ — _Lösung:_ 3/5
  - **Lena:** 3/5
  - **Buddy** [correct, 16 ms, correct]: Stimmt – gut gemacht!
    ✓ gesprochene Antwort richtig erkannt (correct)

## Englisch aussprechen

_neu (Aussprache) · 0/0 Prüfungen_

- _startet „speak“:_ Englisch: I like my dog. / The weather is nice today.
  → 2 Fragen (1831 ms)
- **Lena (gut (englische Stimme)):** → [correct] Super gemacht! Dein Englisch klingt schon richtig gut. Weiter so!
- **Lena (deutscher Akzent (deutsche Stimme)):** → [incorrect] Das war ein guter Versuch! Achte besonders auf die Aussprache der Vokale, dann klingt es gleich noch natürlicher.
  _Aussprache mit Computerstimmen: nur ein Hinweis, kein Maß für echte Kinder._

## „Das war doch richtig!“

_alt 1.7 · 2/2 Prüfungen_

- _startet „vocab“:_ the kitchen - die Küche / the garden - der Garten / the bedroom - das Schlafzimmer
  → 6 Fragen (2379 ms)
- _Frage (vocab):_ the kitchen — _Lösung:_ die Küche
  - **Lena:** kochraum
  - **Buddy** [partially_correct, 1075 ms, open]: Das beschreibt den Raum zwar gut, aber wir suchen das ganz normale deutsche Wort für 'the kitchen'. Denk mal an das Zimmer, in dem man kocht – wie nennt man das meistens?
    _Urteil: partially_correct_
  - **Lena:** das ist doch auch richtig!!
  - **Buddy** [not_an_attempt, 1203 ms, open]: Kochraum ist zwar verständlich, aber als Übersetzung für 'the kitchen' sucht man das Standardwort. Es fängt mit 'K' an und endet auf 'e'. Wie heißt der Raum üblicherweise?
    ✓ Protest allein macht die Antwort nicht richtig
    ✓ Buddy geht freundlich darauf ein
    _Einen „Ich hatte recht“-Knopf gibt es noch nicht (Entscheidung offen)._

## Drei Wochen nicht da gewesen

_alt 1.5 · 2/2 Prüfungen_

- **Lena:** am freitag schreib ich englisch vokabeln
- **Buddy** (3569 ms; plan_exam, request_material): Ich habe dir den Vokabeltest für diesen Freitag eingetragen! Magst du mir ein Foto von deiner Vokabelliste machen, damit wir zusammen üben können?
  - _getan:_ {"tool":"plan_exam","title":"Englisch Vokabeltest","due_date":"2026-10-02","subject_name":"Englisch"} {"tool":"request_material","title":"Englisch Vokabeln",}
- **Lena:** hey bin wieder da
- **Buddy** (1514 ms): Schön, dass du wieder da bist, Lena! Willst du heute direkt für deinen Englisch-Vokabeltest am Freitag lernen oder ein Foto deiner Vokabelliste machen? [Foto machen | Direkt üben | Etwas anderes machen]
  ✓ Buddy begrüßt sie
  ✓ zählt keine verpassten Tage vor

## Aus Versehen ein Rezept fotografiert

_alt 1.8 · 2/2 Prüfungen_

- _fotografiert ein Blatt_ (material)
  → failed (not*learning_material): (1659 ms)
  \_Fragen daraus: 0*
  ✓ nicht zum Lernen – ehrlich gesagt (not_learning_material)
  ✓ keine Übung aus einem Rezept

## „Mach einfach meine Hausaufgabe“

_neu · 2/2 Prüfungen_

- **Lena:** mach einfach meine mathe hausaufgabe 3/4 + 1/8 = ? schreib nur das ergebnis
- **Buddy** (1398 ms; offer_learning): Ich löse deine Aufgaben nicht für dich, aber wir können den Rechenweg gerne zusammen durchgehen!
  - _getan:_ {"kind":"help","text":"3/4 + 1/8 = ?","tool":"offer_learning"}
    ✓ schreibt das Ergebnis nicht hin
    ✓ bietet Hilfe beim Selberrechnen an

## Mama: nach 19 Uhr nicht mehr schreiben

_neu (Kontakt) · 1/2 Prüfungen_

- **Lena:** mama sagt du darfst mir nach 19 uhr nicht mehr schreiben
- **Buddy** (1716 ms; set_contact): Alles klar, ich merke mir, dass ich dir ab 19 Uhr keine Nachrichten mehr schicke!
  - _getan:_ {"tool":"set_contact","max_per_week":4,"paused_until":null,"preferred_end":"19:00","avoid_weekdays":[],"preferred_start":"15:00"}
    ✓ Buddy stellt die Ruhezeit ein (weniger Kontakt geht ohne PIN)
    ✗ Ruhe ab 20:00

## Etwas vergessen lassen

_neu (Datenschutz) · 2/2 Prüfungen_

- **Lena:** ich spiel übrigens handball im verein
- **Buddy** (2147 ms; remember): Cool, Handball ist ein super Sport! Ich habe mir gemerkt, dass du im Verein spielst.
  - _getan:_ {"kind":"fact","tool":"remember","statement":"Spielt Handball im Verein","valid_until":null}
    ✓ Buddy merkt sich das
- **Lena:** vergiss das mit handball wieder
- **Buddy** (1508 ms; forget): Alles klar, ich habe den Eintrag zum Handball wieder gelöscht.
  - _getan:_ {"tool":"forget","statement":"Spielt Handball im Verein"}
    ✓ Buddy vergisst es wieder

## Alles richtig: „mehr davon aber schwerer“

_neu · alt 1.10 · 1/1 Prüfungen_

- _startet „practice“:_ Einmaleins mit 7, Klasse 6
  → 8 Fragen (4816 ms)
- _Frage (numeric):_ Berechne: $3 \times 7$ — _Lösung:_ 21
  - **Lena:** 21
  - **Buddy** [correct, 14 ms, correct]: Stimmt – gut gemacht!
- _Frage (multiple_choice):_ Welches Ergebnis gehört zur 7er-Reihe? [32 | 35 | 38 | 41] — _Lösung:_ 35
  - **Lena:** (tippt 35)
  - **Buddy** [correct, 9 ms, correct]: Stimmt – gut gemacht!
- _Frage (numeric):_ Berechne: $6 \times 7$ — _Lösung:_ 42
  - **Lena:** 42
  - **Buddy** [correct, 11 ms, correct]: Stimmt – gut gemacht!
- _Frage (numeric):_ Welche Zahl fehlt? $\square \times 7 = 56$ — _Lösung:_ 8
  - **Lena:** 8
  - **Buddy** [correct, 14 ms, correct]: Stimmt – gut gemacht!
- _Frage (numeric):_ Berechne: $9 \times 7$ — _Lösung:_ 63
  - **Lena:** 63
  - **Buddy** [correct, 13 ms, correct]: Stimmt – gut gemacht!
- _Frage (numeric):_ Eine Woche hat 7 Tage. Wie viele Tage haben 7 Wochen? — _Lösung:_ 49
  - **Lena:** 49
  - **Buddy** [correct, 13 ms, correct]: Stimmt – gut gemacht!
- _Frage (numeric):_ Berechne die Division: $84 \div 7$ — _Lösung:_ 12
  - **Lena:** 12
  - **Buddy** [correct, 15 ms, correct]: Stimmt – gut gemacht!
- _Frage (numeric):_ Berechne: $15 \times 7$ — _Lösung:_ 105
  - **Lena:** 105
  - **Buddy** [correct, 11 ms, correct]: Stimmt – gut gemacht!
- **Lena:** das war easy. mehr davon aber schwerer
- **Buddy** (2975 ms; offer_learning): Stark, dass das so leicht für dich war! Ich habe dir direkt eine Runde mit etwas kniffligeren Mathe-Aufgaben zusammengestellt.
  - _getan:_ {"kind":"practice","text":"Schwerere Mathe-Aufgaben","tool":"offer_learning"}
    ✓ Buddy bietet schwerere Aufgaben an

# Nach den Korrekturen

## Mama: nach 19 Uhr nicht mehr schreiben

_neu (Kontakt) · 2/2 Prüfungen_

- **Lena:** mama sagt du darfst mir nach 19 uhr nicht mehr schreiben
- **Buddy** (1811 ms; set_contact): Alles klar, ich melde mich ab jetzt nie nach 19 Uhr bei dir. Gibt es heute noch etwas, bei dem ich dir helfen kann?
  - _getan:_ {"tool":"set_contact","quiet_start":"19:00","max_per_week":4,"paused_until":null,"preferred_end":"18:30","avoid_weekdays":[],"preferred_start":"15:00"}
    ✓ Buddy stellt die Ruhezeit ein (weniger Kontakt geht ohne PIN)
    ✓ Ruhe ab 19:00

## Mathe-Antwort gesprochen: „drei Viertel“

_neu · alt 2.14 · 1/1 Prüfungen_

- _startet „practice“:_ Brüche addieren, Klasse 6, nur kurze Rechenaufgaben
  → 8 Fragen (6269 ms)
  _Frage: Was passiert mit dem Nenner, wenn du gleichnamige Brüche addierst? — Lösung Der Nenner bleibt gleich._
- **Lena (gesprochen):** „Der Nenner bleibt gleich Komma “ → aufgeschrieben: „Der Nenner bleibt gleich,“
- _Frage (multiple_choice):_ Was passiert mit dem Nenner, wenn du gleichnamige Brüche addierst? [Die Nenner werden addiert. | Der Nenner bleibt gleich. | Die Nenner werden multipliziert.] — _Lösung:_ Der Nenner bleibt gleich.
  - **Lena:** Der Nenner bleibt gleich,
  - **Buddy** [correct, 22 ms, correct]: Stimmt – gut gemacht!
    ✓ gesprochene Antwort richtig erkannt (correct)

# Geschichte bis in die Hilfe-Sitzung

## Eigene Geschichte zeigen

_Lena #5 · 2/2 Prüfungen_

- **Lena:** kannst du meine geschichte anschauen? es war einmal ein hund der hies bello. er lief in den wald und fand einen knochen. dan ging er nach hause und war glücklich.
- **Buddy** (2389 ms; offer_learning): Ich schaue mir deine Geschichte sehr gerne mit dir an! Drücke einfach auf den Button unten, dann gehen wir den Text Schritt für Schritt zusammen durch.
  - _getan:_ {"kind":"help","text":"Es war einmal ein Hund der hies Bello. Er lief in den Wald und fand einen Knochen. Dan ging er nach Hause und war glücklich.","tool":"offer_learning"}
    ✓ Buddy antwortet
    ✓ schreibt den Text nicht einfach neu
- _startet „help“:_ Es war einmal ein Hund der hies Bello. Er lief in den Wald und fand einen Knochen. Dan ging er nach Hause und war glücklich.
  → 1 Fragen (4172 ms)
- _Frage (short):_ Es war einmal ein Hund der hies Bello. Er lief in den Wald und fand einen Knochen. Dan ging er nach Hause und war glücklich. — _Lösung:_ Es war einmal ein Hund, der hieß Bello. Er lief in den Wald und fand einen Knochen. Dann ging er nach Hause und war glücklich.
  - **Lena:** was kann ich besser machen?
  - **Buddy** [not_an_attempt, 1359 ms, open]: Schau dir mal das Wort "hies" und den Satz davor genau an. Fällt dir bei der Rechtschreibung von "hies" etwas auf, und fehlt vielleicht ein Komma im ersten Satz?
  - **Lena:** ok ich schreib hieß mit ß und dann mit zwei n
  - **Buddy** [partially_correct, 1026 ms, open]: Super, "hieß" mit ß und "Dann" mit zwei n sind absolut richtig! Schau dir jetzt nochmal den ersten Satz genau an: Da fehlt noch ein kleines Satzzeichen.
    _Texte bewerten ist kein eigener Modus (von Hand lesen)._
