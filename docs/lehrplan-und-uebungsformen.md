# Lehrplan und Übungsformen — was am Gymnasium wirklich geübt wird, und was Buddy davon kann

**Stand:** 01.10.2026, §13.4 korrigiert am 02.10.2026, §16 (fehlende Fächer, Issue #265) ergänzt am 02.10.2026 · **Auftrag:** Issue #193 (Owner, 01.10.2026) · **Quellenstand:** alle Webquellen
am 01.10.2026 abgerufen; „Stand" bei einem Dokument ist dessen Eigendatum.

> **Wozu dieses Dokument da ist.** Buddy kann heute vier Dinge: eine Frage getippt beantworten,
> Vokabeln (getippt oder seit #147 angetippt), Aussprache (gesprochen) und Multiple Choice. Diese
> vier sind nicht aus einem Lehrplan abgeleitet, sondern aus dem, was auf den Arbeitsblättern der
> Tochter stand. Dieses Dokument stellt der App zum ersten Mal die Lehrpläne gegenüber — und sagt,
> **wofür Buddy nichts hat**.
>
> **Was belegt ist und was nicht.** Jede Aufgabenform unten ist an einer Primärquelle belegt
> (KMK-Beschluss, EPA, IQB-Dokument, Kernlehrplan, Abiturvorgabe, Operatorenliste, echtes
> Prüfungsheft). Die **Eimer-Zuordnung** (C/R/H, §0.2) ist dagegen **meine Analyse** und kein
> amtlicher Begriff. Was nicht belegt werden konnte, steht in **§13** — und zwar als Lücke, nicht
> als plausible Vermutung (CLAUDE.md: „When you genuinely don't know").

---

## §0 Wie man dieses Dokument liest

### 0.1 Schnellzugriff — finde dein Fach

| Fach                                                                                                                              | Abschnitt                                                                    | Dominanter Eimer Sek I       | Dominanter Eimer Sek II | Buddy heute  |
| --------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ---------------------------- | ----------------------- | ------------ |
| Mathematik                                                                                                                        | [§3](#3-mathematik)                                                          | C                            | C + R                   | Gruppe 1 + 2 |
| Physik                                                                                                                            | [§4.1](#41-physik)                                                           | C + R                        | R                       | Gruppe 2 + 3 |
| Chemie                                                                                                                            | [§4.2](#42-chemie)                                                           | C                            | C + R                   | Gruppe 1 + 3 |
| Biologie                                                                                                                          | [§4.3](#43-biologie)                                                         | R                            | R                       | Gruppe 2 + 3 |
| Informatik                                                                                                                        | [§5](#5-informatik)                                                          | C                            | R                       | Gruppe 3     |
| Deutsch                                                                                                                           | [§6](#6-deutsch)                                                             | C (Sprache) + R (Schreiben)  | **R + H, kein C**       | **Gruppe 2** |
| Englisch / Französisch / Spanisch / Russisch                                                                                      | [§7](#7-moderne-fremdsprachen)                                               | C                            | R + H                   | Gruppe 1 + 2 |
| Latein / Griechisch                                                                                                               | [§8](#8-latein-und-griechisch)                                               | C (Formen) + H (Übersetzung) | H                       | **Gruppe 2** |
| Geschichte                                                                                                                        | [§9.1](#91-geschichte)                                                       | C + R                        | R + H                   | Gruppe 2     |
| Geographie / Erdkunde                                                                                                             | [§9.2](#92-geographie--erdkunde)                                             | **C stark**                  | R + H                   | Gruppe 1 + 3 |
| Politik / SoWi / Wirtschaft                                                                                                       | [§9.3](#93-politik--sozialwissenschaften--wirtschaft--recht)                 | C + R                        | R + H                   | Gruppe 2     |
| Religion / Ethik / Philosophie                                                                                                    | [§10.1](#101-religion-ethik-philosophie)                                     | R                            | H                       | Gruppe 2     |
| Kunst, Musik                                                                                                                      | [§10.2](#102-kunst-und-musik)                                                | C (Fachwissen)               | H (Praxis)              | Gruppe 3     |
| Sport                                                                                                                             | [§10.3](#103-sport)                                                          | —                            | H                       | Gruppe 3     |
| _Nachtrag #265:_ BwR, Technik/NwT, Sport-Theorie, Philosophie O, Psychologie/Pädagogik, Griechisch, Russisch, Darstellendes Spiel | [§16](#16-nachtrag-die-fächer-die-in-der-analyse-224-noch-fehlten-issue-265) | je Fach in §16               | je Fach in §16          | §16.10       |

**Die vier Gruppen** (ausgeführt in §12): **1** gut abgedeckt · **2** läuft heute durch, wird aber
**falsch behandelt** · **3** kann Buddy gar nicht und sollte es sagen · **4** die eine Empfehlung.

### 0.2 Die drei Eimer — und warum genau sie zählen

CLAUDE.md Regel 1: _„The model interprets and plans; code enforces."_ Für eine Übungsform heißt
das: es entscheidet alles, **ob eine richtige Antwort von Code erkannt werden kann oder nur
beurteilt**. Deshalb trägt jede Aufgabenform unten genau einen dieser Buchstaben:

|                            | Bedeutung                                                                                                                                                                                                              | Was Code tun darf                                                                                                                                                                             |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **C** computable           | Es gibt eine entscheidbare Lösung: eine Zahl, ein Term, ein Label aus endlicher Menge, ein Vokabelpaar, ein Datum.                                                                                                     | Code darf „richtig" sagen — endgültig, ohne Modell.                                                                                                                                           |
| **R** rubric-checkable     | Kein einzelner Lösungsstring, aber eine **endliche Liste von Pflichtelementen**, deren Vorhandensein geprüft werden kann (Protokoll mit Fragestellung/Hypothese/…; Quellenanalyse mit Autor/Textsorte/Datum/Adressat). | Code darf die **Struktur** durchsetzen (welche Elemente, welche Reihenfolge, dass kein Gesamturteil gefällt wird). Ob ein Element _inhaltlich_ abgedeckt ist, kann nur das Modell beurteilen. |
| **H** human-judgeable only | Die **Qualität** ist der Gegenstand: die Stichhaltigkeit einer Erörterung, die Eigenständigkeit einer Interpretation, die Überzeugungskraft einer Rede.                                                                | Code darf gar nichts behaupten. Auch das Modell darf hier kein „falsch" sagen (Regel 5).                                                                                                      |

Drei amtliche Sätze setzen die Grenze — sie sind der Grund, dass **R nicht in C aufgelöst werden
darf**:

> **IQB/NRW, Korrekturgrundsatz:** _„Lösungen, die im Erwartungshorizont nicht erfasst sind, aber
> … gleichwertige Lösungen bzw. Lösungswege darstellen, sind gleichberechtigt zu werten."_
> → **Stringvergleich ist amtlich ausgeschlossen.**
>
> **NRW-Erwartungshorizonte, nach jeder Kriterienliste:** _„Oder er benennt in Sachgehalt und
> Aspektierung vergleichbar relevante Aspekte."_
> → Eine Rubrik ist eine **Elementliste, keine Musterlösung**.
>
> **KMK:** _„Es handelt sich daher zumeist um Maximallösungen, nicht jedoch um Musterlösungen."_

Und eine Grenze, die weiter reicht als Didaktik — GPJE, _Nationale Bildungsstandards für den
Fachunterricht in der Politischen Bildung_ (2004), S. 16:

> _„Bei der Beurteilung von Leistungen ist deshalb bei einer Bewertung von politischen Urteilen
> äußerste Vorsicht geboten; solche Bewertungen können sich allenfalls auf formale Anforderungen
> – wie innere Widerspruchsfreiheit – und auf den Grad der Komplexität in der Begründung, **nicht
> aber auf die inhaltliche Position selbst** beziehen."_

Das ist kein Designwunsch, sondern ein Grundrechtsargument (Meinungsfreiheit). Eine App, die ein
Werturteil „falsch" nennt, tut etwas, das einer Lehrkraft untersagt ist.

**Ein Fehlschluss, vor dem die Quellen ausdrücklich warnen:** Die Eimer sind **nicht** die
Anforderungsbereiche. _„Grundsätzlich können sich alle Operatoren auf alle drei
Anforderungsbereiche beziehen"_ (NRW, Fremdsprachen und Naturwissenschaften); _„Die Verwendung
eines Operators lässt keinen Rückschluss auf den Anforderungsbereich zu"_ (Niedersachsen). Und
umgekehrt: Niedersachsen stellt ein **Musikdiktat in AFB III**, obwohl es maschinell trivial
entscheidbar ist. AFB messen Komplexität, die Eimer messen Entscheidbarkeit — zwei verschiedene
Achsen.

### 0.3 Der Operator ist die Aufgabenform

Die wichtigste Entdeckung der Recherche für ein Produkt: **die Länder haben die Aufgabenformen
selbst katalogisiert**, in den Operatorenlisten für das Zentralabitur. Dort steht nicht die
Lehrplanüberschrift, sondern was die Schülerin produzieren muss. Zwei Beispiele, wörtlich:

> **berechnen** (IQB, Bio/Chemie/Physik, Stand 31.03.2022): _„Die Berechnung ist **ausgehend von
> einem Ansatz** darzustellen."_
>
> **zeichnen**: _„Objekte grafisch **exakt** darstellen."_ — gegen **skizzieren**: _„übersichtlich
> grafisch darstellen."_

Daraus folgt direkt, dass „eine Zahl eintippen" in Deutschland fast nie die ganze Aufgabe ist
(→ §12.2) und dass Zeichnen Inhalt ist, nicht Dekoration:

> **NRW, Korrekturvorgabe:** _„Ungenauigkeiten in Zeichnungen oder unzureichende oder falsche
> Bezüge **zwischen Zeichnungen und Text** sind als fachliche Fehler zu werten."_

**Aber: ein globales Operator-Vokabular ist nicht möglich.** Vier dokumentierte Konflikte:

| Operator                  | Konflikt                                                                                                                                                                                                                                                                                                   |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **herleiten**             | Niedersachsen Sek I = Formelumstellung (**C**); IQB/NRW/Bayern = Herleitung aus Gesetzmäßigkeiten (**R**). Die Bedeutung wechselt _innerhalb_ Niedersachsens beim Übergang Sek I → Sek II. BW nennt die erste Bedeutung „lösen".                                                                           |
| **vergleichen**           | EPA Geschichte und Bayern: AFB III, _„… zu beurteilen"_ — ein abschließendes Urteil ist Pflicht. Niedersachsen und BW: AFB II, _„kriterienorientiert darlegen"_ — kein Urteil. NRWs zwei eigene Listen widersprechen sich hier ebenfalls.                                                                  |
| **beurteilen / bewerten** | Sachurteil ≠ Werturteil ist IQB-Norm (Bio/Ch/Ph) und GI-Norm (Informatik). **BW kennt „beurteilen" nicht** und verschmilzt beides. **Niedersachsen Sek I** setzt _beurteilen_ = _Stellung nehmen_. **In Mathematik fehlt „bewerten" vollständig.** NRW Geographie gibt beiden **identische** Definitionen. |
| **AFB-Zuordnung**         | BW ordnet in allen Fächern jedem Operator einen AFB zu und nutzt das zur Niveaudifferenzierung. NRW, IQB, Niedersachsen, GI und Berlin lehnen das **ausdrücklich** ab.                                                                                                                                     |

→ Eine Aufgabenbank, die Operatoren als Schlüssel benutzt, braucht einen
**Land × Stufe × Fach**-Mapping-Layer. Ein Vergleich, der in Bayern ohne Urteil unvollständig ist,
ist in Niedersachsen mit Urteil nicht falsch.

---

## §1 Der Fächerkanon

### 1.1 Sekundarstufe I (Klassen 5–10, Gymnasium)

**Rahmen:** KMK, _Vereinbarung über die Schularten und Bildungsgänge im Sekundarbereich I_,
03.12.1993 **i. d. F. 07.10.2022**, Ziff. 5.2.5: _„Am Gymnasium schließt eine erfolgreich
absolvierte Jahrgangsstufe 10 oder eine am Ende der Jahrgangsstufe 10 erfolgreich absolvierte
Prüfung nach den Bestimmungen der Länder den Mittleren Schulabschluss … ein."_ → Am Gymnasium ist
der MSA im Regelfall **prüfungsfrei**.

**Was eine App nicht annehmen darf: „Klasse 7 Physik" ist keine bundesweite Größe.** Die
Einstiegsklasse verschiebt sich um bis zu vier Jahre:

| Fach         | Eigenes Fach ab                                                                                                                                                                                                                                   |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Physik**   | NRW, Niedersachsen **5/6** · Berlin/Brandenburg, Hamburg, BW, RLP **7** · **Bayern 8** (Physikanteil in „Natur und Technik" ab 7)                                                                                                                 |
| **Chemie**   | **Niedersachsen 5** · Berlin/Brandenburg **7** · **BW 8** (der BW-Chemieplan hat 5/6 und dann direkt „Klassen 8/9/10" — **eine Klasse 7 existiert nicht**) · **Bayern 8 nur im NTG, sonst 9** · NRW: im Kernlehrplan **keine Jahrgangszuordnung** |
| **Biologie** | NRW, Niedersachsen, Bayern **5** · Berlin/Brandenburg, BW **7**                                                                                                                                                                                   |

**Fächerverbünde in 5/6:** BW **BNT** (Biologie, Naturphänomene und Technik) · Berlin/Brandenburg
**Naturwissenschaften** und **Gesellschaftswissenschaften** sowie **WAT** · Bayern **Natur und
Technik** (5–7) · Hamburg **NWT** · RLP **Naturwissenschaften**. **NRW** hat Einzelfächer;
integrierter Unterricht ist nur als genehmigungspflichtige Schuloption möglich.
**Niedersachsen ist ein Sonderfall, der oft falsch gelesen wird:** Einzelfächer in _einem_
Dokument „Naturwissenschaften" mit drei getrennten Curricula — kein Verbundfach. **Korrektur zu
einer verbreiteten Annahme: BW hat keinen Geschichte/Geographie/Gemeinschaftskunde-Verbund**;
das sind dort Einzelfächer.

**Gliederungsraster** — entscheidet, wie genau „Klassenstufe" überhaupt bestimmbar ist:
NRW drei Bänder (5/6 · 7/8 · 9/10), für Bio/Ch/Ph nur **zwei** („bis Ende Erprobungsstufe" / „bis
Ende Sek I") — eine Zuordnung einzelner Themen auf 7, 8, 9 oder 10 gibt der NRW-Plan **nicht
her** · BW Doppelklassen · **Bayern als einziges Land Einzeljahrgänge (5…13)** ·
Berlin/Brandenburg **Niveaustufen** (Gymnasium: Jg. 7 = E, 8 = F, 9 = G, 10 = H), sodass dieselbe
Anforderung schulformabhängig liegt · Niedersachsen am präzisesten (Ende Jg. 6/8/10) und mit
Verbot, nach hinten zu verschieben: _„Eine Verlagerung in einen späteren Doppeljahrgang … ist
nicht zulässig."_

**Wahlpflicht:** BW **Profilfach ab Klasse 8** (3. Fremdsprache / **NwT** / **IMP**) · NRW WP II
ab Klasse 9 (G9).

**Informatik** — Informatik-Monitor 2025/26 (GI e. V., Oktober 2025; _Sekundärquelle, so
gekennzeichnet_): Pflichtfach in **zehn** Ländern; Bremen 2026/27, RLP 2028/29 geplant;
**Berlin, Brandenburg, Hessen** nicht geplant; **Sachsen-Anhalt schließt das Gymnasium aus**.
Am Gymnasium konkret: **NRW** Pflicht nur Kl. 5/6, danach Wahlpflicht · **Bayern** kein eigenes
Pflichtfach in der Unterstufe (Informatik-Schwerpunkt in „Natur und Technik" Jg. 6/7), Jg. 9/10
nur im NTG · **BW** Aufbaukurs Pflicht in Klasse 7, danach IMP oder Brückenkurs ·
**Niedersachsen** Pflichtfach Jg. 9/10 seit 2024/25 · **Berlin** Wahlpflicht 7–10.
**Belegter Negativbefund: es gibt keinen KMK-Beschluss, der Informatik bundesweit zur Pflicht
macht**, und **keine KMK-Bildungsstandards Informatik** — Leitdokument ist die **EPA Informatik
(01.12.1989 i. d. F. 05.02.2004)**.

### 1.2 Sekundarstufe II

**Rahmen:** KMK, _Vereinbarung zur Gestaltung der gymnasialen Oberstufe und der Abiturprüfung_,
Beschluss 07.07.1972 **i. d. F. 06.06.2024** (diese Fassung ist selbst ein Befund — die Reform
vom 16.03.2023 ist überholt).

Struktur: einjährige Einführungsphase + zweijährige Qualifikationsphase · **265
Jahreswochenstunden** ab Jgst. 5 · Verweildauer 2–4 Jahre · **drei Aufgabenfelder**
(sprachlich-literarisch-künstlerisch; gesellschaftswissenschaftlich;
mathematisch-naturwissenschaftlich-technisch, **Informatik eingeschlossen**),
Religionslehre/Ersatzfach und Sport gesondert — _„Das Fach Sport wird keinem Aufgabenfeld
zugeordnet."_

Belegverpflichtungen (Ziff. 7.1): 4 Halbjahre Deutsch · 4 fortgeführte Fremdsprache · 2
literarisch/künstlerisch · 4 Geschichte (gesellschaftswissenschaftlich insgesamt **≥ 6**) · 4
Mathematik · 4 eine Naturwissenschaft · 4 Sport. **40 Halbjahreskurse**; zwei oder drei Fächer auf
erhöhtem Niveau. Abiturprüfung: **vier oder fünf** Prüfungsfächer, ≥ 3 schriftlich, ≥ 1 mündlich,
≥ 2 auf erhöhtem Niveau, ≥ 2 aus Deutsch/Mathematik/Fremdsprache, ≥ 1 aus jedem Aufgabenfeld.
Gesamtqualifikation Block I : II = **2 : 1**, 600 + 300 = **900**, mindestens **300**; **36**
einzubringende Halbjahresergebnisse; Zulassung ab **200** Punkten in Block I.

**Vier oder fünf Prüfungsfächer:** NRW **4 → 5** ab EF 2027/28 (neue APO-GOSt, ausgefertigt
16.07.2026: alt § 12 _„in vier Fächern"_, neu § 12 Abs. 1 _„in fünf unterschiedlichen Fächern"_) ·
Bayern **5** (3 schriftlich + 2 Kolloquium) · BW **5** · Berlin **5** inkl. 5. Prüfungskomponente ·
Niedersachsen **5** (P1–P5) · Schleswig-Holstein _„vier oder fünf"_ · Hamburg **4** · Sachsen **5**.
**Besondere Lernleistung** belegt in NRW § 17, Berlin § 44, Hamburg § 8, SH § 28, Brandenburg
§ 22, Sachsen § 49.

**Kursartenbezeichnungen sind nur Etiketten für zwei KMK-Niveaus** (grundlegend/erhöht):
Leistungs-/Grundkurs (NRW, BE, SN, BB, NI) · Leistungs-/Basisfach (BW, BY) · Kern-/Profilfach
(HH, SH) · Leistungs-/Grundfach (RP). **Intern die KMK-Niveaus modellieren, nicht die Etiketten.**
Zwei Besonderheiten: **In Mathematik hat Bayern kein grundlegendes Niveau** — alle werden auf
erhöhtem Niveau geprüft. Und **BW hat in einem Basisfach überhaupt keine schriftliche
Abiturprüfung** (AGVO § 21 Abs. 1 S. 1: _„Schriftliche Prüfungsfächer sind die drei
Leistungsfächer."_) — „Bearbeitungszeit Basisfach Deutsch" ist also keine Kategorie.

**2027 ist ein harter Umstellungspunkt.** KMK-Vereinbarung Ziff. 13.4: _„Die Länder stellen
sicher, dass die vorgenannten Bestimmungen für Schülerinnen und Schüler, die **ab 2027** in die
Einführungsphase eintreten, umgesetzt werden."_ Jede Oberstufenlogik in der App verfällt mit
diesem Jahrgang.

---

## §2 Die Leistungsnachweise — und was davon überhaupt übbar ist

### 2.1 Zwei Befunde, die die ganze Frage anders stellen

**(1) Die Minutenzahlen stehen meist nicht in den Verordnungen.** Belegte Delegationen: NRW
APO-GOSt § 32 Abs. 2 — _„Die Dauer der schriftlichen Prüfung … legt die oberste
Schulaufsichtsbehörde durch Runderlass fest"_; Sachsen SOGYA § 53 → Verwaltungsvorschrift;
Brandenburg GOSTV § 12 Abs. 5; SH OAPVO § 11. **NRW APO-S I § 6 enthält überhaupt keine Zahl und
keine Dauer für Klassenarbeiten.** Bayern GSO § 21: _„Zahl, Art und Terminierung der
Leistungserhebungen liegen … im pädagogischen Ermessen der Lehrkräfte."_ Die einzige bundesweit
exakt bezifferte Quelle ist **KMK Ziff. 8.3.3** (Tabelle unten). Alles darunter ist
VV-Ebene, revidierbar oder Lehrkraftsache.

**(2) Keine Verordnung nennt eine Seitenzahl für die Facharbeit.** Die zirkulierenden „8–12" oder
„10–15 Seiten" stammen aus Schulhandreichungen. Amtlich gemessen wird in **Halbjahren
Arbeitsaufwand**. → Eine App darf keine Seitenzahl als amtliche Anforderung darstellen.

### 2.2 Die Formen, und was eine App davon kann

| Leistungsnachweis                                       | Was es physisch ist                                                                                                                                                                                                    | Zahlen (Land)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | In einer App übbar?                                                                                                                                                                                                                      |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Klassenarbeit** Sek I                                 | 1–2 Unterrichtsstunden, handschriftlich                                                                                                                                                                                | Bayern GSO: Deutsch ≥ 3/Jahr, Mathematik 5–7 ≥ 4, 8–11 ≥ 3, Fremdsprachen ≥ 3 (bei ≥ 4 Wochenstunden ≥ 4); Dauer Jg. 5–11 **max. 60 Min**. Niedersachsen: Deutsch/Mathe/FS **3–4** („4 ist der Regelfall"), **Sport 0**. **Brandenburg nur 2** in Deutsch und FS — die schärfste Länderdifferenz. Sachsen max. 25/Jahr.                                                                                                                                                                                                                                                                             | **Teilweise.** Die Einzelaufgaben ja; die Prüfungssituation (Zeitdruck, Handschrift, kein Nachschlagen) nein. Buddys `test`-Modus ist die nächste Näherung.                                                                              |
| **Kurzarbeit / Stegreifaufgabe** (Bayern)               | max. 30 bzw. **20 Min**, letztere **unangekündigt**                                                                                                                                                                    | GSO § 23                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | **Ja** — das ist formatgleich mit einer kurzen Übungseinheit.                                                                                                                                                                            |
| **Klausur** Sek II                                      | 90–330 Min                                                                                                                                                                                                             | KMK Ziff. 9.4.1: erste drei Halbjahre **1–2** Klausuren; bei zwei zählen sie _„in der Regel zu 50 Prozent"_, bei einer _„mindestens zu einem Drittel"_; **max. ein Drittel** ersetzbar durch einen _„gleichwertigen komplexen Leistungsnachweis"_. NRW: EF 90; Q1/Q2 LK 135–180, GK 90–135; **Q3 LK 225**; Q4 unter Abiturbedingungen. Berlin VO-GO § 14: EF ≥ 2, GK ≥ 2, LK ≥ 3 Unterrichtsstunden.                                                                                                                                                                                                | **Nur in Teilen.** Eine 255-Minuten-Klausur ist keine App-Sitzung. Üpbar sind ihre _Teilaufgaben_.                                                                                                                                       |
| **Abiturklausur**                                       | KMK Ziff. 8.3.3, einschl. Auswahlzeit                                                                                                                                                                                  | Deutsch **315 / 255** (4 Aufgaben zur Wahl) · Mathematik **300 / 255** · fortgeführte FS Schreiben **225 / 195**, + Sprachmittlung 60, Hörverstehen 30, **Sprechen 15** · Bio/Ch/Ph **300 / 255** (4 Aufgaben, **3** zu bearbeiten) · übrige 240–300 / 180–240. **Niedersachsen ist Ausreißer: Deutsch 270 / 210.**                                                                                                                                                                                                                                                                                 | **Nein.**                                                                                                                                                                                                                                |
| **Sonstige Leistungen / „Mitarbeit"**                   | laufend                                                                                                                                                                                                                | **NRW Sek II explizit 50 : 50** (APO-GOSt § 13: _„Die Kursabschlussnote wird gleichwertig aus den Endnoten beider Beurteilungsbereiche gebildet. Eine rein rechnerische Bildung … ist unzulässig"_). **Berlin** VO-GO § 15: eine Klausur → ⅓, zwei → ½. **Bayern** GSO § 28/29: zwei Schulaufgaben → 1 : 1, mehr als zwei → **2 : 1 zugunsten der schriftlichen**. **NRW Sek I: keine Zahl** (_„angemessen berücksichtigt"_). BW, Niedersachsen, Hamburg, Sachsen: **keine Zahl**.                                                                                                                  | **Nein** — aber Buddy trainiert, was dort sichtbar wird (Begriffe parat haben, erklären können).                                                                                                                                         |
| **Mündliche Abiturprüfung / Kolloquium**                | KMK Ziff. 8.5: Einzelprüfung _„in der Regel 20 Minuten"_, Vorbereitung _„in der Regel 20 Minuten"_, Protokoll; _„darf keine Wiederholung der schriftlichen Prüfung sein"_; schriftlich + mündlich im selben Fach 2 : 1 | Bayern: **zwei** Kolloquiumsfächer, 30 Min Vorbereitung, 2 × 15 Min, Vortrag ~10 Min; Bayern verlangt ausdrücklich **„lautes Denken"**. Berlin § 44: Präsentationsprüfung 15 + 15 Min. BW: 20 + 20 Min.                                                                                                                                                                                                                                                                                                                                                                                             | **Nur der Wissensteil.** Ein Prüfungsgespräch mit Rückfragen kann Buddy heute nicht führen (→ §12.3).                                                                                                                                    |
| **Sprechprüfung** Fremdsprachen                         | zwei Teile: zusammenhängendes Sprechen + an Gesprächen teilnehmen                                                                                                                                                      | **NRW verpflichtend**: _„Im Fach Englisch wird im letzten Schuljahr eine schriftliche Klassenarbeit durch eine gleichwertige Form der mündlichen Leistungsüberprüfung ersetzt"_ (APO-S I § 6 Abs. 8); Sek II einmal in einem der ersten drei Q-Halbjahre, alle modernen FS. **Bayern**: _„In mindestens zwei Jahrgangsstufen"_. **Niedersachsen**: eine **je Doppeljahrgang** (also dreimal über Sek I) — mehr als NRW. **BW Kommunikationsprüfung**: Teil B des _schriftlichen_ Abiturs, 25 % der Note, Tandem ≥ 20 Min (5 Min monologisch je Schülerin + 10 Min dialogisch), 15 Min Vorbereitung. | **Den monologischen Teil teilweise** (Aussprache, Vortrag). **Den dialogischen nicht.**                                                                                                                                                  |
| **Referat / Präsentation**                              | Vortrag + Handout                                                                                                                                                                                                      | **Kein Land schreibt Gliederung, Handout, Dauer oder Bewertungskriterien vor** (gezielt in fünf Ländern geprüft) — überall genannt, nirgends spezifiziert.                                                                                                                                                                                                                                                                                                                                                                                                                                          | **Die Vorbereitung ja, den Vortrag nein.**                                                                                                                                                                                               |
| **GFS (BW)**                                            | eine „gleichwertige Feststellung von Schülerleistungen"                                                                                                                                                                | **NVO § 9: ab Klasse 7 ist _„jede Schülerin und jeder Schüler pro Schuljahr zu einer solchen Leistung in einem Fach ihrer oder seiner Wahl verpflichtet"_**                                                                                                                                                                                                                                                                                                                                                                                                                                         | **Der stärkste Anknüpfungspunkt im ganzen Bericht:** verpflichtend, jährlich, **frei gewählt** — genau die Stelle, an der ein Lernbegleiter planen und vorbereiten hilft. Dasselbe gilt für Sachsens **Komplexe Leistung** (SOGYA § 26). |
| **Protokoll** (Versuchs-, Gesprächs-)                   | formularartiges Dokument                                                                                                                                                                                               | **Es gibt kein amtliches Protokollschema.** NRW gibt fünf Kompetenzen (E1 Fragestellung · E2 Beobachtung, _„Beschreibung von der Deutung klar trennen"_ · E3 Hypothese · E4 Experiment · E5 Auswertung) und K1 _„in vorgegebenen Formaten"_ — vorgegeben von der Lehrkraft. Niedersachsen warnt: protokollieren _„ohne in eine ritualisierte Art des Protokolls zu verfallen"_. **„Fehlerbetrachtung" ist nirgends Protokollelement**, sondern ein eigener Standard und quantitativ nur im erhöhten Niveau. **Gesprächsprotokoll Deutsch: null Treffer** in NRW und Bayern.                         | **Ja, als R-Form** — aber die Elementliste muss vom Blatt kommen, nicht erfunden werden.                                                                                                                                                 |
| **Portfolio / Lerntagebuch / Lesetagebuch**             | datierte Einträge                                                                                                                                                                                                      | Bayern LehrplanPLUS D5: _„Sie dokumentieren ihr Textverständnis, z. B. in vorstrukturierten Lesetagebüchern."_ NRW nennt Portfolios und Lerntagebücher als sonstige Leistungen. **Niedersachsen zählt das Lesetagebuch ausdrücklich nicht zu den schriftlichen Lernkontrollen.**                                                                                                                                                                                                                                                                                                                    | **Ja** (Abdeckung und Eintragstypen sind prüfbar, die Güte nicht).                                                                                                                                                                       |
| **Heftführung**                                         | —                                                                                                                                                                                                                      | **In neun aktuellen Normtexten aus fünf Ländern nicht als Bewertungsgrundlage genannt.**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | **Nicht bauen.**                                                                                                                                                                                                                         |
| **Facharbeit / Seminararbeit / besondere Lernleistung** | mehrseitige Arbeit + Kolloquium                                                                                                                                                                                        | KMK Ziff. 7.7: besondere Lernleistung ≥ **zwei** Halbjahre, Block I bis **30 Punkte**; Facharbeit ≥ **ein** Halbjahr. NRW: Facharbeit in Q1, **ersetzt eine Klausur**. Bayern: Seminararbeit im W-Seminar, Abgabe _„spätestens zweiter Unterrichtstag im November der Jahrgangsstufe 13"_, Bewertung § 29 Abs. 6: Arbeit **verdoppelt** + Prüfungsgespräch, Summe × ⅔. Berlin: 5. Prüfungskomponente.                                                                                                                                                                                               | **Nein** als Produkt. Als _Vorhaben_ (Thema finden, Quellen ordnen, Termine) ist es genau Buddys Rolle.                                                                                                                                  |
| **Hausaufgaben**                                        | —                                                                                                                                                                                                                      | NRW Runderlass 05.05.2015, BASS 12–63 Nr. 3: _„**Sie werden nicht benotet, finden jedoch Anerkennung.**"_ Tageslimits Kl. 5–7 **60 Min**, Kl. 8–10 **75 Min**; keine für die Oberstufe.                                                                                                                                                                                                                                                                                                                                                                                                             | **Ja** — Buddys `help`-Modus, und die Limits sind ein nützlicher Rahmen.                                                                                                                                                                 |
| **VERA-8**                                              | zentral, verpflichtend, Jg. 8                                                                                                                                                                                          | Deutsch (Lesen, Zuhören, Orthografie, Sprache untersuchen), Mathematik, Fremdsprachen (Lese-/Hörverstehen). Fenster 2027: **08.02.–25.03.** **Keine Noten**, fünf Kompetenzstufen; NRW ausdrücklich: Ergebnisse sind nicht in Noten umrechenbar. **Schreiben wird nicht geprüft.**                                                                                                                                                                                                                                                                                                                  | **Ja, formatnah** — überwiegend geschlossene Items.                                                                                                                                                                                      |
| **Bayern Jahrgangsstufentests**                         | Jg. 6 (Deutsch, Latein), 7 (Englisch), 8 (Deutsch, Mathe), 10 (Englisch, Mathe)                                                                                                                                        | Das ISB empfiehlt die Wertung als **kleiner Leistungsnachweis** — anders als VERA. Deutsch Jg. 6 und 8: 29 Einzelaufgaben, **27 davon maschinell entscheidbar** (§6.1).                                                                                                                                                                                                                                                                                                                                                                                                                             | **Ja, fast vollständig.** Die beste aufgabenscharfe amtliche Fundstelle des ganzen Berichts.                                                                                                                                             |
| **Nachprüfung**                                         | Ferienprüfung                                                                                                                                                                                                          | NRW APO-S I § 23: ab Klasse 7, **ein** Fach, _„in der letzten Woche vor Unterrichtsbeginn"_. Bayern GSO § 33: Jg. 6–9, _„in den letzten Tagen der Sommerferien"_, schriftlich _„im Umfang etwa einer Schulaufgabe"_.                                                                                                                                                                                                                                                                                                                                                                                | **Ja** — ein klar umgrenztes, terminiertes Ziel.                                                                                                                                                                                         |

### 2.3 KI in Leistungsnachweisen — die ehrliche Positionierung steht in einem KMK-Beschluss

**KMK, _Handlungsempfehlung für die Bildungsverwaltung zum Umgang mit Künstlicher Intelligenz in
schulischen Bildungsprozessen_, Beschluss der Bildungsministerkonferenz vom 10.10.2024** — vier
Sätze, die für LearnBuddy direkt einschlägig sind:

> **Kein pauschales Verbot:** _„Die Länder sind sich darin einig, dass ein allgemeines Verbot von
> KI zur Bearbeitung von in häuslicher Arbeit anzufertigenden Produkten … weder zielführend und
> wünschenswert, noch durchhaltbar ist."_
>
> **KI darf nicht bewerten:** _„Leistungsbewertung ist und bleibt eine pädagogische und
> hoheitliche Aufgabe, die als Verwaltungsakt … ausschließlich von Lehrkräften erfüllt werden
> kann"_; Art. 22 Abs. 1 DSGVO verlangt _„immer eine menschliche Letztentscheidung"_.
>
> **Was KI ausdrücklich darf:** _„Vorkorrektur, Korrekturassistenz und anschließende adaptive
> Lernunterstützung"_, _„formative Diagnostik"_, _„unmittelbares, personalisiertes und
> elaboriertes Feedback"_.
>
> **Wohin die Prüfungskultur geht:** _„die Bewertung weg von der Produkt- hin zur
> Prozessorientierung"_; bei KI-Nutzung sind _„die versierte Koaktivität und die Fähigkeit, die
> Ergebnisse zu reflektieren"_ in Präsentation und **Verteidigung** zu bewerten.

**Bayern** (Stand 29.06.2026, Art. 56 Abs. 5 BayEUG + GSO §§ 26, 57): unerlaubte Hilfsmittel sind
Unterschleif **unabhängig davon, ob sie genutzt wurden**; ausdrücklich erfasst sind Smartwatches,
Kopfhörer, Smart Glasses, KI-Scan-Stifte, KI-Pins, KI-Ringe; Folge **Note 6 / 0 Punkte**.
**Hamburg HIBB** (Richtlinie 17.04.2024 — gilt nur für berufsbildende Schulen) verlangt eine
Kennzeichnungspflicht mit Tool, Version, URL, Prompt, Datum und Einsatzform.

**Konsequenz für LearnBuddy, in einem Satz:** Üben mit Buddy liegt in der ausdrücklich
_erwünschten_ Zone. Die Grenze ist das **abgegebene Produkt ohne Kennzeichnung**. Und: die App
darf nie behaupten, eine Note zu geben — was ohnehin Regel 5 ist.

---

## §3 Mathematik

**Rahmen:** KMK, _Bildungsstandards im Fach Mathematik für die Allgemeine Hochschulreife_,
18.10.2012 (Kompetenzen K1–K6, Leitideen L1–L5); MSA-Standards 04.12.2003 **i. d. F. 23.06.2022**,
Korrektur 18.06.2026 — die Leitideen wurden 2022 umbenannt: _Zahl und Operation · Größen und
Messen · Strukturen und funktionaler Zusammenhang · Raum und Form · Daten und Zufall_.
Operatoren: **IQB-Grundstock Mathematik, Stand 28.02.2019, nur 14 Einträge** — NRWs Liste „ab
Abitur 2023" ist damit **wortgleich** (per Diff geprüft).

> **Zwei Befunde, die eine App davor bewahren, Tradition für Vorschrift zu halten.**
> (1) **„Kurvendiskussion", „vollständige Induktion", „Nebenbedingung" und „Krümmung" kommen in
> den KMK-Standards 2012 nicht ein einziges Mal vor.** Die Kurvendiskussion als geschlossene
> Prozedur ist didaktische Tradition. Vollständige Induktion fehlt in KMK AHR, BW und Bayern
> komplett. _(Korrektur 02.10.2026: als Aufgabenform gibt es beide — Funktionsuntersuchung,
> Extremwertaufgabe mit Nebenbedingung, vollständige Induktion als Pflicht in Hessen; §13.4.)_
> (2) **„bewerten" existiert in Mathematik nicht.** Es gibt nur _beurteilen_ — _„Das zu fällende
> Urteil ist zu begründen."_ Ein Werturteil-Operator fehlt dem Fach vollständig.

**Die KMK lässt vier echte Wahlmöglichkeiten, und die Länder haben verschieden gewählt** — _„…
alternativ auf die Beschreibung mathematischer Prozesse durch Matrizen (A1) oder die vektorielle
Analytische Geometrie (A2) … Ebenso … auf die Schätzung von Parametern (B1) oder auf die Testung
von Hypothesen (B2)."_

| Land            | A1/A2                                  | B1/B2                                                                                  |
| --------------- | -------------------------------------- | -------------------------------------------------------------------------------------- |
| **NRW**         | A2 („Matrizen" fehlt im GOSt-KLP 2023) | **B1 — Hypothesentests fehlen vollständig**                                            |
| **Berlin**      | A2                                     | **B1 _und_ B2** (Alternativtests, ein-/zweiseitige Signifikanztests, Fehler 1./2. Art) |
| **Brandenburg** | A2                                     | **B2**                                                                                 |
| **BW**          | A2                                     | **B2**                                                                                 |
| **Bayern**      | A2                                     | **weder** — Signifikanz-/Hypothesentest fehlt in Jgst. 11, 12 und 13                   |

→ „Signifikanztest durchführen" ist für Berlin, Brandenburg und BW Pflichtstoff und für NRW und
Bayern **nicht existent**. Eine Aufgabe, die Buddy für einen NRW-Jahrgang generiert, kann
fachlich korrekt und trotzdem lehrplanfremd sein.

### 3.1 Aufgabenformen

| Aufgabenform                                                                                                                            | Produkt                                                                              | Eimer                                                                                  | Klassenstufe (Land)                                                                                                                                                                                         |
| --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Bruchrechnung, Anteil/Ganzes                                                                                                            | Bruch oder Zahl mit Einheit                                                          | **C**                                                                                  | NRW 5/6; Bayern 6                                                                                                                                                                                           |
| Dreisatz; Größen schätzen; Einheiten umwandeln                                                                                          | Zahl mit Einheit                                                                     | **C**                                                                                  | NRW 5/6                                                                                                                                                                                                     |
| Überschlag/Probe **als Kontrollstrategie**                                                                                              | Zahl **+ Kontrollrechnung**                                                          | **R** — die Kontrolle _ist_ die Leistung                                               | NRW 5/6                                                                                                                                                                                                     |
| Termumformung, binomische Formeln, Bruchterme                                                                                           | umgeformter Term                                                                     | **C** (CAS-vergleichbar)                                                               | NRW 7/8; Bayern 7                                                                                                                                                                                           |
| Fehlerhafte Termumformung korrigieren                                                                                                   | korrigierter Term **+ Fehlerbenennung**                                              | **R**                                                                                  | NRW 7/8                                                                                                                                                                                                     |
| Lineare/quadratische Gleichung, Ungleichung lösen                                                                                       | Lösungsmenge                                                                         | **C**                                                                                  | NRW 7/8 bzw. 9/10                                                                                                                                                                                           |
| LGS lösen **und Verfahren begründet wählen**                                                                                            | Lösung + Begründung + Effizienzvergleich                                             | **R**                                                                                  | NRW 7/8                                                                                                                                                                                                     |
| Prozent- und Zinsrechnung                                                                                                               | Zahl mit Einheit                                                                     | **C**                                                                                  | NRW 7/8; Bayern 7                                                                                                                                                                                           |
| Zinsexponent durch systematisches Probieren                                                                                             | Zahl + Tabellenkalkulation                                                           | **R**                                                                                  | NRW 7/8                                                                                                                                                                                                     |
| **Konstruktion mit Zirkel und Lineal** (Dreieck, Mittelsenkrechte, In-/Umkreis, Thaleskreis)                                            | **Zeichnung + Abfolge der Konstruktionsschritte mit Fachbegriffen**                  | **R**                                                                                  | NRW 7/8; Bayern 7; BW 7/8                                                                                                                                                                                   |
| Lösbarkeit/Eindeutigkeit einer Konstruktion beurteilen                                                                                  | Aussage + Begründung                                                                 | **R**                                                                                  | NRW 7/8 (KMK MSA 2022: nur MSA-Niveau)                                                                                                                                                                      |
| **Satz des Pythagoras beweisen**                                                                                                        | Beweisführung                                                                        | **R**                                                                                  | **NRW 9/10 — ausdrücklich „beweisen"**                                                                                                                                                                      |
| Pythagoras / Trigonometrie / Strahlensätze / Kosinussatz anwenden                                                                       | Zahl mit Einheit                                                                     | **C**                                                                                  | Bayern 9; NRW 9/10. **Strahlensätze im NRW-G9-Plan Sek I nicht vorhanden**; **Kosinussatz in NRW schon in Sek I**                                                                                           |
| Flächen-/Volumenberechnung                                                                                                              | Zahl mit Einheit                                                                     | **C**                                                                                  | NRW 5/6 (Quader) → 9/10 (Kugel, Kegel)                                                                                                                                                                      |
| Volumengleichheit mit **Cavalieri** begründen                                                                                           | Begründungstext                                                                      | **R**                                                                                  | NRW 9/10                                                                                                                                                                                                    |
| Netz, Schrägbild, Modell                                                                                                                | Zeichnung / Modell                                                                   | **R**                                                                                  | NRW 5/6                                                                                                                                                                                                     |
| **Funktionsgraph zeichnen**                                                                                                             | Graph mit Achsen, Skalierung, Punkten                                                | **R**                                                                                  | ab NRW 7/8                                                                                                                                                                                                  |
| Werte aus Graph ablesen                                                                                                                 | Zahlen mit Toleranz                                                                  | **C**                                                                                  | ab NRW 7/8                                                                                                                                                                                                  |
| Parametereinfluss erklären                                                                                                              | Erklärtext                                                                           | **R**                                                                                  | NRW 9/10                                                                                                                                                                                                    |
| Wachstumsmodell wählen **und Eignung überprüfen**                                                                                       | Modellwahl + Prognose + Urteil                                                       | **R**, bei offener Modellkritik **H**                                                  | NRW 9/10                                                                                                                                                                                                    |
| **Ableiten** (Summen-, Faktor-, Produkt-, Kettenregel)                                                                                  | Ableitungsterm                                                                       | **C**                                                                                  | Q. NRW nennt hilfsmittelfrei exakt: GK ganzrationale, eˣ, sin, cos, √x, 1/x + Produktregel; **LK zusätzlich** ln, rationale Exponenten, Produkt- **und** Kettenregel                                        |
| Eine Ableitungsregel **beweisen**                                                                                                       | Beweis                                                                               | **R**                                                                                  | NRW Q: _„beweisen eine dieser Ableitungsregeln"_                                                                                                                                                            |
| Integrieren, Stammfunktion, lineare Substitution                                                                                        | Term / Zahl                                                                          | **C**                                                                                  | Q, GK + LK                                                                                                                                                                                                  |
| Hauptsatz **geometrisch-anschaulich begründen**                                                                                         | Text + Skizze                                                                        | **R**                                                                                  | Q, grundlegendes Niveau                                                                                                                                                                                     |
| Ableitungsgraph ↔ Funktionsgraph                                                                                                        | Skizze                                                                               | **R** — mehrere korrekte Graphen (Bayern 2023 Teil A: _„einen **möglichen** Graphen"_) | Q                                                                                                                                                                                                           |
| **Kurvendiskussion** (Def.-bereich, Nullstellen, Symmetrie, Verhalten im ∞, Monotonie, Extrem-/Wende-/Sattelpunkte, Randextrema, Graph) | Schrittfolge + Graph                                                                 | **R** — jeder Teilschritt C, **Vollständigkeit und Reihenfolge sind die Rubrik**       | Q, GK + LK                                                                                                                                                                                                  |
| **Extremwertaufgabe mit Nebenbedingung**                                                                                                | Zielfunktion + eingesetzte Nebenbedingung + Extremum + Randbetrachtung + Antwortsatz | **R** — die Modellierungsschritte sind Pflicht                                         | NRW GK **und** LK; BW; Berlin                                                                                                                                                                               |
| „Steckbriefaufgabe"                                                                                                                     | LGS + Funktionsterm                                                                  | **C**                                                                                  | NRW GK und LK, namentlich in den Abiturvorgaben                                                                                                                                                             |
| Tangenten-/Normalengleichung, Ortskurve, Rotationsvolumen, uneigentliches Integral                                                      | Gleichung / Zahl                                                                     | **C**                                                                                  | meist LK. **Uneigentliches Integral: Berlin ja — BW 2025 ausdrücklich ausgeschlossen**                                                                                                                      |
| Vektoren: Betrag, Kollinearität, Skalarprodukt; Geraden/Ebenen; Lagebeziehungen; Abstände                                               | Zahl / Gleichung / Label                                                             | **C**                                                                                  | Q. GK: Geraden + Gerade/Ebene; **alle Kombinationen nur LK**. **Berlin schreibt das Verfahren vor:** _„über Ermittlung von Lotfußpunkten; Abstandsformeln und Hessesche Normalenform sind nicht notwendig"_ |
| **Beweise mit Vektoren**                                                                                                                | Beweis                                                                               | **R**                                                                                  | **in BW 2025 ausdrücklich ausgeschlossen**                                                                                                                                                                  |
| Matrizen, Grenzmatrix, Fixvektor                                                                                                        | Matrix / Vektor                                                                      | **C**                                                                                  | **nur A1-Länder** — in NRW, BW, Bayern, Berlin nicht gefunden                                                                                                                                               |
| Baumdiagramm                                                                                                                            | Baum **R**, Wahrscheinlichkeit **C**                                                 |                                                                                        | NRW 7/8 → 9/10                                                                                                                                                                                              |
| Vierfeldertafel                                                                                                                         | gefüllte Tafel + Wahrscheinlichkeit                                                  | **C** — aus Randwerten determiniert                                                    | NRW 9/10; Q                                                                                                                                                                                                 |
| Lage-/Streumaße, Boxplot                                                                                                                | Zahlen / Boxplot                                                                     | **C** / **R**                                                                          | **NRW 5/6** (Median, Quartile, Spannweite, Boxplots)                                                                                                                                                        |
| Binomialverteilung; σ-Regeln; Prognose-/Konfidenzintervall                                                                              | Zahl / Intervallgrenzen                                                              | **C**                                                                                  | Q; Intervalle in **NRW nur LK**                                                                                                                                                                             |
| **Hypothesentest**: Ablehnungsbereich, Entscheidung, Fehler 1./2. Art                                                                   | Bereich **C** + Interpretation **R**                                                 |                                                                                        | **Berlin, Brandenburg, BW LK — in NRW und Bayern nicht vorhanden**                                                                                                                                          |
| Histogramm zeichnen / lesen                                                                                                             | Diagramm / Zahl                                                                      | **R** / **C**                                                                          | Q                                                                                                                                                                                                           |
| Statistische Erhebung planen und beurteilen                                                                                             | Plan + Urteil                                                                        | **R**                                                                                  | Q (KMK)                                                                                                                                                                                                     |
| Grafiken kritisch analysieren, Manipulation erkennen                                                                                    | Analysetext                                                                          | **R**                                                                                  | NRW 9/10                                                                                                                                                                                                    |
| Statistische Aussagen in authentischen Texten beurteilen                                                                                | Beurteilungstext                                                                     | **R**, bei offener Bewertung **H**                                                     | NRW 9/10                                                                                                                                                                                                    |
| **Simulation**                                                                                                                          | Aufbau + Auswertung                                                                  | **R**                                                                                  | Q (KMK) — **in Berlin vom Abitur ausgenommen**                                                                                                                                                              |
| **Fermi-Aufgabe**                                                                                                                       | Zahl **+ Annahmenkette**                                                             | **R**                                                                                  | NRW Sek I („Offene Aufgabe")                                                                                                                                                                                |
| Sachaufgabe mit „Beurteile" am Ende                                                                                                     | Ergebnis + begründetes Urteil                                                        | **R**; bei Modellgüte-Reflexion **H**                                                  | durchgehend                                                                                                                                                                                                 |
| **Beweise erläutern oder ergänzen** (Lückenbeweis)                                                                                      | Erläuterung / ergänzter Beweis                                                       | **R**                                                                                  | NRW Sek I **und** Q                                                                                                                                                                                         |
| Eigenständiger Beweis                                                                                                                   | Beweis                                                                               | **R** (AFB III)                                                                        | Q; **Berlin nimmt Beweise vom Abitur aus, Brandenburg fordert sie**                                                                                                                                         |
| Vollständige Induktion                                                                                                                  | Induktionsbeweis                                                                     | **R**                                                                                  | **in KMK AHR 2012, BW, Bayern nicht enthalten**                                                                                                                                                             |
| Fehler in vorgelegtem Lösungsweg korrigieren                                                                                            | Benennung + Korrektur                                                                | **R**                                                                                  | NRW Sek I + Q                                                                                                                                                                                               |
| Auswahlaufgabe: Auswahl begründen, Alternativen widerlegen                                                                              | Auswahl + Begründung + Widerlegung                                                   | **R**                                                                                  | NRW Sek I                                                                                                                                                                                                   |
| Explorative Aufgabe (Parametervariation mit DGS)                                                                                        | Regelmäßigkeit + Begründung                                                          | **R**                                                                                  | NRW Sek I + Q                                                                                                                                                                                               |
| Präsentationsaufgabe / Kurzvortrag                                                                                                      | mündlicher Beitrag                                                                   | **H**                                                                                  | Sek I + mündliches Abitur                                                                                                                                                                                   |

### 3.2 Hilfsmittel — die harte Ländermatrix

**GTR ist bundesweit abgeschafft:** die Länder erstellen _„auch zukünftig keine Aufgaben, die auf
einen grafikfähigen Taschenrechner (GTR) … zugeschnitten sind"_ (IQB, Stand 23.01.2024). Übrig:
**WTR** und **MMS** („modulares Mathematiksystem", vormals CAS). Stand 29.09.2025: _„Gegenwärtig
werden in **zwölf Ländern** Abiturprüfungen mit einem WTR … durchgeführt."_
**Ein hilfsmittelfreier Teil existiert ausschließlich in Mathematik** — Bio/Chemie/Physik setzen
immer mindestens WTR voraus.

| Land                     | Hilfsmittel                                                                                                                          | Hilfsmittelfreier Teil                                                                |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------- |
| **NRW** (2027)           | WTR **oder** CAS/MMS je Kurs; **zwei getrennte Aufgabensätze** in Teil 2                                                             | ja: GK 3 Pflicht + 2 aus 6; LK 4 Pflicht + 2 aus 6                                    |
| **Bayern** (ab 2026, G9) | nicht programmierbarer TR; **MMS nur in der Variante, die der einzelne Prüfling bis 31. Januar wählt**                               | ja, Teil A = 30 von 100 BE: 4 Pflicht + 2 aus 6, **Abgabe in den ersten 110 Minuten** |
| **BW** (2025)            | **nur WTR**, kein GTR, kein CAS                                                                                                      | ja: 4 Pflicht + 2 aus 6, **innerhalb 110 von 300 Minuten**                            |
| **Berlin**               | WTR ohne Gleichungslöser **oder** separates CAS-Abitur                                                                               | ja, Gruppe 1 + Gruppe 2 (2 aus 6), **innerhalb der ersten 110 von 330 Minuten**       |
| **Niedersachsen**        | **CAS verbindlich ab Abiturprüfung 2029** — das einzige Land, das CAS verpflichtend macht; CAS im Unterricht ab Jgst. 7 seit 2022/23 | nicht ermittelt (§13)                                                                 |

Die **110-Minuten-Regel** schreiben Bayern, Berlin und BW unabhängig und mit identischer
Binnenstruktur vor (Aufgabengruppe 1 = 4 Pflichtaufgaben AFB I/II, Gruppe 2 = 2 aus 6, erreicht
AFB III). **NRW weicht ab** (GK 3+2, LK 4+2, keine 110-Minuten-Regel).
„Ohne Hilfsmittel" heißt nicht ohne Werkzeug: BW wörtlich — _„Ein Geodreieck (ohne jegliche
Schablonen) sowie ein **Zirkel** sind keine Hilfsmittel im obigen Sinn."_

**Die MMS-Ausschlussliste ab 2030 ist die beste verfügbare Liste dessen, was als
Verständnisleistung gilt** — und damit dessen, was eine Lern-App nicht wegautomatisieren darf:
Nullstellen · exakte Koordinaten von Extrem- und Wendepunkten · Tangentengleichung · Länge eines
Kurvenstücks · Volumen eines Körpers · Ebenengleichung aus drei Punkten · Winkel zwischen zwei
Vektoren · Lagebeziehungen · Standardabweichung. Die KMK-Begründung ist explizit: eine
„Nullstelle von(…)"-Funktion erlaubt Nullstellen zu finden, _„ohne zu wissen, dass dazu eine
Gleichung der Form f(x)=0 zu lösen ist"_. Umgekehrt steht in derselben Quelle, was **bereitgestellt**
wird (Formelsammlung mit Konstanten, Ableitungen, p-q-Formel, Körperformeln, σ-Regeln,
Signifikanztest; **keine Quotientenregel**): **Formelreproduktion ist keine Prüfungsleistung —
Auswählen, Umstellen, Einsetzen ist es.**

---

## §4 Physik · Chemie · Biologie

**Rahmen:** KMK, _Bildungsstandards für die Allgemeine Hochschulreife_ in Physik, Chemie und
Biologie, je **18.06.2020** — vier Kompetenzbereiche **Sachkompetenz · Erkenntnisgewinnungs-
kompetenz · Kommunikationskompetenz · Bewertungskompetenz**, in allen drei Fächern identisch. Für
den MSA gilt **nicht** die Fassung von 2004, sondern die **weiterentwickelten Bildungsstandards
(WeBiS) vom 13.06.2024**.
**Operatoren: IQB-Grundstock Bio/Chemie/Physik, Stand 31.03.2022, 26 Einträge**, übernommen von
NRW, Bayern, BW, Berlin, Niedersachsen und RLP. Vier Paare entscheiden die Aufgabenform:

|                                 |                                                                                                                                                                                                      |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **erklären** vs. **erläutern**  | _„… indem man ihn auf Regeln und Gesetzmäßigkeiten zurückführt"_ vs. _„… veranschaulichend darstellen und durch zusätzliche Informationen verständlich machen"_                                      |
| **zeichnen** vs. **skizzieren** | _„Objekte grafisch exakt darstellen"_ vs. _„übersichtlich grafisch darstellen"_                                                                                                                      |
| **beurteilen** vs. **bewerten** | _„Das zu fällende **Sachurteil** ist mithilfe fachlicher Kriterien zu begründen"_ vs. _„Das zu fällende **Werturteil** ist unter Berücksichtigung gesellschaftlicher Werte und Normen zu begründen"_ |
| **ermitteln** vs. **berechnen** | _„rechnerisch, grafisch oder experimentell bestimmen"_ vs. _„Die Berechnung ist ausgehend von einem **Ansatz** darzustellen"_                                                                        |

**Prüfungsarchitektur** (NRW, Bayern, Berlin wortgleich): nur **materialgebundene** und
**fachpraktische** Aufgaben; **vier Aufgaben, der Prüfling wählt drei**; **gA/GK 255, eA/LK 300
Minuten**; **gA 3 × 30 = 90 BE, eA 3 × 40 = 120 BE**. NRW ausdrücklich: _„Eine ausschließlich
**aufsatzartig** zu bearbeitende Aufgabenstellung … ist **nicht zulässig**."_
**Formelsammlung für Mathematik, Chemie, Physik — nicht für Biologie** (die ländergemeinsame
Formelsammlung, Stand 13.06.2024, hat kein Biologie-Kapitel; Berlin und NRW lassen im
Biologie-Abitur nur Wörterbuch + Rechner zu). Die Code-Sonne ist **kein Hilfsmittel**, sondern
Aufgabenmaterial (Bayern druckt sie _innerhalb_ von Material M 4 ab).

**Vier Korrekturregeln, die jede automatische Bewertung binden:**

1. Gleichwertige Lösungen sind gleichberechtigt zu werten (→ §0.2).
2. _„**erläuternde, kommentierende und begründende Texte** sind unverzichtbare Bestandteile der
   Prüfungsleistung."_ → **Eine nackte Zahl genügt nie.**
3. Ungenauigkeiten in Zeichnungen und falsche Bezüge zwischen Zeichnung und Text sind fachliche
   Fehler.
4. **Fehlerfortsetzung ist zu werten** (Berlin, alle Fächer): _„Für richtig vollzogene
   Teilschritte, in die falsche Zwischenergebnisse eingegangen sind …, wird die vorgegebene Anzahl
   der Bewertungseinheiten erteilt."_ IQB-Pool-Aufgaben geben dafür **„Kontrollwerte"** an.

**Toleranzbänder sind belegt und großzügig:** NRW akzeptiert für eine Halbwertszeit-Ablesung
_„Halbwertszeiten im Bereich zwischen 300 min und 400 min sind als korrekt zu bewerten"_ bei
Erwartungswert 360 (± 11 %). Die präziseste code-implementierbare Regel liefert **Niedersachsen**
(Physik, Anhang A3, auf DIN 1319/1333 gestützt): mit voller Rechnergenauigkeit rechnen; Ergebnis
mit **einer Stelle mehr** als die ungenaueste Eingangsgröße; Unsicherheiten stets mit **zwei**
signifikanten Stellen. **Nur Niedersachsen formuliert das so** — NRW bleibt bei _„angemessene
Stellenzahl"_, Brandenburg bei _„sinnvolle Genauigkeit"_.

### 4.1 Physik

| Aufgabenform                                                    | Produkt                                                                                            | Eimer                                                                                                                                                    | Klassenstufe (Land)                                                                                                                                               |
| --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Formel nach gesuchter Größe umstellen                           | umgestellter Term                                                                                  | **C**                                                                                                                                                    | Brandenburg Jg. 7; Niedersachsen 8; BW ab 7                                                                                                                       |
| Werte mit Einheiten einsetzen                                   | Zahl mit Einheit                                                                                   | **C**                                                                                                                                                    | Bayern 7 (NT); NRW 7–10                                                                                                                                           |
| … **mit sichtbarem Ansatz**                                     | Ansatzzeile + Rechnung + Ergebnis                                                                  | **R**                                                                                                                                                    | Oberstufe verbindlich. Berlin: _„Sämtliche Rechnungen und Herleitungen sind … nachvollziehbar zu dokumentieren. Das gilt auch für die Auswertung von Messdaten."_ |
| Einheitenumrechnung, Vorsätze, Zehnerpotenzen                   | Zahl mit Einheit                                                                                   | **C**                                                                                                                                                    | Brandenburg Jg. 7–9; Niedersachsen 10/EF                                                                                                                          |
| Signifikante Stellen; Mittelwert                                | Zahl                                                                                               | **C**                                                                                                                                                    | Brandenburg Jg. 8/9; Niedersachsen mit expliziter Regel                                                                                                           |
| **Messunsicherheit (absolut + relativ)**, x ± Δx                | zwei Zahlen                                                                                        | **C** (Niedersachsen gibt eine geschlossene Rechenvorschrift)                                                                                            | **nur eA/LK**; **NRW EF nur qualitativ**                                                                                                                          |
| Messtabelle anlegen                                             | Tabelle mit Symbolen und Einheiten                                                                 | **R**                                                                                                                                                    | Niedersachsen 8 angeleitet → 10 selbstständig                                                                                                                     |
| **Diagramm von Hand zeichnen**                                  | Achsen, Einheiten, zweckmäßige Skalierung, Punkte                                                  | **R**                                                                                                                                                    | Brandenburg; Niedersachsen 8 (linear) / 10 (beliebig); bis Abitur                                                                                                 |
| **Ausgleichsgerade/-kurve einzeichnen**                         | Gerade/Kurve im Toleranzband                                                                       | **R**                                                                                                                                                    | Niedersachsen 8/10; Hamburg 8/9; BW ab 7                                                                                                                          |
| Steigung bestimmen **und physikalisch deuten**                  | Zahl mit Einheit + Deutungssatz                                                                    | **R** (Zahl allein C)                                                                                                                                    | Niedersachsen 7/8                                                                                                                                                 |
| Wert aus Diagramm ablesen                                       | Zahl mit Einheit                                                                                   | **C** mit explizitem Toleranzband                                                                                                                        | durchgehend                                                                                                                                                       |
| **Je-desto-Aussage**                                            | Satz festen Musters                                                                                | **R**, wird **C** bei Satzbaustein-Eingabe                                                                                                               | Brandenburg Jg. 7; Niedersachsen 6; Bayern 10                                                                                                                     |
| Auf Proportionalität prüfen                                     | Entscheidung + Quotient/Produkt                                                                    | **C**                                                                                                                                                    | Brandenburg Jg. 7                                                                                                                                                 |
| **Funktionalen Zusammenhang aus Messdaten ermitteln**           | Größengleichung + dokumentierte Schritte                                                           | **R** — Niedersachsen schreibt **vier Pflichtschritte** vor                                                                                              | Niedersachsen EF; Bayern 12                                                                                                                                       |
| **Versuchsprotokoll**                                           | mehrteiliges Dokument                                                                              | **R**                                                                                                                                                    | **NRW 5/6**; Bayern 7 angeleitet → 10 selbstständig; Niedersachsen 6 → 8                                                                                          |
| Experiment planen (mit Variablenkontrolle)                      | Plan, oft mit Skizze                                                                               | **R**                                                                                                                                                    | **NRW 5/6** angeleitet; Niedersachsen 6 → 10                                                                                                                      |
| Hypothese formulieren                                           | Satz/Absatz                                                                                        | **R**                                                                                                                                                    | Brandenburg; Niedersachsen 6; NRW 5/6                                                                                                                             |
| **Schaltplan zeichnen**                                         | Zeichnung mit normierten Schaltzeichen                                                             | **R** auf Papier — **C** bei digitalem Schaltungseditor                                                                                                  | **NRW 5/6 (!)**; Niedersachsen 6; Hamburg 7/8; **Bayern 7 per Software**                                                                                          |
| Schaltung real aufbauen                                         | physische Schaltung                                                                                | **R** — nur über Beobachtungsbogen/Foto                                                                                                                  | NRW 5/6                                                                                                                                                           |
| **Kräfte grafisch addieren / Kräftepfeile**                     | maßstäbliche Pfeilzeichnung (Maßstab, Richtung, Ansatzpunkt, Resultierende)                        | **R**                                                                                                                                                    | NRW 7–10; Bayern 8; Brandenburg Sek I                                                                                                                             |
| Komponentenzerlegung / Vektoraddition                           | Zeichnung bzw. zwei Komponentenwerte                                                               | **R**                                                                                                                                                    | NRW EF; Bayern 12                                                                                                                                                 |
| **Feldlinienbild zeichnen**                                     | Zeichnung + Orientierungsbegründung                                                                | **R**                                                                                                                                                    | Q. IQB-Pool 2026 LK: _„Skizzieren Sie … passende Feldlinien … Begründen Sie jeweils die Orientierung"_                                                            |
| Zeichnerische Konstruktion (Schatten, Lochkamera, Strahlengang) | Konstruktionszeichnung                                                                             | **R**                                                                                                                                                    | NRW 5/6 + 7–10; Bayern 7                                                                                                                                          |
| Energieumwandlungskette / Energieflussdiagramm                  | Kette / Flussdiagramm                                                                              | **R**                                                                                                                                                    | NRW 7–10; Niedersachsen 8                                                                                                                                         |
| **„Erklären Sie, warum …"**                                     | 1 Satz – 1 Absatz                                                                                  | **R** — Pflichtelement: Rückbezug auf eine benannte Regel                                                                                                | durchgehend 5/6–13                                                                                                                                                |
| **Herleitung einer Formel**                                     | Gleichungskette mit Zwischenschritten                                                              | **R** — Schrittfolge liegt fest, **teils sogar der Ansatz** (Brandenburg: _„Herleitung … aus einem Energieansatz"_, LK _„mithilfe eines Kraftansatzes"_) | Q                                                                                                                                                                 |
| Grenzen eines benannten Modells erläutern                       | 1 Absatz                                                                                           | **R**                                                                                                                                                    | ab Kl. 7 (BW); Q2 vertieft                                                                                                                                        |
| **Offene Modellkritik / Reflexion der Erkenntnisgüte**          | 1 Absatz – mehrseitig                                                                              | **H**                                                                                                                                                    | Q2 erhöhtes Niveau                                                                                                                                                |
| Zerfalls-/Kernumwandlungsgleichung                              | Nuklidgleichung                                                                                    | **C** (Nukleonen- und Ladungsbilanz prüfbar)                                                                                                             | **Bayern 10**; **Brandenburg 9/10 (Sek I!)**; **NRW erst im Abitur**                                                                                              |
| Quantenphysik-Deutung mit vorgegebenem Begriffsrahmen           | 1 Absatz                                                                                           | **R**                                                                                                                                                    | Q2                                                                                                                                                                |
| Offene Quantenphysik-Deutung                                    | 1 Absatz                                                                                           | **H**                                                                                                                                                    | Q2 eA/LK                                                                                                                                                          |
| **Fachpraktische Prüfungsaufgabe**                              | realer Aufbau + **beschriftete Skizze mit genauen Maßen** + maßstäbliche Ergebnisskizze + Messwert | **R**                                                                                                                                                    | Abitur, höchstens eine der drei Aufgaben                                                                                                                          |
| **Diskutieren mit vorgegebener Argumentzahl**                   | _n_ Pro- und _n_ Contra-Argumente                                                                  | **R** — zählbar (IQB-Pool 2026 GK: _„Berücksichtigen Sie dabei zwei Argumente für und zwei Argumente gegen"_)                                            | Q                                                                                                                                                                 |
| Bewerten (Werturteil)                                           | 1 Absatz – mehrseitig                                                                              | **H**                                                                                                                                                    | durchgehend                                                                                                                                                       |

**Geprüfte Negativbefunde Physik** (Volltextsuche über 20 Primärdokumente): **„Fermi-Abschätzung"
0 Treffer** · **„Freikörperbild" 0 Treffer** — die deutsche Fachsprache sagt _Kräfteaddition
(grafisch)_, _resultierende Kraft_, _Kräftezerlegung_, _Kräftepfeile_ · **„Linearisieren" 0
Treffer** · **kein bundesweites Protokollschema**, und **„Fehlerbetrachtung" ist nirgends
Protokollelement** · _(Korrektur 02.10.2026: Fermi-Aufgabe und Kräftezerlegung sind Aufgabenformen
und kein Ausschlussgrund, §13.4)_ · **NRW verlangt im Kernlehrplan SI Physik weder Messunsicherheit noch
Mittelwert, Ausgleichsgerade, Steigungsbestimmung noch Zehnerpotenzen** (0 Treffer für alle) —
substanzieller Unterschied zu Niedersachsen, BW, Brandenburg, Hamburg. Eine App, die diese
Begriffe als Aufgabenformen führt, führt etwas ein, das kein Lehrplan verlangt.

### 4.2 Chemie

> **Einzelaufgaben existieren im Abitur praktisch nicht.** Bayern eA A4.1 (10 BE): _„Beschreiben
> Sie die Durchführung der Bromwasserprobe mit Isopren und Methan **unter Verwendung einer
> Skizze**. Erklären Sie jeweils die Beobachtungen. Begründen Sie anhand des Reaktionsmechanismus
> die Bildung des Nebenprodukts."_ → **vier Produkte in einer Teilaufgabe**, davon eines eine
> Zeichnung.

| Aufgabenform                                                      | Produkt                                                                                                                           | Eimer                                                                                         | Klassenstufe (Land)                                                                                                                                                             |
| ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Reaktionsgleichung aufstellen und ausgleichen**                 | ausgeglichene Formelgleichung                                                                                                     | **C** — Atombilanz entscheidbar; Notationsvarianten **normalisieren**, nicht vergleichen      | NRW Zweite Stufe; **BW Kl. 8/9/10**; KMK MSA Jgst. 10                                                                                                                           |
| **Ionengleichung**                                                | ladungs- **und** atombilanzierte Gleichung                                                                                        | **C**                                                                                         | KMK-MSA-Musteraufgabe = **AFB III**                                                                                                                                             |
| Stöchiometrie/Molrechnung — Ergebnis                              | Zahl mit Einheit                                                                                                                  | **C**                                                                                         | NRW IF 9; BW 8/9/10                                                                                                                                                             |
| Stöchiometrie — **Ansatz dokumentieren**                          | Geg./Ges., Ansatz, Umformung, Ergebnis                                                                                            | **R** — BE schrittweise (_„Aufstellen des MWG: 1 · Ersetzen: 1 · Auflösen und Einsetzen: 2"_) | Oberstufe                                                                                                                                                                       |
| **Lewis-/Valenzstrichformel zeichnen**                            | bindende **und nichtbindende** Elektronenpaare, ggf. Formalladungen                                                               | **R**; **C** nur bei strukturierter Eingabe                                                   | NRW Zweite Stufe; BW 8/9/10                                                                                                                                                     |
| Molekülgeometrie angeben (EPA-Modell)                             | Label (linear/gewinkelt/trigonal-planar/tetraedrisch/trigonal-pyramidal) + Winkel                                                 | **C** — geschlossene Menge                                                                    | NRW IF 8 + EF                                                                                                                                                                   |
| Strukturformel / Isomere zeichnen                                 | Strukturformeln (Fischer, Haworth, Keilstrich)                                                                                    | **R**                                                                                         | NRW EF + Q-LK; Bayern 11                                                                                                                                                        |
| Isomerietyp zuordnen; asymmetrisches C-Atom markieren             | Label / Markierung                                                                                                                | **C**                                                                                         | NRW EF → Q-LK                                                                                                                                                                   |
| **IUPAC-Namen bilden**                                            | Namensstring                                                                                                                      | **C** — kanonischer Name entscheidbar                                                         | NRW IF 10; BW 8/9/10                                                                                                                                                            |
| **Nachweisreaktion — vollständige Antwort**                       | **Reagenz + Beobachtung + Reaktionsgleichung** (eA zusätzlich Durchführung + Skizze)                                              | **R** — die Dreiteilung ist amtlich                                                           | NRW Erste Stufe → Q-GK                                                                                                                                                          |
| Prinzip einer Nachweisreaktion klassifizieren                     | **Fällungsreaktion / Farbreaktion / Gasentwicklung**                                                                              | **C** — amtlich geschlossene Dreiermenge                                                      | Oberstufe                                                                                                                                                                       |
| pH-Rechnung starke Säure/Base                                     | Zahl                                                                                                                              | **C**                                                                                         | gA + eA                                                                                                                                                                         |
| pH-Rechnung schwache Säure/Base                                   | Zahl                                                                                                                              | **C**                                                                                         | **nur eA/LK**                                                                                                                                                                   |
| **Puffer: Henderson-Hasselbalch**                                 | Zahl                                                                                                                              | **C**                                                                                         | **NRW Q-LK ja · Berlin/Brandenburg LK ausdrücklich NEIN · BW LF nur qualitativ**                                                                                                |
| **Titration auswerten**                                           | Zahl mit Einheit                                                                                                                  | **C**                                                                                         | **BW schon Kl. 8/9/10 (!)**; NRW erst Q-GK                                                                                                                                      |
| **Titrationskurve zeichnen**                                      | Anfangs-pH, Pufferbereich, HÄP (pH = pKS), Sprung, ÄP, Plateau                                                                    | **R**; **C** bei digitalen Messwerten                                                         | nur eA/LK                                                                                                                                                                       |
| Indikator auswählen und begründen                                 | Wert + Begründung über Umschlagsbereich                                                                                           | **R**                                                                                         | NRW Q                                                                                                                                                                           |
| **Oxidationszahlen bestimmen**                                    | vorzeichenbehaftete Ganzzahlen                                                                                                    | **C** — Regelwerk deterministisch                                                             | NRW EF; BW                                                                                                                                                                      |
| **Redox-Teilgleichungen → Gesamtgleichung**                       | zwei Teilgleichungen + Gesamtgleichung                                                                                            | **C** — Elektronen-, Atom-, Ladungsbilanz                                                     | Oberstufe gA + eA                                                                                                                                                               |
| Zellspannung aus Standardpotenzialen; Nernst; Faraday             | Zahl                                                                                                                              | **C**                                                                                         | Nernst/Faraday **nur eA/LK**; **Berlin/Brandenburg Nernst eingeschränkt**                                                                                                       |
| Galvanische Zelle / Elektrolysezelle **beschriftet skizzieren**   | Elektroden, Elektrolyte, Anode/Kathode, Salzbrücke, Elektronenfluss, Ionenwanderung, Teilgleichungen                              | **R** — BE getrennt (Bayern gA: 4 BE Skizze + 2 BE Erklärung)                                 | Oberstufe                                                                                                                                                                       |
| **Mechanismus zeichnen** (SR, AE, SN1/SN2, SE, Veresterung)       | Strukturen + **gekrümmte Pfeile**, Zwischenteilchen, Schrittnamen, Bedingungen                                                    | **R**                                                                                         | gA + eA (SR, AE); SN1/SN2 und Aromaten-SE **nur eA**                                                                                                                            |
| Mechanismustyp benennen                                           | Label                                                                                                                             | **C**                                                                                         | eA                                                                                                                                                                              |
| Reaktionsenthalpie / Satz von Hess; Kalorimetrie; Gibbs-Helmholtz | Zahl                                                                                                                              | **C**                                                                                         | Gibbs-Helmholtz **nur eA/LK**                                                                                                                                                   |
| Energiediagramm zeichnen                                          | Edukt-/Produktniveau, ΔH-Pfeil mit Vorzeichen, EA, mit/ohne Katalysator                                                           | **R**                                                                                         | NRW Erste Stufe; BW                                                                                                                                                             |
| **MWG aufstellen**; Gleichgewichtskonzentration / Kc              | Bruchgleichung / Zahl                                                                                                             | **C**                                                                                         | NRW EF; **gA qualitativ / eA quantitativ**                                                                                                                                      |
| Le Chatelier: Richtung / Begründung                               | Label aus Dreiermenge / 2–4 Sätze                                                                                                 | **C** / **R**                                                                                 | NRW EF                                                                                                                                                                          |
| Löslichkeitsprodukt; Rf-Wert (DC); Fotometrie; Polarimetrie       | Zahl                                                                                                                              | **C**                                                                                         | nur eA/LK                                                                                                                                                                       |
| **Protokoll**                                                     | Fragestellung · Hypothese · Planung/Durchführung · Beobachtung/Messdaten · Auswertung · Hypothesenprüfung · methodische Reflexion | **R**                                                                                         | **ab Jgst. 5/6 (Niedersachsen)**                                                                                                                                                |
| **Beobachtung von Deutung trennen**                               | zwei getrennte Textblöcke                                                                                                         | **R** — die Trennung _ist_ das Kriterium                                                      | **NRW Zweite Stufe**                                                                                                                                                            |
| Modellkritik (Atommodelle, EPA, Orbitalmodell)                    | 3–8 Sätze                                                                                                                         | **R**                                                                                         | NRW IF 5; BW                                                                                                                                                                    |
| **Bewertung mit _vorgegebenen_ Kriterien**                        | Abschnitt je Kriterium + Abwägung + Urteil                                                                                        | **R** — Kriterienmenge endlich und aufgabenseitig gegeben                                     | Oberstufe **gA**                                                                                                                                                                |
| **Bewertung mit _selbst gewählten_ Kriterien**                    | Text; die Kriterienwahl ist Teil der Leistung                                                                                     | **H**                                                                                         | Oberstufe **eA**. **Bayern begründet die Grenze selbst:** _„Im gA werden die Kriterien zur Bewertung angegeben und sind nicht Teil der Leistung der Schülerinnen und Schüler."_ |

**Niedersachsen ordnet Aufgabenformen direkt den AFB zu** — für die Eimer-Frage brauchbarer als
jede Operatorenliste: **AFB I** _„Wiedergeben von Formeln, Gesetzen, Reaktionen und
Reaktionsmechanismen"_, _„Anfertigen von Versuchsprotokollen"_ · **AFB II** _„**Aufstellen** von
Reaktionsgleichungen"_, _„Planen einfacher Experimente"_ · **AFB III** _„Selbstständiges Aufstellen
von komplexen Reaktionsgleichungen und selbstständiges Entwickeln von Reaktionsmechanismen"_.
**BW stellt „aufstellen" dagegen als Regelfall in AFB III** und **kennt die Operatoren berechnen,
zeichnen, skizzieren, formulieren, protokollieren, deuten, herleiten, beurteilen, abschätzen,
interpretieren, analysieren, angeben überhaupt nicht.**

**Nachweisreaktionen sind kein nationaler Kanon.** Verbindlich ist nur _„Nachweis von Ionen und
funktionellen Gruppen"_ plus die drei Prinzipien. **Fehling** und **Tollens** nur
Berlin/Brandenburg; **BW nennt stattdessen Benedict-, Biuret-, Ninhydrin-Reaktion und GOD-Test —
„Fehling" kommt im BW-Plan nicht vor**; **Flammenfärbung** nur Berlin/Brandenburg; **„VSEPR" kommt
in keinem deutschen Dokument vor** (es heißt „EPA-Modell", und **in BW nicht einmal das**) — die
Aufgabenform gibt es also unter deutschem Namen (Korrektur 02.10.2026, §13.4). Und:
**der BW-Bildungsplan 2016 enthält in der gesamten Kursstufe keinen Standard zu
Reaktionsmechanismen und keine Nernst-Gleichung**, beides steht in KMK AHR 2020.

### 4.3 Biologie

**WeBiS MSA 2024 formuliert biologiespezifisch**, und zwei Sätze daraus sind direkt
produktrelevant: _„unter Beachtung der **unabhängigen und der abhängigen Variablen sowie
Kontrollen**"_ und _„reflektieren Unterschiede zwischen **Beschreibung und Interpretation**"_.
Zugleich: **die mikroskopische Zeichnung ist als KMK-Standard entfallen** (2004: _„mikroskopieren
Zellen **und stellen sie in einer Zeichnung dar**"_ → 2024: _„mikroskopieren sachgerecht"_).

| Aufgabenform                                             | Produkt                                                                                                        | Eimer                                                                                                                  | Klassenstufe (Land)                                                                                                                                                                                               |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Beschriftungsaufgabe Zelle / Auge / Neuron / Synapse** | Beschriftungsfelder aus geschlossenem Satz, oft + Funktion je Label                                            | **R** — geschlossener Labelsatz, aber der Erwartungshorizont lässt Synonyme zu (_„Regenbogenhaut/Irismuskel"_)         | BW 7/8; NRW 5/6; **Jgst. 10 (KMK MSA, länderübergreifend)**; Niedersachsen Q                                                                                                                                      |
| **Mikroskopieren + mikroskopische Zeichnung**            | eigenes Präparat **und** Bleistiftzeichnung nach Zeichenregeln                                                 | **H** — bewertet wird die Treue zum _eigenen_ Präparat                                                                 | Niedersachsen bis Jg. 6/8; NRW 5/6; BW 7/8                                                                                                                                                                        |
| Organ präparieren / Herbar anlegen                       | Präparat / Sammlung mit Etiketten                                                                              | **H**                                                                                                                  | Niedersachsen bis Jg. 10 bzw. 6                                                                                                                                                                                   |
| **Bestimmungsschlüssel anwenden**                        | ein Artname                                                                                                    | **C** — dichotomer Schlüssel ist deterministisch                                                                       | NRW 5/6; Jgst. 10                                                                                                                                                                                                 |
| **Stoff-/Energiebilanz eines Stoffwechselwegs**          | ATP/NADH/FADH₂/CO₂ pro Glucose, je Teilschritt                                                                 | **C** — feste Stöchiometrie                                                                                            | NRW Q; Niedersachsen; BW 11/12                                                                                                                                                                                    |
| Stoffwechselweg als Schema                               | Pfeilschema + ableitender Text                                                                                 | **R** — Edukte/Produkte, Kompartiment, Reihenfolge, Energieniveaus (**Bayern: 4 BE gA, 6 BE eA für dieselbe Aufgabe**) | Bayern 12/13                                                                                                                                                                                                      |
| Chromatogramm auswerten (DC Fotosynthesepigmente)        | Pigmentbanden, Rf-Werte                                                                                        | **C**                                                                                                                  | NRW Q                                                                                                                                                                                                             |
| **Genetik-Kreuzungsschema**                              | Legende, Elterngenotypen, Gameten, F1/F2-Kombinationsquadrat, Phänotypverhältnis, Wahrscheinlichkeit           | **C** — abgeschlossene Ableitung                                                                                       | Brandenburg 9/10; Jgst. 10; BW 9/10                                                                                                                                                                               |
| **Erbgang aus Stammbaum bestimmen**                      | ein Begriff aus geschlossenem Satz — BW wörtlich _„(dominant-rezessiv, autosomal, gonosomal)"_                 | **C**                                                                                                                  | **BW 9/10**; **NRW Einführungsphase (!)**                                                                                                                                                                         |
| **Erbgang begründen**                                    | Text mit den **spezifischen Ausschlussschritten** + den Stammbaum-Personen                                     | **R** — der KMK-Erwartungshorizont nennt **genau drei Pflichtschritte**                                                | Jgst. 10 (AFB II)                                                                                                                                                                                                 |
| Karyogramm analysieren                                   | Chromosomenzahl, Geschlecht, benannte Abweichung                                                               | **C**                                                                                                                  | NRW bis Ende Sek I                                                                                                                                                                                                |
| **Proteinbiosynthese mit der Code-Sonne**                | mRNA-Basensequenz **und** Aminosäuresequenz                                                                    | **C** — der genetische Code ist eine totale Funktion                                                                   | Bayern 12/13 gA (5 BE); BW 11/12                                                                                                                                                                                  |
| **Enzymkinetik-Diagramm auswerten**                      | Prosatext (Sättigung, limitierender Faktor, Denaturierung) + eingezeichnete erwartete Kurven                   | **R**                                                                                                                  | NRW EF; Bayern 12/13 (7 BE)                                                                                                                                                                                       |
| Hemmungstyp unterscheiden                                | Begriff aus geschlossenem Satz — **der Satz ist je Land anders**                                               | **C** (wo gelehrt)                                                                                                     | Niedersachsen EF; BW LF                                                                                                                                                                                           |
| Ablesewert aus Diagramm; Trend ableiten                  | Zahl mit Einheit / ein Satz                                                                                    | **C** / **R**                                                                                                          | **Brandenburg Jg. 7 bzw. 8**                                                                                                                                                                                      |
| **Messwerte in beschriftetes Diagramm eintragen**        | Achsen, Einheiten, Skalierung, Punkte (**8 BE**)                                                               | **R**                                                                                                                  | Bayern 12/13 gA                                                                                                                                                                                                   |
| **Toleranzkurve beschriftet skizzieren**                 | Minimum/Optimum/Maximum/Präferenzbereich (5 BE)                                                                | **R** — fester Labelsatz                                                                                               | Bayern gA + eA; NRW Q                                                                                                                                                                                             |
| Nahrungs-/Biomassepyramide; Stoffkreislauf schematisch   | beschriftete Pyramide / Schema mit Pfeilen                                                                     | **R**                                                                                                                  | Jgst. 10; **Stoffkreislauf in Niedersachsen nur eA**                                                                                                                                                              |
| **Aktionspotenzial: Werte ablesen, Phasen zuordnen**     | mV-/ms-Werte + Phasennamen                                                                                     | **C**                                                                                                                  | NRW Q                                                                                                                                                                                                             |
| Aktionspotenzial mit der Ionentheorie erklären           | mehrsätziger Erklärtext (8 BE)                                                                                 | **R**                                                                                                                  | Bayern 12/13 gA                                                                                                                                                                                                   |
| Synapsengift-Wirkmechanismus                             | Erklärtext zur Abbildung (4 BE)                                                                                | **R** — Wirkort + Schrittfolge                                                                                         | Bayern 12/13 gA                                                                                                                                                                                                   |
| **Homologie/Analogie entscheiden**                       | Entscheidung + Begründung Verwandtschaft vs. Konvergenz (6 BE)                                                 | **R** — gefragt ist die Begründung                                                                                     | Bayern 12/13 gA                                                                                                                                                                                                   |
| Verwandtschaftsgrad aus Sequenzvergleich                 | Rangordnung + begründete Zuordnung (5 BE)                                                                      | **C** — die Zahl abweichender Basen ordnet die Taxa                                                                    | Bayern gA; NRW Q                                                                                                                                                                                                  |
| **Stammbaum erstellen**                                  | verzweigter Baum, Taxa an Spitzen, abgeleitete Merkmale an Knoten                                              | **R**                                                                                                                  | **Niedersachsen nur eA**; Brandenburg 9/10                                                                                                                                                                        |
| Ethogramm / Verhaltensbeobachtung protokollieren         | Zeit-/Häufigkeitsprotokoll mit vorab definierten Kategorien                                                    | **R**                                                                                                                  | **Niedersachsen nur eA**                                                                                                                                                                                          |
| **Kosten-Nutzen-Analyse eines Verhaltens**               | Prosa, die jede Beobachtung Kosten oder Nutzen zuordnet (7 BE)                                                 | **R** — der amtliche Erwartungshorizont ist wörtlich eine **3-Punkt-Bulletliste**                                      | NRW Abitur GK                                                                                                                                                                                                     |
| **Experiment planen mit Variablenkontrolle**             | Fragestellung, Hypothese, unabhängige/abhängige/konstante Variablen, Ansätze inkl. Kontrolle, Messgröße (5 BE) | **R**                                                                                                                  | **NRW 5/6 (!)**; Niedersachsen bis Jg. 8 eigenständig                                                                                                                                                             |
| **Kontrollansatz identifizieren**                        | Benennung eines der vorgelegten Ansätze                                                                        | **C** — geschlossene Menge                                                                                             | Brandenburg Jg. 8/9; MSA bundesweit                                                                                                                                                                               |
| **Versuchsprotokoll**                                    | Fragestellung, Hypothese, Material, Durchführung, Beobachtung, Auswertung, Fehlerquellen                       | **R**                                                                                                                  | Niedersachsen bis Jg. 6 angeleitet → 8 eigenständig; NRW 5/6                                                                                                                                                      |
| **Fachpraktische Aufgabe (Abitur)**                      | selbst erhobene Daten + Dokumentation + Auswertung                                                             | **R**                                                                                                                  | **Niedersachsen: verpflichtend auf eA**; NRW optional (+60 min); **Berlin Biologie: keine**                                                                                                                       |
| Definition angeben                                       | 1–2 Sätze (**2 BE GK / 4 BE LK**)                                                                              | **R**                                                                                                                  | NRW Abitur GK und LK                                                                                                                                                                                              |
| Größenabschätzung am mikroskopischen Bild                | Zahl mit Einheit                                                                                               | **C** (Toleranz)                                                                                                       | Abitur AFB II                                                                                                                                                                                                     |
| Kriteriengeleiteter Vergleich                            | Vergleich, oft Tabelle mit Kriterienzeilen                                                                     | **R**                                                                                                                  | alle Stufen                                                                                                                                                                                                       |
| **beurteilen (Sachurteil)**                              | Absatz, an fachlichen Kriterien begründet                                                                      | **R**                                                                                                                  | Abitur. **In Bayern ist es das Unterscheidungsmerkmal gA ↔ eA**: _„Durch den Austausch des Operators ‚Beschreiben' im gA zu ‚Beurteilen' im eA wird eine komplexere und tiefere Auseinandersetzung … notwendig."_ |
| **bewerten / Stellung nehmen (Bioethik)**                | mehrabsätziger Argumentationstext mit expliziten Kriterien, Perspektivwechsel, begründetem Werturteil          | **H**                                                                                                                  | Abitur; NRW ab Kl. 5/6                                                                                                                                                                                            |
| Bioethik **mit vorgeschriebener Argumentzahl**           | **je ein** Pro- und Kontraargument + ethisches Urteil (6 BE)                                                   | **R** — die Gerüstvorgabe macht die Elemente zählbar                                                                   | Bayern 12/13 gA                                                                                                                                                                                                   |
| Diskutieren / Erörtern                                   | Text, der Argumente gegenüberstellt und abwägt (7 BE)                                                          | **H**                                                                                                                  | NRW Abitur LK                                                                                                                                                                                                     |
| Mehrseitiger argumentativer Text **ohne Material**       | —                                                                                                              | **existiert nicht** (NRW: _„Eine ausschließlich aufsatzartig zu bearbeitende Aufgabenstellung … ist nicht zulässig"_)  | —                                                                                                                                                                                                                 |

**Geprüfte Negativbefunde Biologie** — Begriffe, die in keiner Primärquelle vorkommen und deshalb
nicht als Aufgabenformen ins Produkt gehören: **Michaelis-Menten, Km, Vmax** (0 Treffer — NRW sagt
nur _„Enzyme: Kinetik"_; die naheliegende Rubrik „Sättigung + Km + Vmax" ist **nicht
lehrplanbelegt**) · **Oszilloskop** (0; es heißt _„Potenzialmessungen"_) · **Selektionstyp /
stabilisierend / disruptiv** (0) · **molekulare Uhr** (0) · **Ethogramm** (0; _„dokumentieren"_) ·
**Punnett** (0) · **Kontrollansatz** (0; _„Variablenkontrolle"_, Brandenburg _„Blindproben,
Parallelansätze, Wiederholungen"_) · **„Mendel"/„Kreuzungsschema"** nur Brandenburg und KMK MSA
2004 — **nicht** in NRW, Niedersachsen, KMK AHR 2020 oder Bayern Jg. 9 · **„beschriften" und
„mikroskopieren" sind in keiner Operatorenliste Operatoren**; die Beschriftungsaufgabe läuft unter
_benennen_ oder als Adjektiv in der Aufgabenstellung (_„Zeichnen Sie ein **beschriftetes**
Schema"_). _(Korrektur 02.10.2026: Kreuzungsschema, Kontrollansatz und Selektionsformen sind
Aufgabenformen; „0 Treffer" für einen Fachbegriff ist kein Ausschluss — §13.4.)_

---

## §5 Informatik

**Das einzige Fach dieses Berichts ohne KMK-Bildungsstandards und ohne IQB-Aufgabenpool** —
Leitdokument ist die **EPA Informatik (01.12.1989 i. d. F. 05.02.2004)**. Deshalb ist Informatik
maximal zersplittert. Die **GI-Bildungsstandards Sek I** wurden am **31.01.2025** neu gefasst
(ersetzen die Fassung von 2008) und nennen **weder Struktogramm noch PAP noch Klassendiagramm**
explizit, sondern _„geübte Modellierungstechnik"_; neu sind KI/ML, Kryptografie, Sensoren/Aktoren.

> **Der wichtigste Einzelbefund — und er dreht die Erwartung um: „Programm schreiben" ist im
> Abitur nicht computable.**
> **NRW:** _„Der Einsatz eines Computers ist für die Bearbeitung der Aufgaben **nicht
> vorgesehen**."_
> **Bayern** formuliert deshalb _„**Notieren** Sie … eine Implementierung"_ statt „Implementieren
> Sie".
> Die Prüfungsproduktform ist **handschriftlicher Quelltext** — also **R**, nicht C. Eine App, die
> nur Testfälle laufen lässt, übt am Prüfungsformat vorbei und trainiert die geforderte
> Lesbarkeit und Struktur nicht ein. Computable wird Programmieren nur im Übungskontext mit
> echter Ausführung.

### 5.1 Aufgabenformen (verdichtet)

| Gruppe                                        | Form → Eimer                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Programmieren**                             | Algorithmus blockbasiert/textbasiert implementieren → **C** (Testfälle) im Üben, **R** in der Prüfung · Methode, **die Rekursion anwenden muss** → **R** (Tests genügen nicht; der Rekursionsschritt ist Pflichtelement) · Fehlersuche/-korrektur → **C** · **Tracetabelle ausfüllen** → **C** (Niedersachsen Kl. 9/10 wörtlich) · Sortierverfahren händisch → **C** · Anzahl rekursiver Aufrufe → **C** · **Testfälle entwerfen** → **R** · Assembler/Registermaschine → **C** (Simulator) · **Prompt für ein generatives KI-System formulieren** → **H** (NRW ab 2027) |
| **Grafische Notationen**                      | **PAP · Struktogramm · Nassi-Shneiderman · Pseudocode** → **R** (NRW 5/6 wörtlich: _„überführen Handlungsvorschriften in einen Programmablaufplan (PAP) oder ein Struktogramm"_) · Struktogramm interpretieren (Ergebnis gefragt) → **C** · **Datenflussdiagramm mit „Verteiler"** (Bayern-Spezifikum) → **R**                                                                                                                                                                                                                                                           |
| **Objektorientierung/UML**                    | **Klassendiagramm · Implementationsdiagramm · Objektdiagramm · Sequenzdiagramm** → **R** · Klassendiagramm _lesen_ → **C** · **Entwurfsentscheidung begründen** → **H** · Klasse dokumentieren → **H**                                                                                                                                                                                                                                                                                                                                                                   |
| **Datenbanken**                               | **ER-Modell erstellen** (inkl. Kardinalitäten) → **R** · ER ↔ Relationenschema (beide Richtungen) → **R** · **Normalisierung 1./2./3. NF** → **R** (Zerlegung nicht eindeutig) · Primär-/Fremdschlüssel bestimmen → **C** · **SQL-Abfrage schreiben** → **C** (Ergebnismenge gegen Soll-Ergebnismenge vergleichbar) · Ergebnis einer gegebenen Abfrage → **C**                                                                                                                                                                                                           |
| **Automaten / formale Sprachen**              | **DEA · NEA · Kellerautomat entwickeln** → **C** gegen eine **Wortliste** (gegen eine Zieldarstellung nur R) · **Zustandstabelle ↔ Zustandsdiagramm** → **C** · akzeptierte Sprache bestimmen → **R** · **EBNF-Produktionsregeln** → **R** (Grammatik nicht eindeutig, erzeugte Sprache testbar) · **Ableitung für ein Wort** → **C** · **reguläre Ausdrücke** → **C** (Sprachäquivalenz entscheidbar) · **Chomsky-Typ** → **C** · Syntaxdiagramm → **R**                                                                                                                |
| **Codierung**                                 | dezimal ↔ binär · Einer-/Zweierkomplement · Zweierkomplement-Arithmetik · Codelänge/Anzahl Codewörter · **Lauflängencodierung** · **LZW** · Prüfsumme → **C** · **Huffman** → Baum **R** (nicht eindeutig), Codelänge und decodierter Text **C** · Hashfunktion/Kollisionen → **R**                                                                                                                                                                                                                                                                                      |
| **Laufzeit**                                  | **O-Notation angeben** → **C** (geschlossene Menge) · best/worst/average case → **R** · Zeitverhalten bei Verdopplung → **C** · **P/NP** → **R**                                                                                                                                                                                                                                                                                                                                                                                                                         |
| **Datenstrukturen**                           | **Binärbaum nach Einfügereihenfolge zeichnen** → **C** (eindeutig determiniert) · **In-/Pre-/Postorder** → **C** · Adjazenzmatrix/-liste · **Tiefen-/Breitensuche** · **Dijkstra händisch** · Kellerzustände → **C** · **Prim/Kruskal** → Gewicht **C**, Kantenmenge **R** · **Backtracking erläutern** → **R**                                                                                                                                                                                                                                                          |
| **Kryptographie**                             | **Caesar · monoalphabetisch · Häufigkeitsanalyse · Brute Force** → **C** · **Vigenère** am selbstgewählten Beispiel → **R** · symmetrisch vs. asymmetrisch vergleichen → **R** · Schutzziele am Beispiel erläutern → **R**                                                                                                                                                                                                                                                                                                                                               |
| **Rechner / Netze / Boolesche Algebra**       | **Von-Neumann-Rechner skizzieren · Befehlszyklus · Schichtenmodell** → **R** · **Subnetz/IP rechnen** → **C** · **Wahrheitstabelle · DNF · De Morgan** → **C** · **KV-Diagramm → Minimalform** → **R** (nicht eindeutig) · **Schaltnetz zeichnen · Halb-/Volladdierer** → **R**                                                                                                                                                                                                                                                                                          |
| **Theoretische Informatik / Betriebssysteme** | **Halteproblem-Argumentation prüfen/widerlegen** → **R** (**Bayern 2026 gA**, nicht nur LK) · **Turingmaschine angeben** → **C** (TM-Simulator) · **Verklemmung + Betriebsmittelgraph · Coffman-Bedingungen** → **R** · **Scheduling-Diagramm** → **C** · **Prolog-Anfrage** → **C**                                                                                                                                                                                                                                                                                     |
| **KI / ML (neu, stark wachsend)**             | **Forward Propagation rechnen** → **C** (Bayern Q gA) · **k-Means: Clusterzugehörigkeit rechnerisch nachweisen** → **C** · Lernart zuordnen → **C** · KNN-Schichten benennen/zeichnen → **R** · **Überanpassung/Datenqualität diagnostizieren** → **H** · KI-Modell nach Bias/Präzision/Spezifität bewerten → **R**                                                                                                                                                                                                                                                      |
| **Informatik, Mensch, Gesellschaft**          | **Datenschutz-Beurteilung** (DSGVO, _„Verbotsprinzip mit Erlaubnisvorbehalt"_) → **H** · gesellschaftliche Auswirkungen eines Algorithmus bewerten → **H** · **Code-Qualität/Lesbarkeit beurteilen** → **H** · Lizenzmodelle vergleichen → **R**                                                                                                                                                                                                                                                                                                                         |

### 5.2 Die Länderunterschiede sind hier maximal

**Programmiersprache — der stärkste Unterschied im ganzen Bericht:** **NRW schreibt Java
namentlich vor**, plus **SQL** — nicht im Kernlehrplan, sondern über die jährlichen
Abiturvorgaben (_„Syntax und Semantik einer Programmiersprache: − Java / − SQL"_, identisch in GK
und LK 2027/2028/2029), dazu veröffentlichte **Klassendokumentationen** (vorgegebene Klassen
`Stack, Queue, List, BinaryTree, BinarySearchTree`, LK zusätzlich `Graph, Vertex, Edge`).
**Bayern legt nichts fest — die Schule entscheidet:** auf dem Abitur-Deckblatt steht _„Der
Fachausschuss ergänzt im folgenden Feld die erlaubten objektorientierten Programmiersprachen:"_
(leeres Feld). **BW** legt nichts fest (Kl. 7 ausdrücklich blockbasiert, ab IMP Kl. 9 textuell).
**Niedersachsen legt bewusst nichts fest und standardisiert stattdessen die Notation** —
_„Aufgrund der großen Anzahl von Werkzeugen und Sprachen … ist es erforderlich für die zentrale
Abiturprüfung einheitliche **Darstellungsformen und Funktionsumfänge** festzulegen."_
**Berlin/Brandenburg** verlangt **im LK ein zweites Paradigma**: _„Applikative Programmierung
(funktional oder logisch)"_. Die **KMK-EPA** verlangt _„mindestens zwei Modellierungstechniken im
Grundkursfach und mindestens drei im Leistungskursfach"_.

**Laufende Reform (NRW, zum 01.08.2027):** die **neun Überprüfungsformen werden durch drei
Aufgabentypen ersetzt** — _Erläuterungs- und Darstellungsaufgaben · Konstruktionsaufgaben ·
Begründungs- und Bewertungsaufgaben_; neues Inhaltsfeld **„Künstliche Intelligenz und maschinelles
Lernen"** in EF, GK und LK, mit der Kompetenzerwartung _„formulieren Prompts für ein generatives
KI-System bei der Entwicklung von Quellcodes"_.
**Berlin hat keine zentralen Prüfungsschwerpunkte Informatik** (belegt durch Probe:
`ps_physik/chemie/biologie/mathematik_2026_*.pdf` → HTTP 200, `ps_informatik_2026_*.pdf` →
**HTTP 404**). **Bayern hat keine Operatorenliste Informatik** (ISB-Volltextsuche findet Listen
für andere Fächer, keine für Informatik). **NRW ist die einzige Liste mit AFB-_Bandbreiten_.**

---

## §6 Deutsch

> **Das Fach, in dem Buddy heute am meisten falsch macht** — und der Grund steht in einer Zahl:
> von den **sechs amtlichen Abitur-Aufgabenarten** sind **zwei rubric-checkable, eine gemischt,
> drei human-judgeable only — und keine einzige computable.**

**Strukturbefund: es gibt zwei Lehrplanfamilien.** **NRW und Bayern haben benannte Aufsatzformen
abgeschafft.** Im NRW-Kernlehrplan 2019 kommen „Inhaltsangabe", „Protokoll", „Erörterung",
„Vorgangsbeschreibung", „Diktat" und „Reimschema" **nicht vor**; statt dessen sechs Aufgabentypen,
und _„Für den Einsatz in schriftlichen Arbeiten kommen **ausschließlich** die Aufgabentypen in
Betracht"_:

> **Typ 1** Erzählendes · **Typ 2** Informierendes · **Typ 3** Argumentierendes · **Typ 4 a/b**
> Analysierendes · **Typ 5 Überarbeitendes** · **Typ 6 Produktionsorientiertes Schreiben**.
> Erprobungsstufe alle sechs; erste und zweite Stufe je Typen 2–6 inkl. 4a **und** 4b.
> _„Nur in begründeten Ausnahmefällen soll sich mehr als eine Klassenarbeit innerhalb eines
> Schuljahres auf denselben Aufgabentyp beziehen."_

**Niedersachsen, BW und Berlin/Brandenburg benennen die Formen dagegen namentlich** —
Niedersachsen mit einer Tabelle **obligatorischer vs. fakultativer** Formen pro Doppeljahrgang.
Für „typische Klassenarbeit" ist Niedersachsen die beste Grundlage.

**Diktat — gegenläufig, nicht abgeschafft:** **BW schreibt es vor** (NVO § 9 Abs. 2: eine von vier
Deutsch-Klassenarbeiten in Kl. 5–7 ist eine _Nachschrift_). **Bayern verbietet es** (GSO § 22
Abs. 1 S. 4) und hat das Verbot mit KMS vom **28.09.2026** ausgeweitet auf _„Diktate, grammatische
Übungen, Mitschriften, Lebenslauf und Bewerbung"_. **Niedersachsen, Berlin und Brandenburg
schweigen** (null Treffer in allen vollständig gelesenen Verordnungen). NRW: nur als Teilaufgabe.
Zugleich privilegieren **alle fünf Pläne und beide KMK-Fassungen das Korrigieren fremder
fehlerhafter Texte** und das individuelle Fehlerprofil gegenüber dem Nachschreiben; KMK 2022 nennt
stattdessen **„Rechtschreibgespräch, Interpunktionsgespräch"**.

### 6.1 Sek I — der große computable Bereich

Die beste aufgabenscharfe amtliche Fundstelle des ganzen Berichts sind Bayerns
Jahrgangsstufentests Deutsch (Jg. 6 und 8): **29 Einzelaufgaben, 27 davon maschinell
entscheidbar** — nur Jg.-6-Aufgabe 7 (eigener Satz mit Homonymen) und Jg.-8-Aufgabe 3 (Inhalt
sprachlicher Gestaltungsmittel) brauchen eine Kriterienprüfung.

| Bereich                              | Formen (alle **C**, sofern nicht anders vermerkt)                                                                                                                                                                                                                                                                                                                                                                               | Länderfalle                                                                                                                                                                                                                                                                                                                               |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Rechtschreibung / Zeichensetzung** | Diktat/Nachschrift · **Fehlertext korrigieren** (das von den Lehrplänen bevorzugte Format) · Lückentext · Groß-/Kleinschreibung · Kommas ergänzen/streichen · Getrennt-/Zusammenschreibung · Zeichensetzung beim Zitieren · Rechtschreibstrategie (Verlängern, Ableiten, Mehrzahlprobe)                                                                                                                                         | BW 9/10 verlangt zusätzlich, _zwingende vs. fakultative_ Kommasetzung zu **erläutern** → dort **R**                                                                                                                                                                                                                                       |
| **Grammatik**                        | Wortart · **Satzglieder** · Satzgliedproben · Satzart · Haupt-/Nebensatz · Adverbialsatz semantisch · Attribut · Tempusform · Kasus/Numerus/Genus · Aktiv→Passiv · Modus/Konjunktiv · direkte→indirekte Rede (**C mit Vorbehalt**: mehrere normkonforme Varianten müssen alle im Schlüssel stehen) · Imperativ · Wortbildung · Synonym/Antonym/Homonym (**C** oder **R**, je nach Antwortform) · Denotation/Konnotation (**R**) | s. §6.2                                                                                                                                                                                                                                                                                                                                   |
| **Lesen / Zuhören**                  | Multiple Choice · **Richtig/Falsch/nicht im Text** (die dritte Option ist das diagnostisch Entscheidende) · Zuordnung Kerngedanke ↔ Abschnitt · nichtlinearen Text auswerten · Hörverstehen bei geschlossenen Items · offene Frage mit Textbeleg (**R**) · Mitschrift zu Gehörtem (**R**)                                                                                                                                       | —                                                                                                                                                                                                                                                                                                                                         |
| **Gedicht**                          | **Reimschema bestimmen** (Buchstabenfolge) · **Stilmittel BENENNEN an gegebener Stelle** (Position vorgegeben + geschlossenes Labelset) · **Metrum bestimmen** (**C** bei regelmäßigem Vers, sonst **R**)                                                                                                                                                                                                                       | **Metrum ist die extremste Einzeldifferenz des Berichts:** BW/Niedersachsen/NRW nennen es in **Kl. 5/6** — **Brandenburg erst Niveaustufe H = Kl. 10** — **Bayern nennt es in 5–10 gar nicht**. Und **Bayern hat keine prüfbare Stilmittelliste** (_„auffällige sprachliche Mittel"_), während **Brandenburg die präziseste hat** (s. u.) |
| **Stilmittel DEUTEN**                | Mittel + Textstelle + Funktion                                                                                                                                                                                                                                                                                                                                                                                                  | **R** — die Dreiteilung ist amtlich; Brandenburg formuliert selbst nicht-eindeutig: _„rhetorische Mittel in ihrer **möglichen** Funktion … beschreiben"_                                                                                                                                                                                  |

**Brandenburgs Niveaustufen sind die beste Quelle für ein stufenweise wachsendes, geschlossenes
Label-Set** — als einziger Plan sagt er pro Stufe, welche Fachbegriffe gelten: **E** = Vergleich,
sprachliches Bild · **F (Kl. 8)** = rhetorische Figur, rhetorische Frage, Alliteration, Anapher,
Ellipse, Metapher, Symbol · **G** = Personifikation, Wort-/Satz-/Gedankenfiguren · **H** = Klimax,
Inversion, Neologismus, Parallelismus, Hyperbel, Ironie.

### 6.2 Die Satzgliedfalle — warum ein Schlüssel pro Land gebraucht wird

_„Am Montag schenkte Lena ihrem Bruder ein Buch."_ erzeugt **vier verschiedene erwartete
Lösungen**:

| Land                               | Erwartete Antwort                                                                                              |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| **NRW**                            | Subjekt, Objekt, Adverbial                                                                                     |
| **Bayern**                         | Subjekt, **Dativobjekt**, **Akkusativobjekt**, **Temporaladverbiale**                                          |
| **BW**                             | Subjekt, Objekt im Dativ, Objekt im Akkusativ, adverbiale Bestimmung — **plus Kasusangabe plus Felderanalyse** |
| **KMK-Primarliste** (Übergang 4→5) | nur **„Ergänzungen"**                                                                                          |

Und _„Geh nach Hause."_ = **Aufforderungssatz** (NRW/Niedersachsen/Brandenburg) vs.
**Verberstsatz** (BW). Das **Feldermodell** (Vorfeld/Satzklammer/Mittelfeld/Nachfeld) gibt es
**nur in BW** — in NRW, Bayern, Niedersachsen und Brandenburg fehlt es völlig.
→ Eine App, die „Satzglieder bestimmen" als eine Aufgabenform behandelt, markiert in mindestens
drei Ländern richtige Antworten als falsch.

### 6.3 Schreibformen Sek I

| Form                                                                         | Eimer                                       | Prüfbare Pflichtelemente                                                                                                                                                                                                                                                                                                           | Klasse                                                                                                                                             |
| ---------------------------------------------------------------------------- | ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Erzählung (Reizwort-, Bilder-, Erlebnis-)                                    | **H**                                       | Spannung/Perspektive sind graduell                                                                                                                                                                                                                                                                                                 | 5–7                                                                                                                                                |
| Nacherzählung                                                                | **R**                                       | Handlungsschritte vollständig + Reihenfolge + keine Zusätze                                                                                                                                                                                                                                                                        | 5/6                                                                                                                                                |
| Bericht                                                                      | **R**                                       | Ereignis, Beteiligte, Ort, Zeit, Verlauf, Folge; sachlich; keine Wertung                                                                                                                                                                                                                                                           | 5/6                                                                                                                                                |
| Vorgangs-/Personen-/Gegenstandsbeschreibung                                  | **R**                                       | Schrittfolge bzw. Merkmalkatalog + Gliederungsreihenfolge + Präsens                                                                                                                                                                                                                                                                | 5/6                                                                                                                                                |
| Bildbeschreibung                                                             | **R**                                       | Bildinhalt, -aufbau, Gestaltungsmittel — die drei Pflichtaspekte sind amtlich (BW 5/6)                                                                                                                                                                                                                                             | 5/6                                                                                                                                                |
| **Inhaltsangabe**                                                            | **R — der stärkste Fall im ganzen Bericht** | **Niedersachsen, Ende Jg. 8, wörtlich:** _„fassen den Inhalt von Texten zusammen, achten dabei auf einen **sachlichen Stil**, die Verwendung des **Präsens** und der **indirekten Rede** und nutzen **Sprechhandlungsverben**"_                                                                                                    | 7/8                                                                                                                                                |
| Persönlicher / formeller Brief                                               | **R**                                       | Formelemente als Checkliste; Register über Negativliste                                                                                                                                                                                                                                                                            | 5/6 bzw. **Brandenburg 5/6, NRW erst 7/8**                                                                                                         |
| Protokoll                                                                    | **R**                                       | formularartige Pflichtfelder                                                                                                                                                                                                                                                                                                       | 7/8. **NRW nennt es nicht**; Bayern schließt „Mitschriften" als Schulaufgabe aus                                                                   |
| Stellungnahme                                                                | **R**                                       | **Bayern D7:** _„formulieren Behauptungen, stützen sie mit Begründungen und veranschaulichen diese durch Beispiele"_ + _„bauen einen argumentierenden Text linear auf"_. **Niedersachsen Jg. 8:** _„stützen Thesen durch Argumente und Beispiele, formulieren mögliche Gegenargumente, verknüpfen Argumente in steigendem Aufbau"_ | 6–8                                                                                                                                                |
| Erörterung (linear / antithetisch)                                           | **H**                                       | nur die Hülle ist prüfbar                                                                                                                                                                                                                                                                                                          | **BW 7/8** — Niedersachsen/Bayern/Brandenburg erst Kl. 9                                                                                           |
| **Materialgestütztes Schreiben**                                             | **R**                                       | Materialnutzung, Kennzeichnung von Übernahmen, Zieltextsorte, Auswerten statt Analysieren                                                                                                                                                                                                                                          | **7–10 etabliert.** Bayern: _„spätestens ab Jgst. 8 entweder textbezogen oder materialgestützt"_; Materialrichtwerte Jg. 7 ≈ 3, 8/9 ≈ 4, 10/11 ≈ 5 |
| Textanalyse (pragmatisch)                                                    | **R**                                       | Inhalt, Aufbau, Sprache, Intention, Adressat                                                                                                                                                                                                                                                                                       | 10. **Bayern: „In der Jahrgangsstufe 10 muss die Auseinandersetzung mit einem pragmatischen Text als Schulaufgabenform angeboten werden."**        |
| Interpretation                                                               | **H**                                       | **Bayern-KMS:** _„plausible eigenständige Ansätze … sind zu honorieren, auch wenn sie von den Erwartungen der beurteilenden Lehrkraft abweichen … insbesondere für das Interpretieren literarischer Texte, die oft aufgrund der ihnen immanenten **Leerstellen** ein Spektrum von Deutungsmöglichkeiten zulassen"_                 | 9/10; **Niedersachsen schon 7/8 „mit Arbeitshinweisen"**                                                                                           |
| Charakterisierung                                                            | **R**                                       | Merkmalkategorien + Belegpflicht + Präsens                                                                                                                                                                                                                                                                                         | **BW/Brandenburg 7/8 — Niedersachsen erst 9/10, fakultativ**                                                                                       |
| Gestaltendes Schreiben (innerer Monolog, Tagebuch, Figurenbrief, Leerstelle) | **H**                                       | Konsistenz prüfbar, Qualität nicht                                                                                                                                                                                                                                                                                                 | **NRW Typ 6 in allen drei Stufen verpflichtend**                                                                                                   |
| **Kriteriengestützte Textüberarbeitung**                                     | **R**                                       | die eingebauten Mängel sind eine geschlossene Liste                                                                                                                                                                                                                                                                                | **NRW Typ 5, alle drei Stufen verpflichtend**                                                                                                      |
| Lebenslauf / Bewerbung                                                       | **R**                                       | Pflichtfelder + Formkonventionen                                                                                                                                                                                                                                                                                                   | 9/10. **Bayern schließt sie als Schulaufgabe aus**, verlangt sie inhaltlich                                                                        |
| Essay; Kommentar/Glosse/Rezension                                            | **H**                                       | —                                                                                                                                                                                                                                                                                                                                  | Bayern 10, BW 9/10, **Brandenburg erst Stufe H**; NRW/Niedersachsen nennen den Essay in Sek I nicht                                                |

**Drei Negativbefunde, die Rubriken betreffen:**

1. **Keine amtliche Wortzahl für irgendeine Schreibform.** Weder „ca. 150 Wörter" für die
   Inhaltsangabe noch Vergleichbares. Die einzige amtliche Aussage: Bayerns KMS erlaubt eine
   vorgegebene Wortzahl als **Steuerungsmittel der Lehrkraft**. **Jede Wortzahl in einer App ist
   Produktentscheidung, nicht Norm — und muss als solche gekennzeichnet werden.**
2. **„W-Fragen" und „Präteritum" beim Bericht stehen in keinem der fünf geprüften Lehrpläne** —
   Schulbuchkonvention. Amtlich ist das Tempus nur für die **Inhaltsangabe** (Präsens).
3. **„Exzerpt" kommt in keiner geprüften Primärquelle vor.** _(Korrektur 02.10.2026: Exzerpieren
   und der Bericht mit W-Fragen sind Aufgabenformen, §13.4.)_

### 6.4 Sek II — die sechs Aufgabenarten

**KMK, Bildungsstandards Deutsch für die Allgemeine Hochschulreife, 18.10.2012, Abschn. 3.2.1.1:**
_„Die in der folgenden Tabelle aufgeführten **sechs Aufgabenarten** stellen Grundmuster dar, die
miteinander kombinierbar sind."_

| Aufgabenart                                             | Amtliche Kernbestimmung (wörtlich, gekürzt)                                                                                                                                                                                                                                            | Eimer                                                  |
| ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| **Interpretation literarischer Texte**                  | _„vor dem Hintergrund der **Mehrdeutigkeit** literarischer Texte ein eigenständiges Textverständnis zu entfalten und textnah sowie plausibel zu begründen … **Eine bloße Paraphrasierung des Textes oder ein distanzloser Umgang mit dem Text entsprechen nicht den Anforderungen.**"_ | **H**                                                  |
| **Analyse pragmatischer Texte**                         | _„**Inhalt, Struktur und sprachliche Mittel unter Angabe konkreter Textstellen** so zu beschreiben, dass die Textentfaltung, die Argumentationsstrategie, die Intention … sichtbar werden"_                                                                                            | **R**                                                  |
| **Erörterung literarischer Texte**                      | _„argumentative Auseinandersetzung mit dem literarischen Text und den in ihm enthaltenen Herausforderungen und Fremdheitserfahrungen"_                                                                                                                                                 | **H**                                                  |
| **Erörterung pragmatischer Texte**                      | _„**nicht aber die detaillierte, umfassende Analyse** … **Voraussetzung ist, dass die Textvorlage etwas Strittiges behandelt und dies von den Prüflingen erkannt wird.**"_                                                                                                             | **H**                                                  |
| **Materialgestütztes Verfassen informierender Texte**   | _„Leser über einen Sachverhalt so zu informieren …, dass sie eine Vorstellung über seine wesentlichen Aspekte entwickeln können"_                                                                                                                                                      | **R**                                                  |
| **Materialgestütztes Verfassen argumentierender Texte** | _„zu strittigen oder erklärungsbedürftigen Fragen … differenzierte Argumentationen zu entwickeln"_                                                                                                                                                                                     | **R** (Form, Materialnutzung) + **H** (Positionierung) |

**Zwei amtliche Verbote, die eine App kennen muss:**

> _„**„Gestaltendes Schreiben" im Sinne fiktionalen Schreibens … entfällt als ausschließliche
> Aufgabenstellung in der schriftlichen Abiturprüfung.** … **Die Textvorlage darf dabei nicht als
> bloßer Auslöser eines subjektiven oder imitativen Schreibens fungieren.**"_
>
> **Die freie, problemerörternde Erörterung ohne Textvorlage existiert als Abitur-Aufgabenart
> nicht.** Alle sechs Aufgabenarten setzen eine Textvorlage oder ein Materialdossier voraus.
> (Geprüfter Negativbefund, keine Lücke.)

**Korrektur an einer verbreiteten Annahme:** die NRW-Aufgabenarten **„IA/IB/IIA/IIB/III/IV" sind
veraltet** (KLP 2014, bis Abitur 2025). Seit dem **KLP Sek II Deutsch vom 24.05.2023** (Abitur ab 2026) gibt es **vier Aufgabenarten mit acht Varianten** I a/b, II a/b, III a/b, IV a/b — und
„Interpretation" statt „Analyse" bei literarischen Texten, „pragmatische Texte" statt „Sachtexte".
**Bayern** prüft 2026 vier Formate und sagt ausdrücklich: **„Eine literarische Erörterung wird
nicht verlangt."** **BW** bindet Aufgabe I an eine Pflichtlektüre. **Wird die Aufgabenart vorher
bekannt gegeben? NRW: nein** (alle acht Varianten bleiben möglich). **Bayern und BW: ja.**

**Harte Querschnittsfakten:** **Vier Aufgaben, eine wird bearbeitet** (NRW, Bayern, BW, IQB-Pool
identisch) · **Arbeitszeit einschl. Auswahlzeit: gA/GK 255, eA/LK 315 Minuten** (Niedersachsen
abweichend: **270 / 210**) · Hilfsmittel: Rechtschreibwörterbuch + **unkommentierte gedruckte
Textausgaben der prüfungsrelevanten Lektüren** (Ausnahme: Bayerns Kolloquium — keine Lektüren) ·
**KMK-Beschluss 15.10.2020:** ab Abiturjahr 2023 müssen _„mindestens 50 Prozent der im
Landesabitur eingesetzten Aufgaben aus dem gemeinsamen Abituraufgabenpool … entnommen werden"_
und _„**Modifikationen der Aufgaben durch die Länder sind nicht mehr möglich**"_ — das erklärt die
Konvergenz · Textvorlagen zum textbezogenen Schreiben _„sollten ca. **1500 Wörter** nicht
überschreiten"_; Materialdossier **gA ca. 1500, eA ca. 2000 Wörter**, 5–7 Materialien ·
Zieltextumfang real **ca. 1000–1200 Wörter**.

**Gewichtung Inhalt : Darstellung — echte Länderdifferenz:**

| Land                   | textbezogen                                                   | materialgestützt |
| ---------------------- | ------------------------------------------------------------- | ---------------- |
| **NRW**                | **72 : 28** von 100 Punkten — **für jede Aufgabenart gleich** | 72 : 28          |
| **Bayern**             | ca. **70 : 30**                                               | **60 : 40**      |
| **Berlin/Brandenburg** | **70 : 30**                                                   | **60 : 40**      |

Und eine Regel, die jede App-Ausgabe betrifft (Berlin/Brandenburg): _„**Die Aufgabenbearbeitung
erfolgt durch das Verfassen eines kohärenten Textes … Die Ausführungen der Schülerinnen und
Schüler enthalten keine gliedernden Nummerierungen, auch wenn die Aufgabenstellung sie
vorgibt.**"_

**Drei Sätze, die jede Punkte-Engine begrenzen:**

> **Bayern, KMS Deutsch 29.06.2023:** _„Die alleinige Anwendung eines Korrekturbogens und die
> Einzelbewertung von Teilaspekten oder die **bloße Umrechnung von addierten Bewertungseinheiten
> in Noten** wird dem Schreibprodukt … **nicht gerecht**."_
>
> **NRW, Abiturverfügung 2026:** _„Die Abfolge der Kriterien im Bewertungsbogen … ist … **nicht
> zwingend**."_ → Ein Modell-Prüfer darf eine andere Reihenfolge nicht bestrafen.
>
> **NRW:** _„Für alle Korrekturen gilt der Grundsatz, dass **ein und derselbe Fehler nicht zu
> einer doppelten Abwertung führen darf**."_

---

## §7 Moderne Fremdsprachen

Englisch, Französisch, Spanisch, Italienisch, Russisch, Neugriechisch, Türkisch — NRW hat für sie
**ein** gemeinsames Klausurdokument (§7.1), und die Formen unterscheiden sich fast nur im Wortschatz.

**Rahmen:** KMK, _Bildungsstandards für die erste Fremdsprache_, 15.10.2004 u. 04.12.2003
**i. d. F. 22.06.2023** — und diese Fassung nennt **zwei** Niveaus: **ESA = A2, MSA = B1**, ohne
Unterscheidung zwischen Englisch und Französisch. Für die AHR: _Bildungsstandards für die
fortgeführte Fremdsprache_, 18.10.2012 — **B2**, _„in Englisch kann dieses Niveau in Teilbereichen
überschritten werden (C1)"_, **ohne GK/LK-Unterscheidung**.

**GER-Niveaus, belegte Länderdifferenzen** (Auswahl; vollständig in der Recherche):

|                                    | Ende Sek I                                                                                                              | Q-Phase GK                      | Q-Phase LK                                                                          |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------- | ----------------------------------------------------------------------------------- |
| **NRW Englisch**                   | **B1+**                                                                                                                 | B2 mit Anteilen C1 (rezeptiv)   | identisch                                                                           |
| **NRW Französisch 2. FS**          | **B1**                                                                                                                  | B2                              | B2 (wortgleich)                                                                     |
| **NRW Französisch neu einsetzend** | —                                                                                                                       | **B1 mit Anteilen B2** (EF: A2) | —                                                                                   |
| **BW Englisch (1. und 2. FS)**     | **B1, in Teilen B2**                                                                                                    | B2, in Teilen C1                | identisch                                                                           |
| **BW Französisch 2./3. FS**        | **B1+**                                                                                                                 | B2                              | B2                                                                                  |
| **Bayern Englisch**                | nicht ermittelt                                                                                                         | **B2/C1**                       | **C1** — **das einzige Land, das das Niveau nach Anforderungsniveau differenziert** |
| **Berlin/Brandenburg**             | Niveaustufe H = **B1+** (RLP) bzw. **B1** (Berliner Sek-I-VO) — **beide Fassungen sind amtlich und widersprechen sich** |                                 |                                                                                     |

→ **NRW und BW geben GK und LK dasselbe GER-Niveau.** Differenziert wird über _„die Komplexität
des Gegenstands, die Abstraktion der Inhalte, den Anspruch an die Beherrschung der Fachsprache und
Methoden sowie die Selbstständigkeit bei der Lösung der Aufgaben"_.

### 7.1 Die Klausuranatomie (NRW, _Klausuren in den modernen Fremdsprachen_, Stand 27.10.2025, gültig für EN/FR/IT/Neugriechisch/RU/ES/TR)

| Klausurteil                                | Punkte  | Inhalt : Darstellung                                                                             |
| ------------------------------------------ | ------- | ------------------------------------------------------------------------------------------------ |
| **Schreiben / Leseverstehen (integriert)** | **110** | **44 : 66** (66 = Kommunikative Textgestaltung 22 + Ausdrucksvermögen 22 + Sprachrichtigkeit 22) |
| **Sprachmittlung**                         | **50**  | **20 : 30**                                                                                      |
| **Hörverstehen**                           | **40**  | — (BE → Punkte über amtliche Tabelle)                                                            |

**Die Kombination HV + Sprachmittlung + Schreiben/LV = 200 Punkte ist _„in fortgeführten Kursen und
in Leistungskursen in der Klausur unter Abiturbedingungen (Q2.2) verpflichtend"_.**
Textvorlage Schreiben/LV im Abitur: GK neu einsetzend **max. 550**, GK fortgeführt **max. 800**, LK
**max. 1000** Wörter (**Russisch abweichend: 450 / 700 / 900**).

**Die dreiteilige Schreibaufgabe — die eigentliche Form:** Teilaufgabe 1 **Zusammenfassung**
(Schwerpunkt AFB I/II, ≈ 12 Punkte) → Teilaufgabe 2 **Analyse** (AFB II, ≈ 17) → Teilaufgabe 3
**produktiv-gestaltende oder kritisch-wertende Auseinandersetzung** (AFB II/III, ≈ 15), ab Q2.2 mit
Wahl zwischen den beiden. → **Eine Fremdsprachenklausur ist strukturell eine Dreischritt-Aufgabe
mit drei verschiedenen Eimern (R → R → H) in einem Text.**

### 7.2 Aufgabenformen

| Bereich                       | Formen                                                                                                                                                                                                                                                                                                                                                                                                                                       | Eimer                                                                                                                                                                                                                           |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Vokabeln / Wortschatz**     | Vokabeltest beide Richtungen · Vokabeltest im Kontext (Lücke) · Wortfamilie vervollständigen · Wortbildung mit Affix · **false friends** · **Collocation** (`make/do/take`)                                                                                                                                                                                                                                                                  | **C**                                                                                                                                                                                                                           |
|                               | Synonym/Antonym                                                                                                                                                                                                                                                                                                                                                                                                                              | **C** mit kuratiertem Accepted-Set, sonst **R**                                                                                                                                                                                 |
|                               | Ein Wort auf Englisch **paraphrasieren**; Wortfeld produzieren                                                                                                                                                                                                                                                                                                                                                                               | **R**                                                                                                                                                                                                                           |
|                               | Differenzierte Wortwahl im langen Text                                                                                                                                                                                                                                                                                                                                                                                                       | **H**                                                                                                                                                                                                                           |
| **Grammatik**                 | Lückentext mit eindeutiger Lösung · Einsetzübung mit Infinitiv · **simple past vs. present perfect** (das kanonische computable Item) · Conditionals 1/2/3 · Aktiv→Passiv · Reported speech · Gerund vs. infinitive · Fehlerkorrektur · Multiple Choice · Word order · Question tags, indirect questions · **FR/ES: Konjugation, Objektpronomen + Stellung, Accents setzen, Subjonctif-/Subjuntivo-Auslöser, ser/estar, por/para, si-Sätze** | **C**                                                                                                                                                                                                                           |
|                               | Sentence transformation mit Vorgabe                                                                                                                                                                                                                                                                                                                                                                                                          | **C** bei erzwungenem Ziel, sonst **R**                                                                                                                                                                                         |
|                               | Tempusnuance erklären („why present perfect here?")                                                                                                                                                                                                                                                                                                                                                                                          | **R**                                                                                                                                                                                                                           |
|                               | Grammatische Bandbreite im freien Text                                                                                                                                                                                                                                                                                                                                                                                                       | **H**                                                                                                                                                                                                                           |
| **Hörverstehen**              | Multiple choice (`tick`) · Zuordnung (`match`, immer ein Distraktor mehr als nötig) · `complete`/`fill in` (**1 bis 5 Wörter**, _„You need not write complete sentences"_) · `list`/`name` · gefüllte Tabelle                                                                                                                                                                                                                                | **C**                                                                                                                                                                                                                           |
|                               | Freie Notizen zum Hörtext                                                                                                                                                                                                                                                                                                                                                                                                                    | **H**, kein Prüfformat                                                                                                                                                                                                          |
| **Leseverstehen**             | `decide` (inkl. true/false und heading-matching), `give evidence`, `match`, `state`, `tick`                                                                                                                                                                                                                                                                                                                                                  | **C**                                                                                                                                                                                                                           |
| **Schreiben: Zieltextsorten** | Informal letter/e-mail · formal letter of application · letter to the editor · blog entry · article · report · review · speech · leaflet · diary entry · dialogue                                                                                                                                                                                                                                                                            | **R** (Pflichtelemente je Textsorte: Anrede/Schluss, Register, Headline/Lead, Publikumsanrede, Datum, 1. Person …)                                                                                                              |
|                               | **Summary**                                                                                                                                                                                                                                                                                                                                                                                                                                  | **R — der stärkste Fall:** keine Zitate; durchgehend Präsens; eigene Worte; keine eigene Meinung; keine direkte Rede; Einleitungssatz mit Textsorte/Autor/Titel/Thema; proportionale Abdeckung; keine Beispiele aus der Vorlage |
|                               | **Characterisation**                                                                                                                                                                                                                                                                                                                                                                                                                         | **R**: Präsens, Textbeleg mit Zeilenangabe pro Eigenschaft, Äußeres/Verhalten/Beziehungen/Entwicklung                                                                                                                           |
|                               | **Analysis**                                                                                                                                                                                                                                                                                                                                                                                                                                 | **R** strukturell, **H** qualitativ — und **BW hat die Analyseaspekte als geschlossene Liste** (s. u.)                                                                                                                          |
|                               | **Comment** · argumentative essay · creative writing / continuation                                                                                                                                                                                                                                                                                                                                                                          | **H**                                                                                                                                                                                                                           |
|                               | Inner monologue                                                                                                                                                                                                                                                                                                                                                                                                                              | **R** formal (1. Person, Präsens, kein Erzähler, Situationskonsistenz), **H** qualitativ                                                                                                                                        |
|                               | Diskontinuierliche Vorlage → Fließtext                                                                                                                                                                                                                                                                                                                                                                                                       | **R** (alle Datenpunkte referenziert, keine erfundenen Daten, korrektes Chart-Vokabular)                                                                                                                                        |
|                               | Text transformation (historisch→modern, Fach→Laie)                                                                                                                                                                                                                                                                                                                                                                                           | **H** — **nur erhöhtes Niveau**                                                                                                                                                                                                 |

**BWs geschlossene Liste der Analyseaspekte** (Facherlass 2026) — wertvoll, weil endlich:
_literarische Texte:_ **use of language** → choice of words, lexical fields, tone, stylistic
devices, syntactic patterns · **narrative techniques** → narrative situation, point of view, mode
of presentation, characterization, plot structure, time structure, setting. _Nicht-literarische
Texte:_ **structure** → line of argument, structural elements · **use of language** → + register ·
**communicative strategies** → forms of address, statistics, references, quotations, examples,
perspective (balanced/one-sided).

### 7.3 Vier Regeln, die eine App kodieren muss — und die Buddy heute verletzt

**(1) In Lese- und Hörverstehen darf Sprache nicht bewertet werden.** NRW Sek I, wörtlich:

> _„Bei der Bewertung der isolierten Überprüfung der Teilkompetenzen Leseverstehen und
> Hör-/Hörsehverstehen ist nur zu bewerten, ob die englischsprachige Lösung das richtige
> Verständnis des Textes nachweist; **sprachliche Verstöße werden nicht gewertet**."_

**(2) Richtig/Falsch ist für Hörverstehens-_Noten_ verboten** (NRW, wörtlich): _„**Nicht geeignet**
… sind • Richtig/Falsch-Aufgaben und Richtig/Falsch/Nicht-im-Text-Aufgaben • Sequenzierungsaufgaben
• Aufgabenformate, die eine Begründung erfordern … aus **testtheoretischen Gründen**."_ Im
_Leseverstehen_ ist Richtig/Falsch dagegen erlaubt (IQB 2027: `decide … true or false`).

**(3) Sprache wiegt mehr als Inhalt** — NRW Sek I: _„Bei der Bewertung kommt der sprachlichen
Leistung/Darstellungsleistung grundsätzlich ein **höheres Gewicht** zu als der inhaltlichen
Leistung."_ Quantifiziert **40 : 60**. Aber: **Sprachrichtigkeit ist ein Banddeskriptor, keine
Fehlerquote** — NRWs Orientierungshilfe beschreibt vier Bänder („In nahezu jedem Satz sind
lexikalische Verstöße feststellbar" … „Der gesamte Text ist nahezu frei von lexikalischen
Verstößen"). Und **IQB**: _„**Bandbreite** ist bei der Bewertung von Grammatik und Lexik der
ausschlaggebende Faktor, d. h. eine unzureichende Bandbreite kann **nicht** durch ein hohes Maß an
Korrektheit ausgeglichen werden."_ → **Fehlerzählen optimiert die falsche Größe.**

**(4) Isoliertes Vokabel- und Grammatiktesten ist ein Sek-I-Format, das in der Oberstufe
verschwindet.** In NRWs Oberstufen-Liste der Klausurteile (Schreiben/LV, Sprachmittlung,
Hörverstehen, Sprechen) kommt **„Verfügen über sprachliche Mittel" gar nicht mehr vor.** → Wer
einer Q2-Schülerin Lückentexte als _Abiturvorbereitung_ ausgibt, stellt die Prüfung falsch dar.

### 7.4 Sprachmittlung — die Pflichtkompetenz, und sie ist **keine** Übersetzung

**KMK (i. d. F. 22.06.2023):** _„Sprachmittlung besteht in der **adressaten-, situations- und
zweckangemessenen Übertragung** von Informationen aus einer Sprache A in eine Sprache B für andere
Personen, die anderenfalls keinen Zugang zu diesen Informationen hätten."_ Fünf unabhängige
Belege, dass es Mediation ist: **kein Operator `translate` in irgendeiner Liste der modernen
Fremdsprachen** · jede Sprachmittlungs-Operatordefinition trägt _„clarifying culture-related
aspects if necessary"_ · **NRW-Bewertungskriterium 6:** _„**löst sich vom Wortlaut des
Ausgangstextes** und formuliert eigenständig, ggf. unter Verwendung von Kompensationsstrategien"_
— das Sich-Lösen ist bepunktete Anforderung · Bayern stellt Englisch („Sprachmittlungsaufgabe")
gegen Latein/Griechisch („die Übersetzung einer Stelle eines Prosaschriftstellers") · **KMK AHR
2012:** _„Lyrische Texte und Texte mit ausgeprägtem stilistischem Anspruch sind als Vorlagen nicht
geeignet"_ — eine Übersetzungsaufgabe würde genau die suchen.

| Land               | Pflicht im schriftlichen Abitur                                                                                                                                            | Pflicht in Klausuren                                                                                                                                          | Richtung                                                                 |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| **NRW**            | **ja** — isolierter Teil, **max. 60 Min**, **50 von 200 Punkten**                                                                                                          | **ja**, in Q2.2 verpflichtend; Sek I mind. einmal pro Schuljahr                                                                                               | **DE → FS**                                                              |
| **Bayern**         | **ja** — eigener Prüfungsteil                                                                                                                                              | Schulaufgaben bereiten vor                                                                                                                                    | DE → FS                                                                  |
| **BW**             | **nein** (Abitur = Hörverstehen + Schreiben + Kommunikationsprüfung)                                                                                                       | **ja:** _„Eine der Klausuren in der Qualifikationsphase dient **ausschließlich** der Überprüfung der Sprachmittlungskompetenz … in der Regel **60 Minuten**"_ | DE → FS                                                                  |
| **Berlin, Hessen** | **nur Sprachmittlung, kein Hörverstehen** (Hessen: `grep -i "hörverstehen"` über den 90-seitigen Abiturerlass → **null Treffer**; Sprachmittlung ist _Pflichtvorschlag A_) | —                                                                                                                                                             | —                                                                        |
| **KMK AHR 2012**   | einer der wählbaren weiteren Prüfungsteile                                                                                                                                 | —                                                                                                                                                             | **beide Richtungen** + _„sukzessive Wiedergabe von mündlichen Aussagen"_ |

**Die Zieltext-Wortzahl ist nicht vorgeschrieben** — Bayern/ISB ausdrücklich: _„lediglich Angabe
der Länge des Ausgangstextes, aber **keine Angabe der Länge des Zieltextes**."_ Jede zirkulierende
„~150 Wörter"-Angabe ist Konvention.
**Eimer:** strukturell **R** (Adressat, Zweck, situativer Kontext, Zieltextformat, Inhaltspunkte,
Lösen vom Wortlaut sind prüfbar) — in der Gesamtqualität **H**.

### 7.5 Sprechprüfung

Die Rechtsgrundlagen und Zahlen stehen in §2.2. Für die Aufgabenform zählt die **Zweiteilung**:
Teil 1 **zusammenhängendes Sprechen** (materialgestützter Kurzvortrag, Notizen erlaubt, _„der
Vortrag sollte jedoch möglichst frei gehalten werden"_), Teil 2 **an Gesprächen teilnehmen**
(Rollenkarten, ~2 Min. Einlesezeit; die Prüfer greifen ein, _„falls das Gespräch ins Stocken
gerät"_). BW: Tandem ≥ 20 Min (5 monologisch + 10 dialogisch), 15 Min Vorbereitung, **ein- und
zweisprachiges Wörterbuch erlaubt — „Weitere Hilfsmittel sind nicht erlaubt."**
**Eimer: H.** Rubrik-prüfbar sind nur „geforderte Inhaltspunkte abgedeckt", Adressatenorientierung,
Struktur und bei `agree on` die Frage, ob eine Entscheidung erreicht und begründet wurde.

**Ein letzter Designbefund:** NRW formuliert die Operatorenlisten **in der Zielsprache** —
Französisch auf Französisch (`analyser`, `commenter`, `dégager`, `peser le pour et le contre`),
Spanisch auf Spanisch (`analizar`, `juzgar`, `retratar`), Russisch auf Russisch
(`аргументировать`, `обосновать`). → Eine App braucht pro Fach die **zielsprachliche**
Operatormenge, nicht eine Übersetzung.

---

## §8 Latein und Griechisch

**Latein und Griechisch sind nicht von den Bildungsstandards 2012 erfasst**, sondern weiterhin von
den **KMK-EPA**. Die Prüfung besteht immer aus **Übersetzung + aufgabengelenkter Interpretation**,
Gewichtung in NRW _„in der Regel **zwei zu eins**, mindestens aber eins zu eins"_, Noten
**gesondert ausgewiesen**. Textumfang **60 Wörter je Zeitstunde** (Griechisch: **65**),
Hilfenquote _„maximal 10 % (Prosatext) bzw. 15 % (poetischer Text)"_, der Text wird
**vorgelesen**, ein **zweisprachiges Wörterbuch** ist zugelassen. **Bayern schließt Dichtung für
den Übersetzungsteil aus** (_„Übersetzung einer Stelle eines **Prosaschriftstellers**"_) — NRW
lässt sie ausdrücklich zu. Das ist eine echte Produktdifferenz.

### 8.1 Es gibt keinen einheitlichen Fehlerquotienten — es gibt vier Systeme

| Land                   | System                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **NRW**                | **Schwellenregel, kein Fehlerquotient.** _„Ein Fehlerquotient wird nicht errechnet."_ Stattdessen: _„Die Note **ausreichend (05 Punkte)** wird erteilt, wenn der vorgelegte Text in seinem **Gesamtsinn und seiner Gesamtstruktur noch verstanden** ist. Davon kann in der Regel nicht mehr ausgegangen werden, wenn die Übersetzung auf je hundert Wörter mehr als **10 Fehler** aufweist."_ Zweite Schwelle: **ungenügend bei mehr als 15 Fehlern**. **Neuer Befund: der Kernlehrplan Latein vom 24.08.2026 (gültig ab SJ 2027/28) streicht „10 Fehler", „zwei zu eins" und „Fehlerrichtwerte" ersatzlos** (durch Volltextvergleich beider Fassungen verifiziert: alt 1–2 Treffer, neu 0). Übrig bleibt nur das holistische Kriterium **„Grad der Sinnentsprechung"**. |
| **Schleswig-Holstein** | **echter Fehlerquotient**, Tabelle „1 Fehler auf … Wörter": Note 1 > 150 · 2 = 149–100 · 3 = 99–70 · 4 = 69–40 · 5 = 39–20 · 6 = 19–0. Fehlerarten W (Wortbedeutung) · F (Form) · S (Satzbau/Sinn) · √ (Auslassung), vier Grade der Sinnabweichung. **Folgefehler:** _„Ist der neue Fehler **unvermeidlich**, liegt ein vollständiger Folgefehler vor. **Er wird nicht gewertet.**"_ **Pluspunkte:** _„Für besondere Übersetzungsleistungen werden Pluspunkte vergeben; sie wiegen in der Regel einen halben, bisweilen einen ganzen Fehler auf."_                                                                                                                                                                                                                       |
| **BW**                 | **Gewichtung nach Grad der Sinnentstellung:** **1 Fehler** = Konstruktionsfehler, falsche Beziehung, schwere Semantikverstöße · **½ Fehler** = Morphologie ohne wesentliche Sinnentstellung, leichte Syntax-/Semantikverstöße · **¼ Fehler** = Ausdrucksfehler im Deutschen, geringfügige Ungenauigkeiten. **Fehlernester:** _„ist zunächst die **Ursache** der einzelnen Fehler zu analysieren … sollen die einzelnen Verstöße **nicht in vollem Umfang** angerechnet werden."_ Folge- und Wiederholungsfehler _„bleiben in der Bewertung unberücksichtigt"_.                                                                                                                                                                                                           |
| **Bayern**             | **keine Fehlerregel in der GSO**, dafür eine harte Formatvorgabe: Übersetzung + _„**sechs (gA) bzw. acht (eA) Aufgaben**, die die Prüfungsteilnehmerin … **teilweise auswählt**"_; 240 / 300 Minuten.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |

### 8.2 Der Eimer-Entscheid für die Übersetzung — ausargumentiert

Drei Sätze entscheiden gegen jede Mechanik:

> **Schleswig-Holstein:** _„Es lassen sich **keine generellen Festlegungen** über die Gewichtung von
> Übersetzungsfehlern treffen. **Derselbe Fehler kann in unterschiedlichen Sinnzusammenhängen
> anders bewertet werden.**"_ Und: _„**Eine Übersetzung ist kein geeignetes Instrument, um
> Kenntnisse der lateinischen Grammatik abzuprüfen.**"_
> **BW:** _„Die Gewichtung der Fehler richtet sich grundsätzlich nach dem **Grad der
> Sinnentstellung**."_
> **NRW:** _„Die Bewertung der Übersetzungsleistung orientiert sich am … **Grad der
> Sinnentsprechung**."_

Der Fehlerquotient ist also **nicht** die Bewertungsregel, sondern eine Rechenoperation, die
**erst nach** einer menschlichen Gewichtung jedes Einzelfehlers läuft — und diese Gewichtung
verlangt: Grad der Sinnabweichung, Bedeutung des Worts für den Kontext, **Kausalanalyse von
Fehlerketten**, Unterscheidung vermeidbarer von unvermeidbaren Folgefehlern, Pluspunkte für
besondere Lösungen.

**Verdikt:**

- **Vollständige fortlaufende Übersetzung: H.** Mechanisch ist nur die letzte Division.
- **Einzelsatzübersetzung mit eng kontrollierter Grammatik: R.** Mehrere Wortlaute sind zulässig,
  aber Kasus, Tempus, Modus, Genus verbi, Zeitverhältnis und Konstruktion müssen stimmen — und
  genau dafür existieren amtliche Fehlerartcodes (`C`, `T`, `M`, `GV`, `ZV`, `K`), die ein Modell
  als Checkliste anwenden kann.
- **Formen- und Konstruktionsbestimmung: C.** (Formenlehre, Kasus, AcI, Abl. abs.,
  Partizipialkonstruktionen bestimmen.)

### 8.3 Weitere Formen

| Form                                                                     | Produkt                                                                                                    | Eimer                                                                                                                                                                                |
| ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Formenbestimmung, Formenbildung                                          | Form bzw. Label                                                                                            | **C**                                                                                                                                                                                |
| Kasus-/Konstruktionsbestimmung (AcI, Abl. abs., Partizipialkonstruktion) | Label + Textstelle                                                                                         | **C**                                                                                                                                                                                |
| Vokabeln (lat. → dt. und zurück)                                         | ein Wort                                                                                                   | **C**                                                                                                                                                                                |
| **metrisch analysieren**                                                 | _„einen Vers mit Symbolen für kurze und lange Silben sowie für Zäsuren darstellen"_ (NRW-Operator, AFB II) | **C** bei strukturierter Eingabe, sonst **R**                                                                                                                                        |
| **gliedern**                                                             | Sinnabschnitte + zusammenfassende Überschriften                                                            | **R**                                                                                                                                                                                |
| **paraphrasieren**                                                       | _„mit eigenen Worten den Textinhalt unter Wahrung der Informationsreihenfolge wiedergeben"_                | **R**                                                                                                                                                                                |
| **Texterschließung / Textvorerschließung**                               | Wortfelder, Konnektoren, Konstruktionen vor der Übersetzung                                                | **R** — **neu im KLP 2026 verpflichtend:** _„Aufgaben zur Texterschließung sind mit der Interpretation verknüpft und **mindestens einmal im Schuljahr** Bestandteil einer Klausur."_ |
| **übersetzen**                                                           | der vollständige deutsche Text                                                                             | **H** — und der Operator trägt **AFB III**                                                                                                                                           |
| Interpretation (3–5 Arbeitsaufträge)                                     | mehrteilige Analyse                                                                                        | **R** (Elemente) + **H** (Deutung)                                                                                                                                                   |
| mündliche Prüfung Latein                                                 | 20–30 Min, Prüfungstext **max. 55 Wörter**, 30 Min Vorbereitung, **Text wird nicht vorgelesen**            | **H** — und es gibt **keine „Sprechprüfung"** wie in den modernen Fremdsprachen                                                                                                      |

**Textschwierigkeit ist in NRW über sechs Dimensionen operationalisiert** — Wortschatz ·
Morphologie · Syntax · Inhalt/Abstraktionsgrad · gedankliche Struktur · Textpragmatik — jeweils pro
Kurstyp. Das ist die präziseste Schwierigkeitsdefinition im ganzen Bericht und wäre die natürliche
Grundlage für ein „etwas schwerer"-Signal (vgl. `DifficultyWish`, Issue #113).

---

## §9 Gesellschaftswissenschaften

**Für keines dieser Fächer gibt es KMK-Bildungsstandards, und der IQB-Aufgabenpool deckt keines
ab** (Pool = Deutsch, Mathematik, Englisch, Französisch seit 2017; Biologie, Chemie, Physik seit
2025). Nationale Referenz sind die **EPA**, und die Länder sagen selbst, dass sie weiter gelten:
Bayern (Stand März 2025) _„Die im Folgenden aufgelisteten Operatoren **entsprechen den EPA**"_;
Niedersachsens KC fußnotet _„vgl. Fachpräambel der EPA Geschichte"_. **Es gibt also keine nationale
Aufgabenbank zum Kalibrieren** — ein wichtiger Unterschied zu Mathematik und Deutsch.

### 9.1 Geschichte

**Die strukturierende Achse ist nicht das Thema, sondern Quelle vs. Darstellung.** KMK EPA
Geschichte, I.3.2.1: _„Die Unterscheidung der Aufgabenarten beruht auf der **fundamentalen
erkenntnistheoretischen Differenz zwischen Quellen und Darstellungen**."_ NRW reduziert die drei
EPA-Aufgabenarten auf zwei und **verbietet die Mischung**: _„**Aufgabentyp A** Interpretation
sprachlicher oder nichtsprachlicher historischer Quellen … **Aufgabentyp B** Analyse von
Darstellungen … **Eine Mischung der Aufgabentypen ist … nicht vorgesehen.**"_
**Vorsicht bei „Rede":** die EPA-Materialtabelle führt Reden unter _Darstellungen_, behandelt aber
Kennedys Berlin-Rede 1963 als _Quelle_. Auflösung nach der EPA-Epistemologie: eine zeitgenössische
Rede ist Quelle, eine retrospektiv deutende Rede ist Darstellung. **Nach Gattung allein darf nicht
klassifiziert werden** — eine App, die „Rede → Darstellung" hart verdrahtet, liegt in der Hälfte
der Fälle falsch.

| Aufgabenform                                                                                                 | Produkt                                             | Eimer                                                                                                                                     | Klassenstufe |
| ------------------------------------------------------------------------------------------------------------ | --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| Fachbegriff nennen; Begriff der richtigen Erklärung zuordnen                                                 | Begriff / Paar                                      | **C**                                                                                                                                     | 5/6–13       |
| Begriff definieren                                                                                           | 1–3 Sätze (Oberbegriff + Unterscheidungsmerkmale)   | **R**                                                                                                                                     | 7–13         |
| Datum nennen / Ereignis datieren; Ereignisse chronologisch ordnen; **Zeitleiste erstellen**; Epoche zuordnen | Datum / Folge / Positionen / Label                  | **C**                                                                                                                                     | 5/6–10       |
| **Quellenart/-gattung bestimmen**                                                                            | Kategorienlabel                                     | **C** — EPA AFB I wörtlich _„Bestimmen der Quellenart"_                                                                                   | 5/6–13       |
| **Quelle vs. Darstellung unterscheiden**                                                                     | Klassifikation + Begründung                         | **C** (Label) / **R** (Begründung)                                                                                                        | 5/6–13       |
| Dokument vs. Monument unterscheiden                                                                          | Klassifikation + Begründung                         | **R** — EPA ausdrücklich: _„kann im Einzelfall schwierig sein, sie hat aber immer einen heuristischen Wert"_                              | EF–Q2        |
| Geschichtskarte / Statistik / Diagramm auswerten                                                             | benannte Orte, Werte + Trendsatz                    | **C** (Werte) / **R** (Deutung)                                                                                                           | 5/6–13       |
| **Äußere Quellenkritik** (Autor, Textsorte, Datum, Adressat, Anlass)                                         | gefüllte Tabelle oder Einleitungssatz               | **R** — endliche Slotliste                                                                                                                | 7/8–13       |
| Innere Quellenkritik (Intention, Perspektive); Quelle in den Kontext einordnen                               | Absatz                                              | **R**                                                                                                                                     | 7/8–13       |
| **Vollständige Quelleninterpretation (Aufgabentyp A)**                                                       | mehrseitige Analyse                                 | **R** — EPA 3.2.2 nennt drei feste Schritte                                                                                               | EF–Q2        |
| **Karikaturanalyse** (Beschreibung → Deutung der Symbole → Intention)                                        | strukturierte Analyse                               | **R**                                                                                                                                     | 8–13         |
| **Plakatanalyse**                                                                                            | strukturierte Analyse                               | **R** — EPA-Aufgabenbeispiel 1.3.1 nennt vier Schritte wörtlich                                                                           | 9–13         |
| Historiengemälde / Fotografie / Rede / Tondokument / gegenständliche Quelle analysieren                      | strukturierte Analyse                               | **R**                                                                                                                                     | 7/8–13       |
| **Darstellungsanalyse (Aufgabentyp B)**                                                                      | mehrseitige Analyse                                 | **R**                                                                                                                                     | EF–Q2        |
| Vergleich zweier Positionen/Deutungen; Multiperspektivität                                                   | Tabelle oder Essay                                  | **R**                                                                                                                                     | 9–13         |
| Längsschnitt / Querschnitt / Vergleich / Fallanalyse                                                         | Essay                                               | **R**                                                                                                                                     | 7/8–13       |
| Hypothese bilden / überprüfen; Fragen an die Geschichte formulieren                                          | Hypothesensatz / Essay / Fragen                     | **R**                                                                                                                                     | 5/6–13       |
| **Sachurteil formulieren**                                                                                   | Absatz mit expliziten Kriterien                     | **R** — die Gütekriterien sind amtlich benannt (s. u.)                                                                                    | 9–13         |
| **Werturteil formulieren**                                                                                   | Absatz mit offengelegten Wertmaßstäben              | **H** — „reflektiert" ist selbst ein Qualitätsurteil                                                                                      | 9–13         |
| Erörterung                                                                                                   | mehrseitiger Essay                                  | **H**                                                                                                                                     | 10–13        |
| **Historische Narration verfassen**                                                                          | eigener Text; Kriterium **„narrative Triftigkeit"** | **H**                                                                                                                                     | 7/8–13       |
| Geschichts-/Erinnerungskultur analysieren                                                                    | Essay/Präsentation                                  | **R** — Brandenburg benennt die Kriterien (_„Genre, Absicht, Zielgruppe"_; _„zwischen historisch Belegtem und Erfundenem unterscheiden"_) | 7–13         |
| Textformat-Transfer (Rede, Leserbrief, Diskussionsbeitrag)                                                   | Text im vorgegebenen Genre                          | **R**                                                                                                                                     | Q1/Q2        |
| Zitate formal korrekt belegen                                                                                | Zitatzeichenkette                                   | **C**                                                                                                                                     | 9/10         |
| Interview/Zeitzeugengespräch planen, durchführen, auswerten                                                  | Protokoll + Auswertung                              | **R**                                                                                                                                     | 9/10         |
| Fiktiven historischen Text verfassen                                                                         | kreativer Text + Stimmigkeitsprüfung                | **H**                                                                                                                                     | 7/8–12       |
| Referat; kontroverse Diskussion / Rollenspiel; Plakat/Flyer/Erklärvideo                                      | Vortrag / Performance / Artefakt                    | **H**                                                                                                                                     | 5/6–13       |

**Sachurteil und Werturteil — wörtlich, weil hier die Eimergrenze verläuft.** KMK EPA Geschichte,
I.1.1: _„**Gelungene Sachurteile** weisen sich durch **sachliche Angemessenheit, innere Stimmigkeit
und ausreichende Triftigkeit von Argumenten** aus. Darüber hinaus werden beim **Werturteil**
ethische, moralische und normative Kategorien auf historische Sachverhalte angewendet und **eigene
Wertmaßstäbe reflektiert**."_ In den Operatoren verankert (NRW, Bayern, Niedersachsen, BW einig):
`beurteilen` = _„… um **ohne persönlichen Wertebezug** zu einem begründeten **Sachurteil** zu
gelangen"_; `bewerten` = _„wie ‚beurteilen', aber zusätzlich mit Offenlegen und Begründen eigener
Wertmaßstäbe … zu einem **Werturteil**, das auf den Wertvorstellungen des **Grundgesetzes**
basiert"_.
**Wichtig und oft verwechselt: Sachurteil/Werturteil ≠ Sach-/Urteilskompetenz.** Das Urteilspaar
ist über die Länder nahezu stabil; die Kompetenzbereichsnamen sind es überhaupt nicht (**BW hat
keine Urteilskompetenz**, sondern Frage-/Methoden-/**Reflexions**-/Orientierungs-/Sachkompetenz;
**Niedersachsen** hat „Deutung und Reflexion"; **Brandenburg GOST 2025** bündelt alles unter
_„Reflektiertes historisches Erzählen (Narrative Kompetenz)"_). → **Rubriken an
Sachurteil/Werturteil und an die Operatoren binden, nie an Kompetenzbereichsnamen.**

**Zwei NRW-Nebenbedingungen mit App-Relevanz:** _„in der Abiturprüfung im Fach Geschichte ist
**zurzeit die Vorlage von Bildquellen in Farbe nicht vorgesehen**"_; Gesamtpunktzahl **100 Punkte**
inkl. Darstellungsleistung.

### 9.2 Geographie / Erdkunde

**Das Fach mit dem größten computable-Kern des ganzen Berichts** — und zugleich mit zwei Fallen.

| Aufgabenform                                                             | Produkt                                                     | Eimer                                                                                                                                         | Klassenstufe                                                                                                 |
| ------------------------------------------------------------------------ | ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Maßstab umrechnen, Distanzen berechnen                                   | Zahl mit Einheit                                            | **C**                                                                                                                                         | 5                                                                                                            |
| Lage im Gradnetz ablesen/angeben                                         | zwei Zahlen (°N/S, °E/W)                                    | **C**                                                                                                                                         | 5–6                                                                                                          |
| Höhendifferenz aus Höhenlinien; Zeitzonen/Zeitverschiebung               | Zahl / Uhrzeit                                              | **C**                                                                                                                                         | 5–7                                                                                                          |
| Niederschlagssumme, Jahresamplitude, Mitteltemperatur                    | Zahlen                                                      | **C** — **NRW lässt für das Abitur WTR oder CAS/MMS zu**, das stärkste institutionelle Indiz, dass Rechnen Teil des schriftlichen Abiturs ist | 7–10/EF                                                                                                      |
| Topographisches Objekt lokalisieren                                      | Markierung/Name                                             | **C**                                                                                                                                         | 5–10                                                                                                         |
| Land ↔ Entwicklungsindikator zuordnen (HDI, BNE …)                       | Paar/Rangliste                                              | **C**                                                                                                                                         | 9–10                                                                                                         |
| **Klimadaten einer Klimazone zuordnen**                                  | Klimazonen-/Klimatyplabel                                   | **C — aber nur bei fixierter Klassifikation** (BW sagt selbst _„entsprechend der **verwendeten** Klimaklassifikation"_)                       | 10                                                                                                           |
| Bevölkerungspyramide einem Typ zuordnen (Pyramide/Glocke/Urne/Zwiebel)   | Typlabel                                                    | **C**                                                                                                                                         | 10–12                                                                                                        |
| **Modellphase bestimmen** (Demographischer Übergang)                     | Phasennummer                                                | **C** — Schwellenregel über zwei Datenreihen                                                                                                  | 10–12                                                                                                        |
| Dreiecksdiagramm ablesen                                                 | drei Prozentwerte / ein Punkt                               | **C** — Baryzentrik, exakt                                                                                                                    | 11–12                                                                                                        |
| **Klimadiagramm zeichnen**                                               | Achsen, Temperaturkurve, Niederschlagssäulen, Beschriftung  | **R**                                                                                                                                         | **Bayern 7**                                                                                                 |
| Klimadiagramm auswerten                                                  | Werte **C** + Deutung **R**                                 |                                                                                                                                               | 7–12                                                                                                         |
| Thematische / topographische Karte auswerten                             | Absatz; Einzelwerte                                         | **R** (Thema, Legende, Muster, Extremwerte, Erklärung) / **C** (Einzelablesung)                                                               | 5–12                                                                                                         |
| **Kartenkritik / kritische Kartographie**                                | Absatz mit benannten Manipulationsmitteln                   | **R** — geschlossene Liste (_„Farbwahl, Akzentuierung"_)                                                                                      | 9–12                                                                                                         |
| Atlasarbeit (Register/Planquadrat)                                       | Seite + Planquadrat                                         | **C, aber auflagengebunden** — NRWs Hilfsmittelregel verlangt _„für alle Schülerinnen und Schüler in derselben **Auflage**"_                  | 5–6                                                                                                          |
| Lagebeschreibung in Prosa                                                | 2–4 Sätze mit Pflichtslots                                  | **R** — _nicht_ C                                                                                                                             | 5–8                                                                                                          |
| Luftbild-/Satellitenbild-, Blockbildauswertung                           | beschriftete Skizze + Absatz                                | **R**                                                                                                                                         | 7–12                                                                                                         |
| Kartenskizze / thematische Karte zeichnen                                | Umriss, Signaturen, Legende, Titel, Nordpfeil, Maßstab      | **R** (Elementcheck), Geometrie teils **C**                                                                                                   | 5–12                                                                                                         |
| **Profilschnitt zeichnen**                                               | x = Entfernung, y = Höhe, überhöht, beschriftet             | Einzelablesungen **C**, Kurve/Überhöhung/Beschriftung **R**                                                                                   | **Bayern 5** – 12                                                                                            |
| **Kausal-/Klimaprofil**                                                  | mehrschichtiges Profil                                      | **R** — Pflichtschichten + vertikale Entsprechung                                                                                             | 10–11                                                                                                        |
| Bodenprofil erstellen                                                    | Horizontfolge (O, A, B, C)                                  | Reihenfolge **C**, Rest **R**                                                                                                                 | 11–12                                                                                                        |
| Diagramm aus Tabellendaten erstellen                                     | Diagramm mit Achsen, Einheiten, Legende, Titel              | **C** bei strukturierter Eingabe, **R** handgezeichnet                                                                                        | 5 → 10 (Brandenburg gestaffelt: eindimensional → mehrdimensional/Kreis → Dreieck/Netz)                       |
| Darstellungsform umwandeln (Zahlen → Karte/Diagramm)                     | die neue Darstellung                                        | **C** bei Struktur                                                                                                                            | 7–10                                                                                                         |
| Modell wiedergeben / Modellskizze                                        | beschriftete Modellskizze                                   | **R**                                                                                                                                         | 9–12                                                                                                         |
| **Modell an einem Raumbeispiel überprüfen**                              | Absatz: welche Modellelemente passen, welche nicht          | **R** — geschlossene Elementmenge                                                                                                             | 10–12                                                                                                        |
| Aussagekraft/Grenzen eines Modells beurteilen                            | Essay                                                       | **H**                                                                                                                                         | 11–12                                                                                                        |
| **Wirkungsgefüge / Fließschema / Kausalkette**                           | gerichteter Graph: Knoten + vorzeichenbehaftete Kanten      | **R** — Pflichtknoten/-kanten endlich, Wortlaut frei                                                                                          | 9–12                                                                                                         |
| Plattentektonik anwenden                                                 | Plattengrenztyp **C** + Prozess **R**                       |                                                                                                                                               | 7–8, 11                                                                                                      |
| **Fragengeleitete Raumanalyse**                                          | mehrseitige Analyse                                         | **H** mit **R**-Vollständigkeitsschicht                                                                                                       | **NRW 9/10 (MK13)**; 11–12                                                                                   |
| Naturraumanalyse, SWOT-Analyse                                           | Geofaktoren-Analyse; 4-Quadranten-Matrix                    | **R**                                                                                                                                         | 11–12 (Brandenburg **verpflichtend**)                                                                        |
| Kartierung; Befragung; Erkundungs-/Exkursionsprotokoll; Exkursion planen | legendierte Feldkarte / Fragebogen / Protokoll / Routenplan | **R** (Instrument) / **H** (Deutung)                                                                                                          | 5–12                                                                                                         |
| Messung / Experiment (klima-, bodenkundlich)                             | Messreihe + Protokoll                                       | **C** (Zahlen) / **R** (Protokoll)                                                                                                            | Bayern 5 und 10                                                                                              |
| **WebGIS-Analyse**                                                       | Abfrageergebnis                                             | **C** — deterministisch                                                                                                                       | **NRW 7–10 (MK12)**                                                                                          |
| Raumnutzungskonflikt bewerten; Rollen-/Planspiel; Mystery                | Essay / Performance                                         | **H**                                                                                                                                         | 5–12                                                                                                         |
| **Materialgebundene Problemerörterung mit Raumbezug**                    | mehrteilige Klausur                                         | **H** mit **R**-Schichten                                                                                                                     | **die Abiturform** — EPA 3.2: _„Die Aufgabenart ist die materialgebundene Problemerörterung mit Raumbezug."_ |

**„Atlasarbeit ist rein berechenbar" ist falsch — sie teilt sich dreifach:** (1) _rein berechenbar:_
„Wo liegt X?", „Trage X ein", „Lage im Gradnetz", „Ordne X einer Klimazone zu" — Ground truth =
Gazetteer + Zonenpolygone; (2) _berechenbar, aber nicht portabel:_ Register-/Planquadrataufgaben
sind Eigenschaft **einer** Atlasauflage; (3) _gar nicht berechenbar:_ die Prosa-Lagebeschreibung und
der Reflexionsstrang _„Fähigkeit zur Reflexion von Raumwahrnehmung und -konstruktion"_ (mental
maps).

**Raumanalyse — was tatsächlich vorgeschrieben ist.** **NRWs Oberstufenplan schreibt keine
Raumanalyse-Struktur vor** (das Wort kommt in keiner der beiden NRW-SII-Fassungen vor); in NRW ist
es eine **Sek-I**-Kompetenz. **Niedersachsen ist das einzige Land mit echter Strukturvorgabe — die
„Vier Blicke"**: der Raum als „Container" · der Raum in seiner Beziehung zu anderen Räumen · der
Raum in der Wahrnehmung einzelner Personen · der Raum in seiner Darstellung durch Medien und
Institutionen. Und: _„Die Entscheidung für die Raumperspektiven ist abhängig von der leitenden
Fragestellung."_ **Berlin/Brandenburg GOST ist das einzige Dokument im Korpus, das Methoden
verbindlich macht:** _„Folgende Methoden gelten als verpflichtend: Naturraumanalyse, SWOT-Analyse,
analoge und digitale Kartenerstellung und -auswertung, Quellenanalyse unterschiedlicher medialer
Darstellungsformen, Erstellung von Wirkungsgefügen und Modellskizzen, Anwendung und Überprüfung von
Modellen und Theorien an konkreten Raumbeispielen, Plan- oder Rollenspiele."_

**NRWs vier Überprüfungsformen lassen sich fast 1 : 1 auf die Eimer abbilden** —
Darstellungsaufgabe → **C/R** · Analyseaufgabe → **R** · Erörterungsaufgabe → **H** ·
Handlungsaufgabe → **H** (+ R-Protokollschicht). Und NRWs neuer SII-Plan (24.08.2026) enthält eine
für eine Lern-App bemerkenswerte Zeile: _„Sie können Schülerinnen und Schülern auch die Möglichkeit
bieten, **generative Assistenzsysteme (KI)** unter Beachtung von kritischer Reflexion und
Metakognition zu nutzen."_

### 9.3 Politik / Sozialwissenschaften / Wirtschaft / Recht

| Aufgabenform                                                                 | Produkt                                                                   | Eimer                                                                                                                                                                                                                                      | Klassenstufe                                                                                        |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| Fachbegriff nennen                                                           | Begriff / unkommentierte Liste                                            | **C**                                                                                                                                                                                                                                      | 5–13                                                                                                |
| **Verfassungsorgan ↔ Kompetenz zuordnen**                                    | Organname je Kompetenz / Tabelle                                          | **C** — endliche Menge (BT, BR, BReg, BPräs, BVerfG), GG-fixe Kompetenzen                                                                                                                                                                  | 9–10, wieder EF                                                                                     |
| **Gang der Gesetzgebung als geordnete Schrittliste**                         | geordnete Liste                                                           | **C** — BW druckt die kanonische Reihenfolge ab: _„Gesetzesinitiative, Lesung, Beratung in Ausschüssen, Abstimmung im Bundestag, Beratung und Abstimmung im Bundesrat, Vermittlungsausschuss, Unterzeichnung durch den Bundespräsidenten"_ | 9–10                                                                                                |
| Einspruchs- vs. Zustimmungsgesetz unterscheiden                              | binäres Label + BR-Rolle                                                  | **C** (Label) / **R** (Begründung)                                                                                                                                                                                                         | 10/EF. **Achtung: BW sagt „einfache und zustimmungspflichtige Gesetze", nicht „Einspruchsgesetze"** |
| Gesetzgebungsverfahren rekonstruieren                                        | mehrseitige Rekonstruktion                                                | **R** — endliche Pflichtelemente                                                                                                                                                                                                           | 10–13                                                                                               |
| Wahlsystem beschreiben (Erst-/Zweitstimme, Direktmandat, Sperrklausel)       | beschriftete Beschreibung                                                 | **C** auf Begriffsebene                                                                                                                                                                                                                    | 9–10                                                                                                |
| Wahlsystem bewerten / mit Mehrheitswahl vergleichen                          | Vergleich mit Kriterien (Legitimation, Repräsentation, Regierungsbildung) | **R** → **H** beim Werturteil                                                                                                                                                                                                              | 11–13                                                                                               |
| Statistik/Schaubild auswerten                                                | Quelle, Darstellungsart, Extremwerte, Trend, Gesamtaussage                | **R** — `auswerten` = _„Daten oder Einzelergebnisse zu einer abschließenden Gesamtaussage zusammenführen"_                                                                                                                                 | 7–13                                                                                                |
| **Statistik auf Aussagekraft prüfen**                                        | methodische Pro/Contra-Liste + Fazit                                      | **R** — Bayerns Erwartungshorizont listet die Pflichteinwände: _„missverständliche Illustration", „Fremdeinschätzung statt Selbstauskunft", „geringe Datenbasis bzw. keine absoluten Zahlen", „Möglichkeit der Mehrfachnennung"_           | 12–13                                                                                               |
| Karikaturanalyse                                                             | Beschreibung → Deutung der Symbole → Intention                            | **R**                                                                                                                                                                                                                                      | 7–13                                                                                                |
| Karikatur selbst entwerfen                                                   | gezeichnete Karikatur                                                     | **H**                                                                                                                                                                                                                                      | 10–13                                                                                               |
| **Kategoriale Fallanalyse**                                                  | mehrseitige, kategoriengegliederte Analyse                                | **R** — **das Kategorienraster _ist_ die Rubrik**                                                                                                                                                                                          | 8–13                                                                                                |
| **Politikzyklus anwenden**                                                   | gefülltes 5-Phasen-Schema                                                 | **C** (Phasenzuordnung) / **R** (Füllung)                                                                                                                                                                                                  | 8–13                                                                                                |
| Wirtschaftsmodelle rechnen (Angebot/Nachfrage, Kreislauf, magisches Viereck) | Zahlen / Diagramm                                                         | **C** — **aber nur dort, wo _Wirtschaft (und Recht)_ ein eigenes Fach ist**                                                                                                                                                                | 10–13                                                                                               |
| Positionen gegenüberstellen; Pro-Contra-Debatte                              | Tabelle / Wortmeldung                                                     | **R** / **H**                                                                                                                                                                                                                              | 8–13                                                                                                |
| **Politische Urteilsbildung** (Sach- und Werturteil)                         | Absatz                                                                    | **R** (Sachurteil) / **H** (Werturteil) — **und hier greift die GPJE-Grenze aus §0.2**                                                                                                                                                     | 9–13                                                                                                |
| **Fallbegutachtung im Gutachtenstil** (Fach Recht)                           | Obersatz → Definition → Subsumtion → Ergebnis                             | Normzerlegung in Tatbestandsmerkmale/Rechtsfolge **C** · Matching Merkmal ↔ Sachverhaltselement **C** · die Gesamtgliederung **R** (_das Prüfschema ist die Rubrik_) · Auslegung unbestimmter Rechtsbegriffe **H**                         | Q                                                                                                   |

**Der maschinennächste Operator des ganzen Berichts** steht in NRWs Fach _Recht_:
**`subsumieren` (AFB II) = \*„**anhand eines vorgegebenen Schemas** prüfen, ob ein Sachverhalt unter
eine (Rechts-)Norm fällt"\*** — _anhand eines vorgegebenen Schemas_ ist genau der prüfbare Teil. Und
die EPA Recht nennt `prüfen im Gutachtenstil` = _„Aufwerfen der Fallfrage (**‚Wer will was von wem
woraus?'**), dabei Nennen der Anspruchsgrundlage und systematisches Prüfen der Tatbestandsmerkmale
und Subsumtion."_

**Fächernamen in dieser Familie** (eine App darf sie nicht vereinheitlichen): NRW
**Sozialwissenschaften** / **Wirtschaft-Politik** (Sek I) · Bayern **Politik und Gesellschaft** +
**Wirtschaft und Recht** · BW **Gemeinschaftskunde** + **Wirtschaft** · Niedersachsen **Politik-
Wirtschaft** · Sachsen **Gemeinschaftskunde/Rechtserziehung/Wirtschaft** · Thüringen **Wirtschaft
und Recht** · Sachsen-Anhalt **Rechtskunde** (Jg. 9). **NRW hat zusätzlich Erziehungswissenschaft,
Psychologie und Recht als vollwertige Oberstufenfächer mit Zentralabitur** (Kernlehrplan,
Operatorenliste, Konstruktionsvorgaben, jährliche Abiturvorgaben 2027–2029) — in Niedersachsen
existieren Psychologie und Recht dagegen **nur per EPA, ohne Kerncurriculum**, und Pädagogik nur am
beruflichen Gymnasium.

**Psychologie liefert die beste fertige Slotliste des Berichts** — NRW-Operator `analysieren`
(AFB II): _„… z. B. bei Experimenten/Studien: **Forschungsbereich, Problemfeld, Hypothesen,
Variablen, Operationalisierung, Durchführung, Design, Ergebnisse, Messverfahren, Auswertung**"_; und
`beurteilen`/`bewerten` (AFB III): _„ein an Kriterien (z. B. **Objektivität, Reliabilität, interne
Validität, Generalisierbarkeit**) orientiertes Sach- oder Werturteil"_.

---

## §10 Religion/Ethik/Philosophie · Kunst · Musik · Sport

### 10.1 Religion, Ethik, Philosophie

**Ein Befund, der Arbeit spart:** NRWs fünf Religionslehre-Operatorenlisten (katholisch,
evangelisch, jüdisch, orthodox, islamisch) sind **byteweise identisch** (per `diff` geprüft, null
Differenzzeilen) — nur der Fachname unterscheidet sich. **NRW Sek I heißt das Fach „Praktische
Philosophie"** (neuer KLP ab 2024/25), und seine Urteilskompetenz enthält bereits _„beurteilen den
Einsatz von **Künstlicher Intelligenz**"_.

| Aufgabenform                                                                                                                                                                                  | Produkt                                                                                                             | Eimer                                         | Klassenstufe |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- | ------------ |
| Fachbegriff/Grundbegriff nennen, zuordnen; Religionskunde-Fakten (Feste, Zehn Gebote, Fünf Säulen, Sakramente, Kanon)                                                                         | Begriff / Paar / Fakten                                                                                             | **C**                                         | 5–13         |
| Textsorte/Gattung einer Bibelstelle bestimmen; Position einem Philosophen zuordnen                                                                                                            | Label                                                                                                               | **C**                                         | 7–13         |
| **deontologisch / utilitaristisch / Tugendethik / Diskursethik zuordnen**                                                                                                                     | ein Label je Begründungsmuster                                                                                      | **C** — geschlossener Kanon                   | 10–13        |
| **Schlussform benennen** (Modus ponens/tollens); **Fehlschluss benennen** (Sein-Sollen-Fehlschluss, petitio principii); **formale Gültigkeit beurteilen**; Stellung eines Arguments zur These | Label / gültig-ungültig / stützt-widerlegt-irrelevant                                                               | **C**                                         | 11–13        |
| **Bibelstelle/Primärtext erschließen**                                                                                                                                                        | wesentliche Aussagen · formale Elemente · gedankliche Strukturen · Entstehungssituation · Aussageabsicht · Adressat | **R** — endliche Slotliste                    | 7–13         |
| **Argumentationsanalyse/-rekonstruktion**                                                                                                                                                     | Prämissen-Konklusions-Schema in **Standardform**, ggf. mit impliziter Prämisse                                      | **R** mit berechenbaren Teilschritten (s. u.) | 11–13        |
| **Begriffsklärung/Explikation**                                                                                                                                                               | Merkmale + Abgrenzung + Anwendungskontexte                                                                          | **R** — drei feste Slots                      | 10–13        |
| Positionen vergleichen (festes Vergleichsraster)                                                                                                                                              | Tabelle/Essay                                                                                                       | **R**                                         | 9–13         |
| Bildinterpretation (Ikonographie)                                                                                                                                                             | Analyse: Bildaussage + Einordnung (Entstehung, Verwendung, Adressat)                                                | **R**                                         | 7–13         |
| **Gestaltungsaufgabe / produktionsorientierter Zieltext** (Debattenbeitrag, Leserbrief, Rede)                                                                                                 | fertiger adressatenbezogener Text                                                                                   | **R** (Gattungs-/Adressatenkriterien) → **H** | Q1/Q2        |
| Gedankenexperiment / fiktives Dilemma entwickeln                                                                                                                                              | formuliertes Gedankenexperiment                                                                                     | **R** → **H**                                 | 5–13         |
| **Dilemma-Diskussion**; Rollenspiel                                                                                                                                                           | mündlicher Beitrag, Positionswechsel                                                                                | **H**                                         | 5–13         |
| **Theologische/philosophische Erörterung** (dialektisch); **Essay**                                                                                                                           | mehrseitige Argumentation                                                                                           | **H**                                         | 10–13        |
| Diskursergebnis nach Konsens/Dissens/offenen Fragen ordnen                                                                                                                                    | dreigeteilte Zusammenfassung                                                                                        | **R** — drei Slots                            | 11–13        |

**Die Argumentationsanalyse ist die größte unerwartete computable Fläche des Berichts** — und die
Linie verläuft _innerhalb_ der Form:
**C:** Konklusion identifizieren (Indikatoren „also/daher/folglich"), Argument vs. Behauptung,
Schlussform benennen, **formale Gültigkeit entscheiden**, Fehlschlusstyp benennen, Gültigkeit vs.
Wahrheit trennen. **R:** Prämissen-Konklusions-Schema füllen (Zahl und Position prüfbar, Wortlaut
paraphrasierbar), implizite Prämisse ergänzen (semantische Äquivalenz → Modell + Code, **kein
String-Match**). **H:** Plausibilität der Prämissen, Kohärenz und Überzeugungskraft.
Belegt im RLP Berlin/Brandenburg GOST Philosophie (2025): _„rekonstruieren Argumente … (**z. B. in
Standardform**) und arbeiten dabei auch ggf. **implizite Prämissen** heraus"_; _„unterscheiden dabei
**Kritik an Inhalt (der Plausibilität der Prämissen) und Form** und identifizieren ggf. typische
**Argumentationsfehler**"_; _„beurteilen die **Kohärenz und Überzeugungskraft** komplexer
Argumentationen"_. Und **NRWs Operator `rekonstruieren` steht in AFB I–II** — die Argumentrekonstruktion
ist curricular eine *Struktur*aufgabe, kein Qualitätsurteil.

**Amtliche Aufgabenarten:** **Philosophie NRW** neun Überprüfungsformen A–I, Abitur-Aufgabenarten
I (Texterschließung mit Vergleich und Beurteilung) und II (Erörterung, Varianten A Text / B
Aussagen / C **Fallbeispiel**); Punkteverteilung der amtlichen GK-Beispielaufgabe **16 / 48 / 16** —
**der Schwerpunkt liegt auf der rubric-prüfbaren Mitte**. **Religion NRW** drei Aufgabenarten
(I Textaufgabe, II Erweiterte Textaufgabe, III **Gestaltungsaufgabe**), Regelfall **drei
operationalisierte Teilaufgaben** (Erarbeitung → Entfaltung/Vergleich → Stellungnahme).
**Niedersachsen Werte und Normen** hat eine **verbindliche Grundbegriffsliste** (Anhang A2) — eine
fertige C-Item-Inventur (Deontologie, Teleologie, Eudaimonismus, Handlungsutilitarismus,
kategorischer Imperativ, Maxime, Kompatibilismus, Korrespondenz-/Kohärenz-/Konsenstheorie).

### 10.2 Kunst und Musik

**Kunst.** Die Praxis ist nicht Beiwerk, sondern geprüfter Hauptteil: **BW** hat eine
**fachpraktische Prüfung von 300 Minuten** mit mindestens einer zwei- und einer dreidimensionalen
Arbeit, bewertet nach _„Ganzheitlichkeit, Ausdruckskraft und Eigenständigkeit"_; **NRW**
Aufgabenart I _„Gestaltung von Bildern mit schriftlichen Erläuterungen"_ wird **dezentral gestellt**
(+60 Min, Hilfsmittel u. a. _„Buntstifte (6 Farben)"_), und **NRWs Operatoren _„beziehen sich
ausschließlich auf rezeptionsorientierte Aufgaben"_** — der praktische Teil ist gar nicht
operationalisiert. **Bayerns „Additum" existiert in der neuen Oberstufe nicht mehr** (ersetzt durch
Leistungsfach mit besonderer verpflichtender Fachprüfung, schriftlich-theoretisch **und**
fachpraktisch).

| Form                                                                                                                                                                                                                                                                                                                                                                         | Eimer                                                  |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| Werkdaten, Gattung, Bildgegenstände benennen · **Einleitungssatz der Bildbeschreibung** (Künstler/in, Titel, Jahr, Material, Größe — fünf Slots) · Raumdarstellungsmittel · **Farbkontrast benennen** · Farbfunktion (Lokal-, Erscheinungs-, Ausdrucks-, Symbolfarbe) · Einstellungsgröße/Kameraperspektive · **kunstgeschichtliche Zuordnung**                              | **C**                                                  |
| **Perspektivkonstruktion** (Zentralperspektive, Zwei-Fluchtpunkt, Isometrie/Kavalier)                                                                                                                                                                                                                                                                                        | **C** für die Konstruktion, **H** für das Bild (s. u.) |
| **Bildbeschreibung** (wert- und deutungsfrei) · **Werkanalyseverfahren in fester Schrittfolge** (Bayern Ku 7: erster Eindruck → Material/Technik → sichtbaren Bestand sichern → Bildaufbau/Formgebung → Funktion) · **Bildanalyse → Deutung → Einordnung** · Kompositionsskizze/Farbauszug · Bildvergleich · Architektur-/Designanalyse · **Reflexion des eigenen Produkts** | **R**                                                  |
| **Praktische Gestaltungsaufgabe / eigenes Kunstwerk** · **Fachspezifische Problemerörterung** (nur LK) · Gestaltungspraktische Versuche                                                                                                                                                                                                                                      | **H**                                                  |

**Wie weit die Perspektivkonstruktion berechenbar ist** (deterministisch entscheidbar): Konvergenz
der Fluchtlinien (Least-squares-Schnittpunkt + Residuumsschwelle), Fluchtpunkt auf dem Horizont,
Horizont auf Augenhöhe, **welche Kantenfamilien parallel bleiben müssen und den FP nicht treffen
dürfen** (der häufigste Schülerfehler), Zwei-FP-Clustering, Isometrie/Kavalier (Parallelität +
30°/30° bzw. 45° + Verkürzung 1 : 0,5). **Nicht** entscheidbar: ob die Zeichnung das Verlangte
_darstellt_, Freihandzeichnung (die Toleranz frisst die Trennschärfe) und **expressive
Verwendungen** („Multiperspektivität, Deformation, Dekonstruktion" sind absichtlich nicht
regelbefolgend — ein Konvergenzprüfer würde korrekte Arbeit falsch markieren).
**Farblehre, nicht glattgebügelt:** NRW nennt Ittens sieben Kontraste **nicht**, Bayern nennt
**vier** namentlich; die einzige Itten/Goethe-Nennung im Korpus ist Brandenburgs AFB-III-Operator
`kommentieren`, also als _Theorienvergleich_. **Dass ein Land Ittens sieben Kontraste als
geschlossene Liste vorschreibt, ist nicht belegt.**

**Musik — das Fach mit dem höchsten Anteil formal entscheidbarer Fehlerklassen.**

| Form                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Eimer                                  |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| **Notenlesen** · Notenwerte/Pausen · **Taktart** · **Intervall schriftlich** · **Intervall nach Gehör** · **Akkord nach Gehör** · **Dreiklänge und Umkehrungen** · Septakkord/Zwischendominante/Modulation · **Funktions-/Stufensymbole eintragen** · **Tonart/Quintenzirkel/Paralleltonart** · Kadenztyp · **Rhythmusdiktat** · **Melodiediktat** · Transponieren · **Reihenoperationen** (Umkehrung, Krebs, Krebsumkehrung) · Musikgeschichte-Zuordnung | **C**                                  |
| **Vierstimmiger Tonsatz / Kadenz aussetzen** · Generalbass · einstimmige Textvertonung · **Formanalyse** (Takt-Bereichs-Tabelle mit benannten Abschnitten) · **Höranalyse von Werkausschnitten** · Arrangement · Erläuterung des eigenen Stücks                                                                                                                                                                                                           | **R** (mit großem C-Kern beim Tonsatz) |
| **Komposition / Gestaltungsaufgabe** · Erörterung musikbezogener Texte · Interpretationsvergleich · **Instrumentalvortrag / Gesang** · Vom-Blatt-Spiel · Improvisation · Ensembleleitung                                                                                                                                                                                                                                                                  | **H**                                  |

**Was davon Buddy heute kann** (Issue #226, `docs/architecture.md` §Practice): Notenlesen im
Violin- und Bassschlüssel, Notenwerte und Pausen, die Taktart aus den Notenwerten, Intervalle
innerhalb der Oktave — und eine kurze Zeile selbst schreiben, auf einer Notenzeile zum Antippen, mit
Ton. Jede dieser Fragen schreibt und prüft **Code** aus einer geprüften Aufgabe; kein Modellaufruf
und kein Schlüssel, der der gezeichneten Zeile widersprechen könnte. Nicht dabei: Generalvorzeichen
und damit Tonleitern/Quintenzirkel, Dreiklänge, Mehrstimmigkeit, Partitur, Notendiktat nach Gehör.

**Gehörbildung ist C — und das ist für eine App der entscheidende Punkt:** geschlossene
Antwortmengen (BW: 7 Intervall-Items aus 12 Möglichkeiten; 7 Akkord-Items aus einem 9er-Vokabular
mit vorgegebenen Antwortsymbolen), vorgeschriebene Register, Teilpunkte pro Takt — **und die App
erzeugt den Stimulus und besitzt damit den Schlüssel.** Es gibt kein Erkennungsproblem, nur
Antwortvergleich. Zwei Bedingungen: die Antwort muss **strukturiert** erfasst werden (Notensatz-
Widget, nicht Foto) und alternative Akkordschreibungen müssen als Äquivalenzklasse zugelassen sein
(BW verlangt es ausdrücklich).
**Der vierstimmige Satz** hat unter allen Formen dieses Berichts das höchste Verhältnis formal
entscheidbarer Fehlerklassen zur Gesamtbewertung, und **BW hat die Rubrik schon als Fehlerzählung
geschrieben** (_„Bei der Bewertung werden die **Fehler gezählt** … pro Akkord nur **ein**
Fehlerpunkt"_): **C** sind falscher/fehlender Akkord, fehlender/überzähliger Ton inkl. Vorzeichen,
**offene Quint-/Oktavparallelen**, Stimmkreuzung, Stimmumfänge, Leitton-/Septbehandlung,
Verdopplungsverbote. **Nicht entscheidbar: „unmotivierte Sprünge"** — die Sprunggröße ist messbar,
„motiviert" hat kein Entscheidungsverfahren.
**NRW hat drei Aufgabenarten, alle drei zur Wahl** (Analyse/Interpretation · Erörterung ·
**Gestaltung mit schriftlicher Erläuterung**, +60 Min) — und **`komponieren` steht in NRW in
AFB II**, nicht III.

### 10.3 Sport

Der schriftliche Teil ist **Sporttheorie und nur Sporttheorie**, und er existiert nicht überall: in
**NRW nur im Leistungskurs** (300 Min, Klausuren _„generell materialgebunden"_). **Bayern:** _„In
allen vier Ausbildungsabschnitten werden **anstelle der Schulaufgabe praktische Leistungen**
verlangt"_. **Niedersachsen eA:** drei Teilprüfungen, die dritte _„im Praxis-Theorie-Verbund"_ mit
theoretischen Anteilen von **40–50 %**. **KMK EPA Sport** (i. d. F. **28.09.2017** — das aktuellste
EPA im Korpus) kennt für die schriftliche LK-Prüfung nur **zwei** Aufgabenarten, beide
**Erörterung** _„mit oder ohne Material"_.

| Theorie-Aufgabenform                                                                                                                                                                                                                                              | Eimer                             |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| Trainingsprinzip/-methode/Belastungskomponente benennen · Trainingsmethode der Zielsetzung zuordnen · **biomechanisches Prinzip nach Hochmuth zuordnen** · Muskelfasertypen, Agonist/Antagonist, Gelenktypen · Energiebereitstellungsweg · Sportspiel-Regelwissen | **C**                             |
| **Phasenstruktur bestimmen** + Funktion je Phase                                                                                                                                                                                                                  | **C** (Phasen) / **R** (Funktion) |
| **Laktatstufentest / Conconi-Test auswerten**                                                                                                                                                                                                                     | **C** (Werte) / **R** (Deutung)   |
| Modell skizzieren (Regelkreis Meinel/Schnabel, KAR-Modell, Superkompensation) · **Trainingsplan erstellen** · Bewegungsanalyse → Korrekturen · Theorie auf ein Textbeispiel anwenden                                                                              | **R**                             |
| **Erörterungsaufgabe** mit Sach- und/oder Werturteil                                                                                                                                                                                                              | **H**                             |
| Demonstration, Wettkampf, Choreografie, Ausdauerleistung                                                                                                                                                                                                          | **H**, **nicht app-trainierbar**  |

**Nicht app-trainierbar ist genau das, was Niedersachsens zweite Operatorenliste „für den
Praxis-Theorie-Verbund" auflistet:** `absolvieren` (_„Absolvieren Sie einen 100-Meter-Lauf"_),
`bewältigen`, `demonstrieren`, `erproben`, `organisieren`, `gestalten`. **App-trainierbar ist der
gesamte theoretische Vorbereitungsraum** plus `reflektieren` und `einschätzen` als *Schreib*aufgaben
über eine extern erbrachte Leistung.

---

## §11 Was Buddy heute kann — aus dem Code gelesen

Nicht aus der Erinnerung, sondern aus dem Repository am 01.10.2026. Jede Aussage trägt Datei und
Symbol und ist mit `grep` auffindbar.

### 11.1 Die Formen, die es gibt

**Sieben Item-Arten** (`packages/shared-types/src/contracts/learning.ts:131`, `ItemKind`):
`short` · `long` · `numeric` · `multiple_choice` · `formula` · `vocab` · `speak`.

> **Nachtrag 02.10.2026 (Welle 1, Issues #228, #229, #230).** Dazu kommen **drei Arten mit einer
> mehrteiligen Antwort**: `order` (ordnen), `match` (Paare verbinden oder in Gruppen sortieren) und
> `table_fill` (Tabelle ausfüllen) — zusammen die 95 Aufgabentypen aus 14 Fächern, die in §12.2
> unter „Wissen ja, Form nein" stehen. Alle drei werden **vollständig von Code** geprüft, Teil für
> Teil, ohne Modellaufruf (`modules/practice/structured.ts`, `table.ts`, `contracts/structured.ts`,
> Migration 0079; die erste Umsetzung über `parts` mit Migration 0072 wurde nach einer Prüfung
> beider Seiten ersetzt, #224). Die App bekommt die Aufgabe ohne Schlüssel (`ItemView.task_view`)
> und antwortet mit `AnswerRequest.parts`. Die Zählung in §12 ist davor entstanden und hier nicht
> nachgerechnet.

**Fünf Sitzungsarten**, die Buddy anbieten kann (`contracts/buddy.ts`, `offer_learning.kind`;
`StartTopicRequest.kind`): `practice` · `vocab` · `speak` · `help` · `test`.
/\*\*
**Sechs Sitzungsarten**, die Buddy anbieten kann (`contracts/buddy.ts`, `offer_learning.kind`;
`StartTopicRequest.kind`): `practice` · `vocab` · `speak` · `listen` · `help` · `test`.

**Drei Antwortwege** (`AnswerRequest.via`): `typed` · `tapped` · `spoken`.

**Drei Eingabeflächen auf dem Bildschirm** (`apps/mobile/app/practice/[id].tsx` wählt sie aus):

| Fläche        | Datei                                                 | Was sie kann                                                                                                                                                                                                                                                                                                                                                    |
| ------------- | ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Textfeld      | `components/practice/AnswerComposer.tsx`              | ein Feld, **max. 2000 Zeichen** (`MAX_ANSWER_LENGTH`, Zeile 44; gespiegelt in `AnswerRequest.text … .max(2000)`), mehrzeilig bei `kind === 'long'`. Matheleiste nur bei `numeric`/`formula`/`short`-mit-Mathe: **/ ² ³ √ π · − ( ) ° Dezimaltrennzeichen** (`components/math/MathKeys.tsx`) — kein Integralzeichen, kein Vektorpfeil, kein ≤/≥. Diktat möglich. |
| Auswahlkarten | `components/practice/ChoiceList.tsx`                  | Multiple Choice antippen; dieselbe Komponente zeigt die `tap_choices` für Vokabeln (Issue #147).                                                                                                                                                                                                                                                                |
| Aufnahme      | `components/practice/SpeakPanel.tsx`, `WordSheet.tsx` | einen **vorgegebenen Zieltext** vorlesen; das Modell hört die Aufnahme selbst und urteilt Wort für Wort (`modules/practice/speak.ts`).                                                                                                                                                                                                                          |

**Zwei Darstellungen, die sie ansehen aber nicht bearbeiten kann:** `Figure` aus Daten gezeichnet
(`contracts/figure.ts`: `fraction`, `number_line`, `function_plot`, `bar_chart`, `geometry`,
`table` und seit #245/#246 die Diagramme `line_chart`, `climate_chart`, `pie_chart`, `box_plot`,
`histogram`, `scatter_plot`, `pyramid` — deren Ablesefragen rechnet Code nach, `docs/architecture.md`
§Charts) und `ItemImage` — ein **echter Ausschnitt** aus dem fotografierten Blatt
(`modules/materials/images.ts`, Issue #50).

**Hörverstehen** (Issue #210, `contracts/listen.ts`, `modules/practice/listen.ts`,
Migration `0077_listening_tasks.sql`): keine neue Item-Art. Eine Hörfrage ist ein `multiple_choice`-
oder `short`-Item mit einem **gesprochenen** Aufgabenstoff — `items.listen_task` trägt genau den
Text, den die Sprachausgabe bekommt, und die App bekommt davon nur Audio
(`POST /practice/sessions/:id/listen`), die Wörter erst nach dem Beantworten. Damit sind die drei
Regeln aus §7.3, die den Code betrafen, für diese Form im Code und nicht im Prompt:

- **Sprache wird nicht bewertet** (§7.3 Regel 1, §12.2 d): `ruleCheck` zählt bei einem Item mit
  Hörtext jeden reinen Formfehler als richtig (`contentOnly` in `modules/practice/evaluate.ts`),
  und `spellingOf` gibt dort `gentle` zurück — der Default für Sprachfächer ginge in die andere
  Richtung. Für Lese­verstehen vom fotografierten Blatt gilt das **weiter nicht**: dort fehlt dem
  Code jedes Merkmal, an dem er eine Verstehensaufgabe erkennen könnte (§12.2 d bleibt offen).
- **Richtig/Falsch ist nicht geeignet** (§7.3 Regel 2): der Generator bekommt es verboten, und
  Regel 0 (unten) macht es ohnehin unmöglich — „richtig" steht nicht im Hörtext.
- **Regel 0** (Issue #210): jede Antwort muss **wörtlich im Hörtext vorkommen**, sonst entsteht die
  Frage nicht (`answerIsInText`). Das ist kein Sprachverständnis und keine Wortliste, sondern ein
  Vergleich zweier Zeichenketten, die dasselbe Modell geschrieben hat. Der Preis: eine Frage, deren
  Antwort man selbst formulieren müsste — eine Folgerung, eine Zahl, die der Text ausschreibt, eine
  Übersetzung ins Deutsche — gibt es nicht. Das deckt aus der §7.2-Liste `tick`, `complete`/`fill
in` und `list`/`name` ab; `match` (Zuordnen, #229) und die gefüllte Tabelle (#230) kommen, wenn
  diese Formen existieren.

Ohne eingerichtete Stimme entsteht **keine** Hörübung: `startTopic` lehnt eine Hörverstehen-Anfrage
vor dem Modellaufruf ab, und der Knopf im Chat hört auf, einer zu sein (`practice/prepare.ts`,
Issue #196). Was damit **nicht** geht und als Lücke stehen bleibt: eine echte Aufnahme mit mehreren
Sprechern (es ist eine Synthesestimme), Hörsehverstehen (Video) und `ear_training` (§12.3) —
Intervalle und Rhythmen zu hören ist eine andere Aufgabe als einen Text zu verstehen.

**Neu und gerade im Zulauf:** `AnswerSurface` (`contracts/bars.ts:107`, `modules/practice/bars.ts`)
— die Bruchbalken aus Issue #162, bei denen das Modell **nur** eine geprüfte Aufgabe und ihre
Zahlen wählt und Code Frage, Bild und Lösung rechnet. Das ist die erste Antwortfläche, die nicht
„tippen, antippen, sprechen" ist. Dieser Bericht rechnet sie als **in Arbeit**, nicht als
vorhanden.

> **Nachtrag 02.10.2026 (Welle 6, Issue #226).** `AnswerSurface` hat eine dritte Form: `notes`, die
> **Notenzeile**, auf die sie schreibt. Ein Tipp in einen Takt setzt eine Note dort, wo der Finger
> liegt, „Höher"/„Tiefer" schieben sie (Issue #275), und jede Note **spielt sofort** (`components/practice/StaffAnswer.tsx`, `lib/music/`). Dazu
> kommt eine siebte Darstellung zum Ansehen: `staff` in `contracts/figure.ts`, die einzige, die das
> Modell **nicht** schreiben darf (`ModelFigure`) — weil ihr Schlüssel von der Zeichnung abgelesen
> wird. Fünf geprüfte Notenaufgaben (`contracts/staff.ts`), alle von Code geschrieben und von Code
> entschieden, ohne Modellaufruf; was davon geht und was nicht, steht in §10.2.

### 11.2 Wie geprüft wird

`modules/practice/evaluate.ts`, `ruleCheck` → ein `RuleVerdict` aus
`correct | spelling | close | missing_word | typo | folded | incorrect | unknown`:

| Item-Art                            | Was Code entscheidet                                                                                                                                                        |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `multiple_choice`                   | Vergleich mit `correct_choice` (oder `choiceNamed` für getippte/gesprochene Antworten) → **sicher**                                                                         |
| `numeric`                           | `parseNumericInput` + `compareNumbers` + `sameWrittenForm`, Toleranz nach Entscheidung D-1 → **sicher**                                                                     |
| `short`, `long`, `formula`, `vocab` | `canonicalMath` bzw. `canonicalText`: **exakte** Gleichheit, sonst Beinahetreffer (Akzente, fehlendes erstes Wort, Tippfehler) — und sonst `unknown`                        |
| alles `unknown`                     | geht an das Tutormodell (`modules/practice/tutor.ts`): **vier** Urteile `correct / partially_correct / incorrect / not_an_attempt`, Antwort **max. 600 Zeichen, 1–3 Sätze** |
| kein Modell verfügbar               | nichts wird bewertet: _„Das kann ich gerade nicht prüfen."_                                                                                                                 |

`modules/practice/keyCheck.ts` (`keyAgreesWithPrompt`) verwirft ein Item **nur**, wenn der Prompt
nichts als eine konstante Rechnung ist und der Schlüssel ihr widerspricht (Issue #157). Für alles
andere ist der Schlüssel ein **ungeprüfter, modellgeschriebener Text von max. 600 Zeichen**
(`ItemDraft.answer`) — die Datei sagt das selbst: _„Everything else needs subject knowledge, and
claiming to check it would be the same mistake one level up."_

Nach dem **dritten** Fehlversuch wird die Lösung erklärt (`REVEAL_AFTER_MISSES = 3`,
`service.ts:408`), FSRS bekommt `Again`, und das Thema erscheint im Summary als „wacklig".

### 11.3 Was `long` auslöst — und was nicht

`grep -rn "'long'"` über `apps/` und `packages/` (ohne Tests) findet **genau vier Stellen mit
Verhalten**:

1. `items.ts:259` — `spelling` darf gesetzt werden.
2. `generate.ts:240/244` — `practice` und `help` dürfen `long` erzeugen, **`test` nicht**.
3. `service.ts:943` — in der Hausaufgabenhilfe wird die Code-Gegenprüfung `homeworkSolved` für
   `long` **übersprungen**; dort hat das Modell das letzte Wort.
4. `AnswerComposer.tsx:74` — das Feld wird höher (88 statt 48 pt) und sendet nicht mit Return.

**Sonst gibt es für `long` kein Verhalten:** keine Rubrik, keine Teilschritte, keinen anderen
Urteilsraum, keine andere Rückmeldungslänge, keinen anderen FSRS-Pfad, keine andere Behandlung im
Summary. Ein `long`-Item ist für die ganze Maschine eine kurze Antwort mit einem größeren Feld.

### 11.4 Eine Asymmetrie, die niemand entschieden hat

`modules/practice/generate.ts` verbietet dem Modell ausdrücklich, Aufgaben zu erzeugen, die in der
App nicht beantwortbar sind:

> _„Everything is answered in the app by typing or choosing (or speaking for speak items): **no
> tasks to draw, build, hand in or look up elsewhere**."_

`modules/materials/extract.ts` — der Pfad, über den ein **fotografiertes Blatt** zu Fragen wird —
enthält **keinen solchen Satz**. Dort steht: _„Write practice questions that check exactly this
material"_ und _„Otherwise 8–15 questions. Prefer short answers and numbers."_
→ Ein Blatt mit „Konstruiere das Dreieck", „Zeichne den Schaltplan", „Erörtern Sie …" wird zu
Items, die zu tippen sind. Was Buddy selbst erfinden darf, ist strenger begrenzt als was er von
einem echten Blatt übernimmt — und das echte Blatt ist der häufigere Fall.

---

## §12 Die Lücke

### 12.1 Gruppe 1 — gut abgedeckt

Diese Formen passen auf das, was Buddy hat, und die amtlichen Vorgaben bestätigen die Umsetzung.

| Aufgabenform (Fach)                                                     | Buddys Form                           | Warum das passt                                                                                                                                                                                                                                                                                                                                                                        |
| ----------------------------------------------------------------------- | ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Vokabeln, beide Richtungen** (alle Fremdsprachen, Sek I)              | `vocab` + `tap_choices` + `direction` | Die Trennung `recognise` / `produce` (Issue #113) trifft genau die Lehrplanunterscheidung „produktiv / rezeptiv". Dass ein **angetipptes** Wort nicht zum „Thema sitzt" zählt (`session_items.answered_by`, Issue #163), ist die richtige Vorsicht: eine Klassenarbeit verlangt Produktion. `accepted_answers` (bis 8) deckt die amtlich geforderte Gleichwertigkeit von Synonymen ab. |
| **Formen- und Grammatikbestimmung** (Deutsch 5–10, EN/FR/ES, Latein)    | `short` mit `spelling: 'strict'`      | Wortart, Satzglied, Kasus, Tempus, Modus, Konjugation, Deklination, AcI, Abl. abs. — alles **C**, und die strenge Schreibung ist für Sprachfächer der richtige Default (Entscheidung D-2).                                                                                                                                                                                             |
| **Lückentext, Einsetzübung, Fehlerkorrektur** (EN/FR/ES, Deutsch)       | `short`                               | Das kanonische computable Item (`simple past vs. present perfect`) ist exakt diese Form.                                                                                                                                                                                                                                                                                               |
| **Rechenergebnis mit Einheit** (Mathematik, Physik, Chemie, Geographie) | `numeric` + `unit` + `tolerance`      | Die Toleranzregel D-1 (Dezimalschlüssel: halbe letzte Stelle; explizite Toleranz nur deklariert und ≤ ein Zehntel) deckt die amtlichen Toleranzbänder.                                                                                                                                                                                                                                 |
| **Term, Ableitung, Reaktionsgleichung, Oxidationszahl**                 | `formula`                             | `canonicalMath` hält Operatoren, Vorzeichen und Relationen auseinander. **Mit einer Einschränkung:** gleichwertige, anders geschriebene Terme sind für den Code `unknown` und gehen ans Modell. Das ist regelkonform (Regel 1), aber es heißt: **Äquivalenz behauptet das Modell, nicht der Code.**                                                                                    |
| **Multiple Choice, Zuordnung, Richtig/Falsch** (alle Fächer)            | `multiple_choice`                     | Deckt sehr viel: Erbgang-Label, Lagebeziehung, Chomsky-Typ, Komplexitätsklasse, Klimazone, Verfassungsorgan, Schlussform, Intervall, Taktart, Farbkontrast, Epoche.                                                                                                                                                                                                                    |
| **Vorlesen / Aussprache** (alle Fremdsprachen)                          | `speak` + `WordSheet`                 | Wort-für-Wort-Rückmeldung mit Einzelwort-Übung (Issue #83). Das ist der monologische *Aussprache*anteil — nicht die Sprechprüfung (→ 12.3).                                                                                                                                                                                                                                            |
| **Hausaufgabenhilfe**                                                   | `help`-Modus                          | Code setzt durch, dass die Lösung nie fällt (`givesAwayHomework`, `homeworkSolved`, zwei Reparaturversuche, dann ein neutraler Schritt). Deckt sich mit dem KMK-Beschluss vom 10.10.2024 (_„Vorkorrektur, Korrekturassistenz und anschließende adaptive Lernunterstützung"_).                                                                                                          |
| **Kurze Wissensfragen als Prüfungsvorbereitung**                        | `test`-Modus                          | Formatnah zu Bayerns **Stegreifaufgabe** (max. 20 Min) und **Kurzarbeit** (max. 30 Min) und zu **VERA-8** (geschlossene Items, keine Note).                                                                                                                                                                                                                                            |

Grob gerechnet deckt Gruppe 1 den **computable**-Eimer gut ab — und der ist in Sek I groß (Bayerns
Deutsch-Jahrgangsstufentest: 27 von 29 Aufgaben) und in Geographie, Chemie, Musik-Theorie und
Informatik-Grundlagen ebenfalls groß. **Das ist ein echter Deckungsgrad, nicht wenig.**

### 12.2 Gruppe 2 — läuft heute durch und wird falsch behandelt

**Das ist die gefährliche Gruppe.** Nicht weil etwas fehlt, sondern weil etwas _funktioniert_ und
dabei das Falsche tut. Jeder Punkt unten ist mit Datei und Zeile belegt und mit dem amtlichen Satz,
dem er widerspricht.

#### (a) Eine Erörterung wird als kurze Antwort geprüft

**Was passiert.** Ein Blatt mit „Erörtern Sie, ob …" wird gelesen; `extract.ts` schreibt ein Item,
nach seiner eigenen Anweisung `kind: long` („for explanations or texts"). Dann:

1. `ruleCheck` findet keine exakte Übereinstimmung → `unknown`.
2. Das Tutormodell bekommt **`SOLUTION: <answer>`** — einen modellgeschriebenen Text von **max. 600
   Zeichen** — und gibt **eines von vier Urteilen** zurück, in **1–3 Sätzen**.
3. Beim **dritten** `incorrect` greift `REVEAL_AFTER_MISSES`: _„Schau, so geht's: …"_ bzw. _„Die
   Lösung ist: …"_ (`apps/api/src/i18n/de.json`, `practice.worked_intro` / `practice.solution_is`).
4. FSRS bekommt `Again`; das Thema steht im Summary als „wacklig".

**Warum das falsch ist**, in den Worten der Vorgaben:

> KMK zur Interpretation: _„vor dem Hintergrund der **Mehrdeutigkeit** literarischer Texte ein
> eigenständiges Textverständnis zu entfalten"_.
> Bayern, KMS Deutsch 29.06.2023: _„plausible eigenständige Ansätze … sind zu honorieren, **auch
> wenn sie von den Erwartungen der beurteilenden Lehrkraft abweichen**"_, und _„die **bloße
> Umrechnung von addierten Bewertungseinheiten in Noten** wird dem Schreibprodukt nicht gerecht"_.
> KMK zu Erwartungshorizonten: _„**Maximallösungen**, nicht jedoch … Musterlösungen"_.
> NRW: Gewichtung **72 : 28** Inhalt zu Darstellung über 100 Punkte.
> GPJE für politische Urteile: Bewertung darf sich _„**nicht aber auf die inhaltliche Position
> selbst**"_ beziehen.

Buddy hat davon: **einen** Schlüssel, **vier** Urteile, **drei** Versuche. Das ist nicht eine
schwächere Version der Prüfung, es ist eine andere Sache — und sie sagt einem Kind „noch nicht
ganz", wo eine Lehrkraft Punkte gegeben hätte. **Regel 5 verletzt: die App behauptet ein Urteil,
das sie nicht belegen kann.**

**Dazu kommt eine physische Grenze.** Das Feld nimmt **2000 Zeichen** (≈ 300 deutsche Wörter). Ein
materialgestützter Zieltext im Abitur hat **ca. 1000–1200 Wörter**, eine Sprachmittlung geht von
einem Ausgangstext von 450–650 Wörtern aus, eine Interpretationsvorlage hat bis 1500 Wörter. **Sie
kann die Aufgabe im Gerät gar nicht schreiben** — und was sie schreiben kann, wird als falsche
Kurzantwort gewertet.

**Betroffen sind nicht nur Erörterungen.** Dieselbe Mechanik trifft: Interpretation ·
Sachtextanalyse · Gedichtanalyse · Charakterisierung · Inhaltsangabe · materialgestütztes Schreiben
· Summary · Comment · Sprachmittlung · Quelleninterpretation · Karikaturanalyse ·
Darstellungsanalyse · Raumanalyse · kategoriale Fallanalyse · Versuchsprotokoll ·
Nachweisreaktion · Kurvendiskussion · Extremwertaufgabe · Herleitung · Erklärungsaufgabe
(„Erkläre, warum …") · Argumentationsrekonstruktion · Bildanalyse · Formanalyse · Trainingsplan.
Das sind — über die Fächer gezählt — **die Mehrheit aller Formen in diesem Bericht** und in der
Oberstufe die Mehrheit der Note.

#### (b) Eine Rechnung wird am Ergebnis gemessen, nicht am Ansatz

`numeric` prüft die Zahl. Der amtliche Operator sagt:

> **berechnen** (IQB, Bio/Chemie/Physik, Stand 31.03.2022): _„Die Berechnung ist **ausgehend von
> einem Ansatz** darzustellen."_
> **Berlin, Physik:** _„Sämtliche Rechnungen und Herleitungen sind … **nachvollziehbar zu
> dokumentieren**. Das gilt auch für die Auswertung von Messdaten."_
> **IQB:** _„**erläuternde, kommentierende und begründende Texte** sind unverzichtbare Bestandteile
> der Prüfungsleistung."_
> Und die amtlichen Lösungen punkten genau so: _„Aufstellen des MWG: 1 · Ersetzen: 1 · Auflösen und
> Einsetzen: 2."_

**Was Buddy daraus macht, ist in beide Richtungen falsch:** wer nur die Zahl tippt, bekommt
„Stimmt – gut gemacht!" und hätte in der Klausur den Großteil der BE verloren; wer den Ansatz
richtig hat und am Ende falsch rundet, bekommt „Noch nicht ganz" und hätte in der Klausur über
**Fehlerfortsetzung** (Berlin: _„wird die vorgegebene Anzahl der Bewertungseinheiten erteilt"_)
fast alles bekommen. Die App über- und unterbewertet dieselbe Aufgabe, je nachdem, was das Kind
tippt.

#### (c) Eine Latein-Übersetzung wird an Groß- und Kleinschreibung gemessen

`evaluate.ts` `spellingOf`: für `subject_kind` in `LANGUAGE_SUBJECTS` — und `latin` steht dort —
ist der Default **`strict`**. Eine Übersetzung, die sich nur in Satzzeichen oder Großschreibung
unterscheidet, bekommt also den Beinahetreffer _„Fast richtig – schau nochmal genau auf Groß- und
Kleinschreibung, ß und Satzzeichen."_
Amtlich ist das ein **¼-Fehler** (BW: _„Ausdrucksfehler im Deutschen und geringfügige Verstöße
gegen den deutschen Satzbau"_), während die Bewertung am _„Grad der Sinnentsprechung"_ hängt und
Schleswig-Holstein ausdrücklich schreibt: _„**Eine Übersetzung ist kein geeignetes Instrument, um
Kenntnisse der lateinischen Grammatik abzuprüfen.**"_ Buddy prüft die kleinste Fehlerklasse mit der
größten Sichtbarkeit und die eigentliche Leistung gar nicht.

#### (d) In Hör- und Leseverstehen wird Sprache markiert, obwohl das verboten ist

Derselbe Default (`strict` für Sprachfächer) trifft eine englische Leseverstehensantwort mit einem
Schreibfehler. NRW Sek I, wörtlich:

> _„Bei der Bewertung der isolierten Überprüfung der Teilkompetenzen Leseverstehen und
> Hör-/Hörsehverstehen ist nur zu bewerten, ob die englischsprachige Lösung das richtige
> Verständnis des Textes nachweist; **sprachliche Verstöße werden nicht gewertet**."_

Das Modell _kann_ `spelling: 'gentle'` setzen — aber nichts im Prompt sagt es ihm, und der Default
geht in die andere Richtung. **Ein Einzeiler in `SPELLING_RULES` würde das beheben**; er fehlt.

#### (e) Ein `long`-Item landet in einem Übungstest

`generate.ts` schließt `long` für `kind: 'test'` aus — `selection.ts` tut das **nicht**: der Pool
filtert nur `origin = 'homework'` und `kind = 'speak'`. Ein `long`-Item **von einem Blatt** kommt
also in eine `test`-Sitzung (`POST /practice/sessions` mit `mode: 'test'`), und dort gilt: **ein
Versuch, kein Tipp, binäres Urteil, am Ende „nicht bearbeitet" oder „falsch"**. Eine Erörterung mit
einem Schuss.

#### (f) Der Schlüssel ist ungeprüft, der Ton ist sicher

`keyCheck.ts` deckt nur den Fall ab, dass der Prompt nichts als eine konstante Rechnung ist. Für
eine Quellenanalyse, eine Erbgang-Begründung oder eine Nachweisreaktion ist `answer` eine
Modellparaphrase — und die App sagt am Ende _„Die Lösung ist: …"_. Issue #164 hat dafür den Ausweg
gebaut („Die Bewertung stimmt nicht"), aber der Ausweg ist nicht dasselbe wie ein Urteil, das nicht
zu stark auftritt.

#### (g) Zeichenaufgaben werden zu Tippaufgaben

Weil `extract.ts` keine Typbarkeits-Regel hat (§11.4), wird „Zeichne das Wirkungsgefüge",
„Konstruiere das Dreieck", „Skizziere die galvanische Zelle" zu einem Item mit einer getippten
Antwort. Die App fragt dann nach einer _Beschreibung_ dessen, was gezeichnet werden sollte — und
bewertet sie, als wäre sie die Aufgabe. Dazu die amtliche Gegenposition: _„Ungenauigkeiten in
Zeichnungen oder unzureichende oder falsche Bezüge zwischen Zeichnungen und Text sind als
fachliche Fehler zu werten."_

#### (h) Zwei kleinere, aber belegte Formatfehler

- **Richtig/Falsch im Hörverstehen.** Buddy erzeugt bereitwillig Richtig/Falsch-Items; NRW
  verbietet sie für Hörverstehens-_Noten_ ausdrücklich _„aus testtheoretischen Gründen"_ (im
  Leseverstehen sind sie erlaubt).
- **Isolierte Lückentexte als „Abiturvorbereitung".** In NRWs Oberstufen-Klausurteilen kommt
  „Verfügen über sprachliche Mittel" **nicht mehr vor**. Wer einer Q2-Schülerin Grammatiklücken als
  Vorbereitung ausgibt, stellt die Prüfung falsch dar.

### 12.3 Gruppe 3 — kann Buddy gar nicht, und sollte es sagen

Regel 5: _„Never claim what isn't proven."_ Diese Formen hat Buddy nicht, und heute **sagt er das
nicht** — er erzeugt etwas anderes, und niemand erfährt, dass die eigentliche Übung nicht
stattgefunden hat.

| Was fehlt                                       | Konkret                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Warum es nicht „bald" kommt                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Jede Form, deren Produkt eine Zeichnung ist** | Konstruktion mit Zirkel und Lineal · Funktionsgraph zeichnen · Diagramm + Ausgleichsgerade · Schaltplan · Kräftepfeile · Lewis-/Strukturformel · Mechanismus mit Pfeilen · Titrationskurve · beschriftetes Schema (Neuron, galvanische Zelle) · Stammbaum/Kladogramm · Toleranzkurve · Klimadiagramm zeichnen · Profil- und Kausalprofilschnitt · Kartenskizze · Wirkungsgefüge · Struktogramm/PAP/ER-Modell/Klassendiagramm/Sequenzdiagramm/Automatendiagramm/KV-Diagramm/Binärbaum · Perspektivkonstruktion · Kompositionsskizze | Jede braucht **ihre eigene** Eingabefläche **und** ihren eigenen Prüfer. Das ist kein Feature, das sind ~15 Features. Zwei stehen: der Bruchbalken (#162) und die **Notenzeile** (#226, aus dieser Liste gestrichen) — das zeigt die Größenordnung pro Stück.                                                                                                                                                                                                                               |
| **Freies Sprechen im Dialog**                   | Sprechprüfung Teil 2 (Rollenkarten, Aushandeln, _„falls das Gespräch ins Stocken gerät"_) · BW-Kommunikationsprüfung Tandem · Bayerns Kolloquium mit _„lautem Denken"_ · Dilemma-Diskussion · Pro-Contra-Debatte · mündliche Abiturprüfung                                                                                                                                                                                                                                                                                         | Buddys `speak` ist **Vorlesen eines vorgegebenen Zieltexts**, Wort für Wort geprüft. Ein Gesprächspartner, der nachfragt und das Gespräch hält, ist eine andere Maschine — und die Bewertung ist ohnehin **H**.                                                                                                                                                                                                                                                                             |
| **Echte Experimente und Präparate**             | fachpraktische Abituraufgabe (in **Niedersachsen auf eA verpflichtend**; Berlin hat dafür eine Geräteliste pro Arbeitsplatz) · Mikroskopieren + eigene Zeichnung · Präparieren · Herbar · Kartierung · Exkursion                                                                                                                                                                                                                                                                                                                   | Physische Welt.                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| **Lange Texte überhaupt**                       | materialgestütztes Schreiben (~1000–1200 Wörter) · Abiturklausur (255–330 Min) · Interpretation · Erörterung                                                                                                                                                                                                                                                                                                                                                                                                                       | Das Feld nimmt 2000 Zeichen. Das ist kein Prüferproblem, sondern ein Eingabeproblem.                                                                                                                                                                                                                                                                                                                                                                                                        |
| **Mehrtägige Vorhaben als Produkt**             | Facharbeit · Seminararbeit · besondere Lernleistung · Projekt · **GFS (BW, ab Klasse 7 verpflichtend)** · Komplexe Leistung (Sachsen) · Referat/Präsentation                                                                                                                                                                                                                                                                                                                                                                       | Als _Produkt_ nicht. Als _Vorhaben_ — Thema finden, Quellen ordnen, Termine halten — ist es genau Buddys Rolle und heute ungenutzt.                                                                                                                                                                                                                                                                                                                                                         |
| **Praktische Fächer**                           | Kunst-Gestaltungsaufgabe (BW: **300 Minuten fachpraktisch**) · Komposition · Instrumentalvortrag · Improvisation · Ensembleleitung · Sport-Praxis                                                                                                                                                                                                                                                                                                                                                                                  | **H**, und außerhalb des Geräts.                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| **Gehörbildung**                                | Intervall, Akkord, Rhythmus- und Melodiediktat nach Gehör                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | **Der Ausreißer dieser Tabelle: das wäre C** (geschlossene Antwortmengen, die App erzeugt den Stimulus und besitzt den Schlüssel). Die Notensatz-Eingabe, die dafür fehlte, steht seit #226 — und das Diktat selbst bleibt trotzdem draußen: dort ist der Ton die Aufgabe und die Zeile die Antwort, und wer richtig hört und eine Oktave zu tief schreibt, dürfte nicht falsch sein. Jetzt das billigste Stück dieser Gruppe — **Intervall und Rhythmus nach Gehör stehen nun seit #445**. |

**Und das eigentliche Loch in Gruppe 3 ist kein Feature, sondern ein Satz, den Buddy nicht sagen
kann.** `MaterialFailure` (`contracts/learning.ts`) kennt `photos_missing`, `unreadable`,
`not_learning_material`, `model_error`, `budget_exhausted`, `blocked` — **keinen Wert für „diese
Aufgabenform kann ich nicht üben"**. Und `extract.ts` ist angewiesen, für jedes lesbare Blatt
Fragen zu schreiben (_„Otherwise 8–15 questions"_). Ein Blatt, dessen einzige Aufgabe „Erörtern
Sie …" lautet, wird damit **stillschweigend** zu acht bis fünfzehn Wissensfragen über den Inhalt
des Blattes. Die Fragen sind nicht falsch — aber die Aufgabe, für die sie geübt wird, ist nicht
geübt worden, und das Blatt sieht danach erledigt aus. Das ist genau das Muster von Issue #150
(halbe Vokabelliste, Meldung „alles gelesen") eine Ebene höher, und es ist die wichtigste
Einzelbeobachtung dieses Berichts.

### 12.4 Gruppe 4 — die eine Empfehlung

> **Baue eine Übungsform für die mehrschrittige Aufgabe mit Pflichtelementen.**
> Ein Item, das statt _einer_ Antwort eine **geprüfte Liste benannter Teilschritte** trägt; die
> Antwort wird Element für Element zurückgemeldet („Präsens: ja · Einleitungssatz mit Autor und
> Titel: fehlt noch"); **Code setzt durch, dass über das Ganze nie „richtig" oder „falsch" gesagt
> wird.**

**Warum diese und nicht eine andere.**

1. **Sie deckt am meisten.** Der **R**-Eimer ist der größte in diesem Bericht und fächerübergreifend
   der einzige, der _überall_ auftritt: Inhaltsangabe und Summary · Sachtextanalyse ·
   materialgestütztes Informieren · Quellen-, Karikatur-, Plakat- und Darstellungsanalyse ·
   Klimadiagramm- und Statistikauswertung · Raum-, Fall- und Politikzyklusanalyse ·
   Versuchsprotokoll · Nachweisreaktion (Reagenz + Beobachtung + Gleichung) · Kurvendiskussion ·
   Extremwertaufgabe mit Nebenbedingung · Herleitung · Erklärungsaufgabe · Experiment planen mit
   Variablenkontrolle · Argumentationsrekonstruktion · Begriffsexplikation · Bildanalyse ·
   Formanalyse · Trainingsplan · Normalisierung · Fallbegutachtung im Gutachtenstil. Eine Form, ein
   Dutzend Fächer.
2. **Sie ist in Deutschland schon geschrieben.** Das ist der stärkste Grund. Die amtliche Lösung
   **ist** bereits eine Rubrik: NRWs Biologie-Erwartungshorizont vergibt 7 BE auf **drei benannte
   Inhaltsbullets**; Berlin/Brandenburg codiert eine Deutsch-Aufgabenart als 35/30/20/15 %; Bayern
   verteilt BE getrennt auf Skizze und Erklärung; Niedersachsen schreibt die Inhaltsangabe als
   Elementliste (_„sachlicher Stil, Präsens, indirekte Rede, Sprechhandlungsverben"_); NRWs
   Psychologie-Operator listet die Slots einer Studienanalyse auf. **Die Elementlisten müssen nicht
   erfunden werden — sie stehen auf dem Blatt und im Erwartungshorizont.**
3. **Sie ist die direkte Reparatur von §12.2.** Statt eine Erörterung gegen einen 600-Zeichen-
   Schlüssel zu prüfen und nach drei Versuchen „die Lösung" zu zeigen, sagt die App, **welches
   Element noch fehlt** — und über die Qualität sagt sie nichts, weil sie darüber nichts weiß.
4. **Sie passt zu Regel 1, ohne sie umzudrehen.** Ehrlich gesagt: ob ein Element _inhaltlich_
   abgedeckt ist, kann Code nicht rechnen — das beurteilt das Modell. **Was Code durchsetzt, ist
   die Verfahrensseite**, und das ist nicht wenig: die Elementliste ist fest und sichtbar · es gibt
   **kein** Gesamturteil (`verdict` für das Item bleibt leer) · der Tipp ist das nächste fehlende
   Element, nie mehr · „Lösung zeigen" gibt es für das Ganze nicht · FSRS bekommt, wie viele
   Elemente sie ohne Hilfe hatte, nicht ein Bit · das Summary darf ein Thema auf dieser Grundlage
   nie „sitzt" nennen. Genau diese Trennung — Modell urteilt je Element, Code verweigert das
   Gesamturteil — ist der Grund, dass die Form Regel 5 einhält, wo die heutige nicht einmal die
   Frage stellt.
5. **Sie ist genau das, was die KMK von KI erwartet.** Beschluss 10.10.2024: _„Vorkorrektur,
   Korrekturassistenz … formative Diagnostik … unmittelbares, personalisiertes und elaboriertes
   Feedback"_, und _„die Bewertung weg von der Produkt- hin zur **Prozessorientierung**"_. Eine
   Elementrückmeldung ist formative Diagnostik; ein Gesamturteil wäre Leistungsbewertung und damit
   _„ausschließlich"_ Lehrkraftsache.

**Bewertung auf den vier Achsen** (Research-Kriterium):

| Achse              | Einschätzung                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Speed**          | Unverändert ein Modellaufruf pro Antwort. Die Rubrik entsteht **einmal** beim Lesen des Blattes (im bestehenden `extract`-Call, wie Hinweise und Musterlösung heute). Mehr Ausgabe-Tokens pro Urteil (≈ 6 Booleans + kurze Notizen statt 1 Urteil + 600 Zeichen) — in derselben Größenordnung. Zu messen, nicht zu glauben (vgl. `docs/decisions/model-choice-2026-10-01.md`).                                                                                                                                         |
| **Qualität**       | Erstmals **messbar**: „Element vorhanden / nicht" ist gegen das Blatt prüfbar, und eine Eval kann genau die zwei Fehler testen, die heute passieren — (1) die App nennt ein vorhandenes, aber schwaches Element „falsch", (2) die App nennt die Aufgabe fertig, obwohl ein Pflichtelement fehlt.                                                                                                                                                                                                                       |
| **Kosten**         | Rubrik: einmal pro Item, im Call, der schon läuft. Pro Antwort etwa wie heute. Und sie **spart** den heutigen Weg aus drei Fehlversuchen plus Lösungsanzeige.                                                                                                                                                                                                                                                                                                                                                          |
| **Anwendungsfall** | Das Deutschblatt der Tochter, „Fasse den Text zusammen". **Heute:** dreimal _„Noch nicht ganz …"_, dann _„Die Lösung ist: …"_ mit 600 Zeichen, die sie nie hätte schreiben sollen, dann FSRS `Again` und „wackliges Thema". **Mit der neuen Form:** „Präsens – ja. Einleitungssatz mit Autor und Titel – fehlt noch. Dein letzter Satz ist eine Wertung; die gehört nicht in eine Inhaltsangabe." Das ist der Unterschied zwischen einer App, die einem Kind sagt, es sei falsch, und einer, die sagt, was noch fehlt. |

**Was diese Empfehlung ausdrücklich nicht behauptet.** Sie macht Buddy **nicht** fähig, eine
Erörterung zu bewerten. Sie macht ihn fähig, sie **ehrlich zu üben** — und an der Stelle, an der
die Qualität der Gegenstand ist, soll er genau das sagen: dass er prüfen kann, ob das Element da
ist, und nicht, wie gut es ist.

**Verhältnis zu den laufenden Issues.** Nicht empfohlen wird die Lernfläche: **Issue #162 (Bruch-
balken) ist gerade im Zulauf** (`modules/practice/bars.ts`, `contracts/bars.ts`) und braucht keine
zweite Empfehlung. Die hier vorgeschlagene Form ist die **Schwester** dazu, eine Ebene höher: dort
wählt das Modell eine geprüfte Aufgabe und Code rechnet die Lösung; hier benennt das Modell die
Elemente und Code setzt das Verfahren durch. Beide folgen demselben Satz — **das Modell wählt und
interpretiert, Code setzt durch** — und beide sind Antworten auf dieselbe Stelle in #157, die offen
geblieben ist: ein Urteil darf nicht sicherer klingen, als seine Quelle ist.

---

## §13 Was ich nicht belegen konnte

Eine Lücke in der Recherche ist ein Befund, nicht etwas, das mit einer plausiblen Vermutung
gefüllt wird. Was hier steht, ist **nicht geprüft** — nicht „wahrscheinlich in Ordnung".

### 13.1 Methodische Ursachen

- **Das WebSearch-Budget war in jedem Rechercheschritt nach etwa einem Drittel bis der Hälfte
  erschöpft.** Danach lief alles über direkte URL-Konstruktion, Sitemaps, eingebettete
  Kategorien-JSON und das Durchprobieren von ID-Räumen. Die Länderlücken unten sind **darauf**
  zurückzuführen, nicht darauf, dass die Dokumente nicht existieren. **Abwesenheit ist in diesem
  Bericht schwächere Evidenz als Anwesenheit.**
- **Mehrere amtliche Portale liefern einem Abrufer nur eine leere JS-Hülle:** `landesrecht-bw.de`,
  `rv.hessenrecht.hessen.de`, `gesetze.berlin.de`, `landesrecht-hamburg.de`, `landesrecht.rlp.de`.
  Der funktionierende Weg war `https://www.landesrecht.online/<LAND>/<GESETZ>/<PARAGRAF>` für alle
  16 Länder plus `gesetze-bayern.de` und `schure.de` (Niedersachsen).
- **Der Berlin-Brandenburger Bildungsserver verweigerte über die ganze Sitzung jede Verbindung**
  (`ECONNREFUSED`, 194.76.233.19). Betroffen: RLP Teil C Chemie 7–10, Informatik 7–10 und
  Naturwissenschaften 5/6 — Titel, Status und Datum belegt, **Inhalte nicht gelesen**.
- **Hessen war durchgängig nicht erreichbar** (HTTP 503 / leere ExtJS-App, auch im Internet
  Archive nicht gespiegelt). Sachsen teils login-gated, Bremen HTTP 500, Saarland HTTP 403.
- `WebFetch` kann die PDFs der Ministerien nicht lesen (FlateDecode-Binärströme); jedes PDF musste
  per `curl` geholt und mit `pdftotext -layout` extrahiert werden.

### 13.2 Nicht untersuchte Länder

Der Auftrag nannte NRW, Bayern, BW, Niedersachsen und Berlin/Brandenburg als Pflichtumfang.
**Nicht systematisch untersucht:** Hessen, Sachsen, Sachsen-Anhalt, Thüringen, Schleswig-Holstein
(außer Latein und Geographie), Saarland, Mecklenburg-Vorpommern, Hamburg (außer Physik und
Klausurdauern), Bremen, Rheinland-Pfalz (außer Physik). Brandenburg ist nur für Mathematik,
Geschichte, Geographie und Philosophie belegt, sonst dünn.

### 13.3 Einzelne offene Punkte

**Struktur und Regelwerk**

1. **Welche zwölf Länder** laut KMK-FAQ (29.09.2025) das Mathematik-Abitur mit WTR durchführen —
   das Dokument nennt die Zahl, nicht die Namen.
2. **Niedersachsens Taschenrechner-Erlass** lag nur als **Entwurf** vor („RdErl. d. MK v. x.x.2021").
   Inhaltlich durch das Schulverwaltungsblatt bestätigt, die amtliche Endfassung nicht gelesen.
3. **NRWs Klassenarbeitszahlen und -dauern (Sek I)** stehen in den Verwaltungsvorschriften zu § 6,
   nicht in der Verordnung; die BASS-Navigation lieferte 400/404. Ebenso **NRWs
   Abiturklausurdauern** (§ 32 Abs. 2 delegiert an einen Runderlass, der nicht erreicht wurde) —
   die KMK-Tabelle in §2.2 deckt nur die Bildungsstandards-Fächer.
4. **Klausurzahlen und -dauern für Sachsen, Brandenburg und Schleswig-Holstein** — alle drei
   delegieren an Verwaltungsvorschriften.
5. **Keine einzige vollständige Stundentafel** wurde primär belegt. Nicht aus Sekundärquellen
   füllen.
6. **Hamburg G8/G9** — ein Teilbefund sagte „noch G8", was ich **nicht** primär verifizieren konnte
   und was Presseberichten widerspricht. **Vor Produktnutzung nachprüfen.**
7. **Hessen Sek I vollständig** (VOGSV) — damit bleibt auch Hessens Diktat-Frage absichtlich offen.
8. **Berlins Anlage-4-Klassenarbeitszahlen** und die §-Nummerierung der §§ 34/39 stammen aus
   Internet-Archive-Snapshots (2020) und müssen gegen die aktuelle Fassung geprüft werden; BWs
   Verordnungstext ebenso (Snapshot 2023).
9. **Brandenburgs Abitur-Hilfsmittel** und ob Hörverstehen/Sprachmittlung dort Pflicht sind — die
   jährlichen MBJS-„Hinweise" sind nirgends öffentlich.
10. **Bayerns Hilfsmittellisten** — GSO §§ 22 Abs. 6 und 49 Abs. 4 delegieren an nicht öffentliche
    KMS; das Wort „Wörterbuch" kommt in der Verordnung nicht vor. Ebenso ungeklärt: in welchen
    Jahrgangsstufen die verpflichtende mündliche Schulaufgabe liegt, ob die Jahrgangsstufentests
    außer Deutsch als Note zählen, und die bayerische Hausaufgabenregel.
11. **Bayerns Physik-Hilfsmittel.** Belegt ist nur, dass das ISB die ländergemeinsame
    Formelsammlung bereitstellt. Die Aussagen „nicht programmierbarer TR, kein MMS" stammen aus
    Suchergebnis-Zusammenfassungen, **nicht aus einem gelesenen Primärdokument**.
12. **Thüringens Seminarfacharbeit** und **Niedersachsens Facharbeit im Seminarfach** — beide
    reputierlich verpflichtend, keine primär verifiziert. **Rheinland-Pfalz ÜSchO** und **Berlins
    Sek-I-VO** nicht lokalisierbar.
13. **Seitenzahlen für Facharbeit/Seminararbeit** fehlen in **jeder** gelesenen Verordnung (§2.1).

**Fachliches** 14. **BW: zwei unaufgelöste Widersprüche.** (a) Die Bildungsplan-Operatorenliste (mit AFB) gilt für
die Standards, der Facherlass verweist für das Abitur auf den IQB-Grundstock — **welche im
Abitur gilt und wie der Konflikt bei „aufstellen" (BW: AFB III) aufgelöst wird, ist offen.**
(b) Teile der BW-Standards sind im HTML gestrichelt unterstrichen; **eine Legende dazu fand
sich nicht** — ob verbindlich, vertiefend oder G8/G9-variantenabhängig, ist unklar. 15. **BW G9-Rückkehr:** alle BW-Klassenstufenangaben dieses Berichts beziehen sich auf den
**Bildungsplan 2016 (G8)**; ein G9-Bildungsplan konnte nicht belegt werden. **BWs
Oberstufen-Informatik ist ausdrücklich ein Schulversuch** — ob und wie dort geprüft wird: offen. 16. **Bayerns LehrplanPLUS Oberstufe (Jgst. 11–13) für Informatik und Chemie-nicht-NTG** im
Volltext nicht erreicht (Umstellung zu 2026/27, Slugs nicht erratbar, Suche JS-getrieben). 17. **NRW: die Zuordnung „Erste/Zweite Stufe" zu Jahrgangsstufen steht nicht im Kernlehrplan.** Die
in schulinternen Plänen übliche Abbildung „Erste Stufe → 7/8, Zweite Stufe → 9/10" ist
**Schulpraxis, nicht Landesvorgabe** — sie steht deshalb nicht in den Tabellen dieses Berichts. 18. **IQB-Erwartungshorizonte der Pool-Aufgaben** sind nicht öffentlich (`…_Erwartungshorizont.pdf`
→ 404). Für die Kalibrierung von Toleranzbändern blieb **ein** vollständiger Erwartungshorizont
(NRW Physik GK) — **dünne empirische Basis**. 19. **NRWs Konstruktionsvorgaben Mathematik** sind in der abrufbaren Fassung **veraltet** (nennen
GTR); die aktuelle wurde nicht gefunden. 20. **Hilfsmittel im Abitur** nicht belegbar für: Biologie in BW, Niedersachsen, Berlin/Brandenburg ·
Chemie in BW · Physik in Niedersachsen, RLP · **Informatik in Niedersachsen, BW, Berlin,
Brandenburg**. Damit ist **„das Informatik-Abitur findet am Rechner statt" für kein Land
belegt** — belegt ist das Gegenteil für NRW und Bayern. 21. **Bayerns Operatorenlisten** für Chemie (im PDF-Textlayer nicht vorhanden, wohl Grafik), Kunst,
Musik, Religion und Ethik: nicht gefunden; für **Informatik existiert keine** (positiv belegt). 22. **Übernahme der WeBiS-Neufassung 2024 in die Länder-Sek-I-Pläne:** ungeprüft. Alle zitierten
Länderpläne (NRW 2019, Niedersachsen 2015, Brandenburg 2015, BW 2016) sind **älter** als die
Neufassung. 23. **Niedersachsens KC Informatik Sek I ist von 2014** — neun Jahre älter als die
Pflichtfacheinführung 2024/25; ob ein neues KC erlassen wurde, ist ungeklärt. Das im KC
angekündigte Dokument zu **„Standards und Schreibweisen"** (ER-Modelle, Klassendiagramme,
ADT-Operationen) wurde nicht gefunden — es wäre für die Notations-Prüfbarkeit zentral. 24. **Materialgestütztes Schreiben in Hessen und Sachsen:** nicht ermittelt. Einführungsjahr in
Berlin/Brandenburg: nicht ermittelt. 25. **Fremdsprachen:** Bayerns GER-Niveaus für Sek I · die Niveaus für Spanisch/Russisch neu
einsetzend in NRW · **Diktat in Französisch/Spanisch** (in keiner geprüften Quelle als
Prüfungsform belegt — **Lücke, kein Negativbefund**) · Umfang der Facharbeit im Fach Deutsch ·
welche Länder in Deutsch eine Präsentationsprüfung anbieten. 26. **Kunst/Musik/Religion:** Abmeldealter und religiöse Mündigkeit · exegetische Methodenschritte
(synchron/diachron) · Portfolio als Pflichtform · Berlins Ethik-Jahrgangsstufen · die
Karvonen-Formel im Sport. **Dass BW keinen Operatorenkatalog Bildende Kunst hat, ist
wahrscheinlich, aber nur durch Verzeichnis-Enumeration gestützt.**

### 13.4 Negativbefunde — korrigiert am 02.10.2026, **keine Ausschlussliste**

> **Korrektur (Issue #193, Kommentar vom 02.10.2026).** In der ersten Fassung stand hier, die
> 25 Begriffe unten kämen in **keiner** Primärquelle vor und sollten **nicht** als Aufgabenformen
> ins Produkt wandern. Das war für **13 von 25** falsch. Die Suche lief über Fachjargon und
> englische Begriffe („Punnett", „VSEPR", „Freikörperbild") und wertete „kein Treffer" als Beweis —
> dieselbe Aufgabenform steht in den Lehrplänen unter ihrem deutschen Schulnamen
> (Kreuzungsschema, Elektronenpaarabstoßungsmodell, Kräftezerlegung). Mehrere davon nennt dieser
> Bericht an anderer Stelle sogar selbst als Aufgabenform (§3, §4.1, §4.3).
>
> **Regel für die Nutzung:** Kein Eintrag dieses Abschnitts ist ein Grund, eine Aufgabenform aus
> dem Produkt herauszuhalten. Wo eine Form nicht gebaut wird, entscheidet das #224 nach
> Machbarkeit und Kosten, nicht ein Nulltreffer.
>
> **Belegstand, offen gesagt.** Die amtlichen Seiten (kmk.org, lehrplanplus.bayern.de,
> bildungsplaene-bw.de, schulentwicklung.nrw.de) waren aus der Arbeitsumgebung **gesperrt** — bei
> der Neurecherche am 02.10. und bei der Überprüfung dieser Korrektur. Die Lehrplan-Aussagen der
> Spalte „Beleg" stützen sich deshalb auf (a) diesen Bericht selbst, (b) den Kommentar in #193
> vom 02.10. (Suchauszüge der amtlichen Seiten, nicht die geöffneten PDFs) und (c) die
> Fachtabellen in #224 (ebenfalls Suchauszüge; 77 der 347 Zeilen dort sind nur Erfahrungswissen
> und als solche markiert). Der Kommentar nennt sieben der dreizehn ausdrücklich; die übrigen
> sechs sind hier aus (a) und (c) zugeordnet. **Die Spalte „Buddy" ist dagegen gegen den Code
> geprüft** (`origin/main` a0d18ab, 02.10.2026).

**A — revidiert: die Aufgabenform steht im Lehrplan (13)**

| Alter Eintrag                                | Wie sie in der Schule heißt                                 | Beleg                                                                                                               | Buddy heute (Code)                                                                                                                                                                                                                                           | Geplant                                                          |
| -------------------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------- |
| Fermi-Abschätzung                            | Fermi-Aufgabe (Zahl + Annahmenkette)                        | §3 dieses Berichts; #193 (02.10.); #224 Mathe GS3–4                                                                 | Kein eigener Prüfer. Eine Annahmenkette hat keinen festen Schlüssel; die Endzahl ist nur mit Schlüssel prüfbar (`modules/practice/evaluate.ts`)                                                                                                              | #224 ordnet sie #211 zu (Rubrik, gebaut: `rubric.ts`)            |
| Freikörperbild                               | Kräftezerlegung, Kräfteaddition, Kraftpfeile                | §4.1 dieses Berichts (nennt die deutschen Begriffe selbst); #193 (02.10.); #224 Physik                              | Zeichnen wird ehrlich als nicht übbar benannt („force arrows" in `NOT_PRACTICABLE_RULES`, `modules/materials/extract.ts`, #198); Komponenten berechnen geht als Zahl (`evaluate.ts`)                                                                         | #257 (Kraftpfeile), #249 (Zeichnen auf Raster)                   |
| Punnett                                      | Kreuzungsschema, Spaltungsverhältnis, Kombinationsquadrat   | §4.3 Tabelle „Genetik-Kreuzungsschema" (Brandenburg 9/10, BW 9/10); #193 (02.10.); #212                             | Verhältnis gekürzt im Code verglichen, **ab drei Teilen** (`sameRatio`, `modules/practice/chemistry.ts`; „9:3:3:1" ja, „3:1" geht noch an den Tutor, weil es auch Uhrzeit oder Division sein kann, #175); Kombinationsquadrat als Tabelle (`table.ts`, #230) | Zweiteiliges Verhältnis braucht die Markierung aus #157          |
| VSEPR                                        | Elektronenpaarabstoßungsmodell (EPA-Modell)                 | §4.2 dieses Berichts (nennt „EPA-Modell" selbst); #193 (02.10.)                                                     | Molekülgeometrie benennen geht als Kurzantwort/MC (`evaluate.ts`); Strukturformel zeichnen ist als nicht übbar benannt („structural formula", `extract.ts`)                                                                                                  | #253 (Strukturformeln), #239 (Formelzeichen)                     |
| vollständige Induktion                       | vollständige Induktion                                      | #193 (02.10.): Pflicht in Hessen; §3 Tabelle dieses Berichts. Der alte Befund galt nur für KMK AHR 2012, BW, Bayern | Kein Prüfer: `modules/practice/steps.ts` lehnt Beweise ausdrücklich ab und gibt sie an das Modell                                                                                                                                                            | #224: #211 (Rubrik), #228 (Reihenfolge, gebaut: `structured.ts`) |
| Kurvendiskussion / Nebenbedingung / Krümmung | Funktionsuntersuchung; Extremwertaufgabe mit Nebenbedingung | §3 Tabelle dieses Berichts (beide als Aufgabenform); #193 (02.10.); #224 Mathe O                                    | Teilergebnisse als Zahl/Term (`evaluate.ts`); Rechenweg Zeile für Zeile, eine Variable (`steps.ts`, #209); Graph zeichnen ist als nicht übbar benannt                                                                                                        | #249 (Graph auf Raster), #263 (Prüfer erweitern)                 |
| Exzerpt                                      | Exzerpieren                                                 | #193 (02.10.); #224 Deutsch („Protokoll, Exzerpt, Mitschrift")                                                      | Freier Text, Rückmeldung je Element, wenn die Extraktion eine Rubrik schreibt (`rubric.ts`, #211)                                                                                                                                                            | —                                                                |
| Kontrollansatz                               | Kontrollansatz, Variablenkontrolle, Blindprobe              | §4.3 Tabelle „Kontrollansatz identifizieren" (C); #224 Biologie                                                     | Identifizieren geht als MC/Kurzantwort (`evaluate.ts`); Experiment planen als Schreibaufgabe mit Rubrik (`rubric.ts`)                                                                                                                                        | —                                                                |
| Selektionstyp                                | Selektionsformen                                            | #224 Biologie O (Suchauszug, nicht selbst geöffnet)                                                                 | Benennen geht als Kurzantwort/MC (`evaluate.ts`)                                                                                                                                                                                                             | #245 (Diagramme), #256 (Stammbaum)                               |
| Oktal-/Hexadezimalumrechnung                 | Zahlensysteme: binär, dezimal, hexadezimal                  | #224 Informatik M (Suchauszug)                                                                                      | Geht als Kurzantwort mit exaktem Schlüssel (`evaluate.ts`)                                                                                                                                                                                                   | —                                                                |
| RSA-Rechnen                                  | Verschlüsselung: Caesar, Vigenère, RSA                      | #224 Informatik M–O (Suchauszug)                                                                                    | Geht als Zahl/Kurzantwort (`evaluate.ts`)                                                                                                                                                                                                                    | —                                                                |
| „W-Fragen" beim Bericht                      | Bericht (Unfall, Zeitungsbericht) mit W-Fragen              | #224 Deutsch U (Suchauszug). **Präteritum** als Vorgabe ist damit nicht belegt                                      | Schreibaufgabe mit Rubrik; `rubric.ts` zählt Pflichtangaben (`mentions`) und prüft die Zeitform (`tense`) gegen ihren Text                                                                                                                                   | —                                                                |
| Gesprächsprotokoll Deutsch                   | Protokoll (Versuchs-, Gesprächs-)                           | §2 dieses Berichts (Leistungsnachweis „Protokoll"); #224 Deutsch                                                    | Schreibaufgabe mit Rubrik (`rubric.ts`)                                                                                                                                                                                                                      | —                                                                |

**B — der Begriff fehlt, die Aufgabe gibt es; Buddy übt sie (noch) nicht (4)**

| Eintrag                                                      | Was stimmt, was nicht                                                                                                          | Buddy heute (Code)                                                                                        | Geplant                                              |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| Ethogramm                                                    | Der Begriff fehlt; die Form „Verhaltensbeobachtung dokumentieren" steht in §4.3                                                | Beobachten ist als nicht übbar benannt („experiment", `extract.ts`)                                       | #224: bewusst nicht (Beobachtung)                    |
| „beschriften" und „mikroskopieren" als Operatoren            | Als **Operatoren** weiterhin nicht belegt; **Beschriftungsaufgaben** sind dagegen häufig (§4.3, #224 Biologie/Chemie/Erdkunde) | „a labelled schema" und „microscopy" sind als nicht übbar benannt (`extract.ts`)                          | #252 (Schema-Bibliothek, Beschriften durch Antippen) |
| Ittens sieben Kontraste als vorgeschriebene Liste            | Die geschlossene Liste bleibt unbelegt (§10); Farbkreis nach Itten und Farbkontraste sind Aufgaben (#224 Kunst)                | Benennen als Kurzantwort/MC; farbige Fotoausschnitte seit #223                                            | #261 (Farbkreis als Figur)                           |
| die freie Erörterung ohne Textvorlage als Abitur-Aufgabenart | Für das **Abitur** belegt (§6.4, NRW-Zitat). In der Sek I ist die Erörterung Standard (#224 Deutsch M)                         | Langer Text ist als nicht übbar benannt („long_text", `extract.ts`); kurze Texte mit Rubrik (`rubric.ts`) | #258 (lange Texte, Rückmeldung je Kernpunkt)         |

**C — nicht erneut geprüft (8).** Linearisieren · Michaelis-Menten / Km / Vmax · Oszilloskop ·
molekulare Uhr · Born-Haber-Kreisprozess · Iod-Stärke-Reaktion · IEEE-754 · Heftführung als
Bewertungsgrundlage. Für diese acht liegt weder ein Gegenbeleg noch ein neuer Beleg vor. Die
Suche, die sie gefunden hat, ist dieselbe, die bei den dreizehn oben falsch lag — sie sind daher
**offene Punkte wie §13.3, keine Negativbefunde**. Michaelis-Menten etwa ist englischer
Fachjargon; „Enzymaktivität auswerten" steht als Diagrammaufgabe in #224 (→ #245).

---

## §14 Quellen

Alle Webquellen **am 01.10.2026 abgerufen**. „Stand"/„i. d. F." ist das Eigendatum des Dokuments.
Die vollständigen URL-Listen mit Dateinamen liegen in den Rechercheprotokollen zu diesem Bericht;
hier stehen die Dokumente, auf die sich der Text stützt.

**KMK** (`kmk.org`) — _Vereinbarung zur Gestaltung der gymnasialen Oberstufe und der
Abiturprüfung_, 07.07.1972 **i. d. F. 06.06.2024** · _Vereinbarung über die Schularten und
Bildungsgänge im Sekundarbereich I_, 03.12.1993 **i. d. F. 07.10.2022** ·
_Handlungsempfehlung … Künstliche Intelligenz in schulischen Bildungsprozessen_, **10.10.2024** ·
_Bildungsstandards Mathematik für die AHR_, 18.10.2012 · _Bildungsstandards Mathematik ESA/MSA_,
04.12.2003 **i. d. F. 23.06.2022**, Korrektur 18.06.2026 · _Bildungsstandards AHR Physik / Chemie /
Biologie_, je 18.06.2020 · _Weiterentwickelte Bildungsstandards (WeBiS) Physik / Chemie / Biologie
(MSA)_, 16.12.2004 **i. d. F. 13.06.2024** · _Bildungsstandards Deutsch für die AHR_, 18.10.2012 ·
_Bildungsstandards erste Fremdsprache_, 15.10.2004 u. 04.12.2003 **i. d. F. 22.06.2023** ·
_Bildungsstandards fortgeführte Fremdsprache für die AHR_, 18.10.2012 · _Beschluss zum
Abituraufgabenpool_, 15.10.2020 · _Gesamtstrategie zum Bildungsmonitoring_, 11.06.2015 ·
_Vereinbarung zur Weiterentwicklung von VERA_, 08.03.2012 · _Eckpunktepapier Medienbildung /
informatische Bildung Grundschule_, 28.11.2024 · **EPA** Informatik (01.12.1989 **i. d. F.
05.02.2004**), Geschichte (**i. d. F. 10.02.2005**), Bildende Kunst (**i. d. F. 10.02.2005**), Musik
(**i. d. F. 17.11.2005**), Kath. Religionslehre · Philosophie · Psychologie · Recht (je **i. d. F.
16.11.2006**), Sport (**i. d. F. 28.09.2017**), Latein, Griechisch, Erziehungswissenschaft,
Sozialkunde/Politik, Geographie.

**IQB** (`iqb.hu-berlin.de`) — _Grundstock von Operatoren_ Mathematik (**28.02.2019**),
Naturwissenschaften (**31.03.2022**), Deutsch (**28.02.2019** und **05.01.2026**), Englisch
(**28.02.2019** und **29.01.2025**, letztere gültig ab Prüfungsjahr 2027) · _Hinweise zur Verwendung
von Hilfsmitteln_ Mathematik und Naturwissenschaften, **Stand 23.01.2024**, je in den Fassungen „bis
2029" und „ab 2030" · _Ländergemeinsame mathematisch-naturwissenschaftliche Formelsammlung_,
**Stand 13.06.2024** · _Kriterien für Aufgaben, Erwartungshorizonte und Bewertungshinweise_,
27.10.2020 · _Beschreibung der Struktur der Aufgaben_, 15.11.2021 · _Inhaltliche Vereinbarungen_
Chemie (19.01.2022) und Physik (20.01.2022) · Pool-Aufgaben Physik 2025/2026 · _FAQs Digitale
Hilfsmittel ab 2030_, **Stand 29.09.2025** · IQB-Pflichtlektüren Deutsch 2026–2028 (Kleist, _Der
zerbrochne Krug_; Erpenbeck, _Heimsuchung_).

**Nordrhein-Westfalen** (`lehrplannavigator.nrw.de`, `standardsicherung.schulministerium.nrw.de`,
`qua-lis.nrw.de`) — Kernlehrpläne SI Gymnasium G9 Mathematik, Physik, Chemie, Biologie, Deutsch
(23.06.2019), Latein, Informatik 5/6 (01.07.2021) und WP (01.06.2023) · Kernlehrpläne GOSt
Mathematik (**07.06.2023**), Physik, Chemie, Biologie (je 07.06.2022), **Deutsch (24.05.2023,
Abitur ab 2026)**, **Latein (24.08.2026, gültig ab SJ 2027/28)**, Geographie (**24.08.2026**),
Geschichte, Sozialwissenschaften, Philosophie, Religionslehren, Erziehungswissenschaft, Psychologie,
Recht, Kunst, Musik, Sport, Informatik (Heft 4725, Neufassung in Kraft **01.08.2027**) ·
Operatorenübersichten Mathematik (ab Abitur 2023, angepasst 2026), Biologie (ab Abitur 2025),
Englisch (ab Abitur 2025), Französisch · Spanisch · Russisch (je ab Abitur 2025), Deutsch (27
Operatoren), Latein und Griechisch (ab 2017), Informatik (**Stand 14.09.2015**), Geographie
(**24.09.2015**), Geschichte, Philosophie (24.09.2015), Religionslehren (fünf byteweise identische
Listen) · _Klausuren in den modernen Fremdsprachen in der gymnasialen Oberstufe_, **Stand
27.10.2025** · Konstruktionsvorgaben Biologie (ab Abitur 2025), Latein (2015), Griechisch
(18.12.2015), Mathematik (veraltet, §13.3) · Vorgaben zum Zentralabitur **2027/2028/2029** für
Mathematik, Informatik, Biologie, Chemie, Physik, Französisch, Englisch, Russisch, Latein,
Griechisch, Geographie, Erziehungswissenschaft, Psychologie, Recht · Beispielaufgaben Biologie GK
und LK (ab Abitur 2025, mit Erwartungshorizont), Deutsch IV a LK (12.08.2024) und IV b LK
(24.08.2022) · **APO-S I, Stand 01.08.2025** · **APO-GOSt** (alte Fassung und neue, ausgefertigt
**16.07.2026**) · Runderlass Hausaufgaben **05.05.2015** (BASS 12–63 Nr. 3) · RdErl.
**02.10.2011** – 522-6.03.15.06-97869 (Sprechprüfung, VV 6.8.3 und VV 14.23) · Abiturverfügung 2026.

**Bayern** (`lehrplanplus.bayern.de`, `isb.bayern.de`, `gesetze-bayern.de`) — **GSO**, 23.01.2007,
letzte Änderung **01.07.2026** (§§ 21–23, 26, 28, 29, 32, 33, 49, 57, Anlage 8) · BayEUG Art. 56
Abs. 5 · LehrplanPLUS Fachlehrpläne Gymnasium Mathematik 5/7/9/10/11/12/13, Natur und Technik 7,
Physik 8–13, Chemie 8 (NTG) und 11, Biologie 9/10, Informatik 9 (NTG) und 10 (NTG), Deutsch 5–10,
Geographie 5/7/10/11, Kunst 7/11, Praktische Philosophie · _Abiturprüfung im Fach Mathematik am
neunjährigen Gymnasium_, **KMS 23.07.2024**, V.7-BS5500.0/240/1 · _Operatoren im Fach Mathematik
(Jgst. 5)_, **Stand März 2024** · Operatoren Geschichte, **Stand März 2025** · IlluPA Biologie
(**Stand September 2023**), Chemie, Geographie (**Stand September 2023**), Politik und Gesellschaft ·
Abiturprüfung 2023 Mathematik Teil A (CAS) · Abiturprüfung 2026 Informatik gA und eA · Kontaktbriefe
Chemie 2024 und 2025 · ISB-Kontaktbrief Deutsch 2025 (Abitur 2026) · **KMS Deutsch 29.06.2023** ·
**KMS 28.09.2026** (erweitertes Diktat-/Übungsverbot) · _Gute Aufgaben im Physikunterricht_,
Fassung Nov. 2023 · Jahrgangsstufentests Deutsch Jg. 6 und 8 · Hinweise zu unerlaubten Hilfsmitteln,
**Stand 29.06.2026**.

**Baden-Württemberg** (`bildungsplaene-bw.de`, `rp.baden-wuerttemberg.de`, `landesrecht.online`) —
**Bildungsplan 2016** Gymnasium Mathematik, Physik, Chemie, Biologie, BNT, Deutsch, Geographie,
Gemeinschaftskunde, Wirtschaft, Englisch, Französisch, Spanisch, Latein, Musik, Bildende Kunst,
Informatik (Aufbaukurs Kl. 7; Schulversuch Basis-/Leistungsfach), IMP (Kl. 8–10) — jeweils
einschließlich des Operatorenkapitels · **NVO** (Notenbildungsverordnung), **Stand 08.04.2026**
(§§ 7, 9) · **AGVO** § 21 · _Erlass für die Abiturprüfung 2025 im Fach Mathematik_, KM35-6615-10/4 ·
_Erlass für die Abiturprüfung 2026_, Az. KM35-6615-137/4, **Stand 25.06.2024** ·
_Beurteilungs- und Korrekturrichtlinien_ moderne Fremdsprachen und **Latein/Griechisch**,
Abiturprüfung 2026, KM35-6615-137/5, **Stand 25.06.2024** · _Fachpraktische Abiturprüfung
Leistungsfach Musik_ (gültig ab 2021/22, erstmals Abitur 2023) · _Leistungsfach Mathematik —
Schriftliche Abiturprüfung ab 2023_.

**Niedersachsen** (`cuvo.nibis.de`, `mk.niedersachsen.de`, `schure.de`) — _Kerncurriculum Gymnasium
Schuljahrgänge 5–10 Naturwissenschaften_ (2015, inkl. Operatorenanhang) · Kerncurricula gymnasiale
Oberstufe Physik, Chemie (2022), Biologie (2022), Mathematik (2018), Deutsch (2016), Informatik
(2017), Geschichte, Geographie, Politik-Wirtschaft, Werte und Normen (mit **verbindlicher
Grundbegriffsliste**, Anhang A2), Musik, Kunst, Sport · KC Informatik Sek I (2014) · _Operatoren für
die Naturwissenschaften_, **Stand 15.02.2024** · **RdErl. 01.08.2025 – 33-81011** (SVBl. 9/2025
S. 492, VORIS 22410: schriftliche Lernkontrollen, Nr. 6.7 Sprechen) · EB-VO-GO · _Zum Einsatz von
Taschenrechnern im Abitur_ (**Entwurfsfassung**, §13.3) · Schulverwaltungsblatt 01/2022.

**Berlin / Brandenburg** (`berlin.de/sen/bildung`, `bildungsserver.berlin-brandenburg.de`,
`landesrecht.online`) — _Rahmenlehrplan 1–10 Teil C_ Deutsch, Physik 7–10, Biologie 7–10 (amtliche
Fassung 10./16.11.2015), Geschichte, Geografie, Politische Bildung · _RLP für die gymnasiale
Oberstufe Teil C_ Mathematik (Brandenburg, 2022), Physik (2021/22), Chemie (2021), Informatik
(Berlin, 2022), **Philosophie (2025)**, Geschichte (**GOST 2025**), Geografie (2024) · Berliner
_Prüfungsschwerpunkte 2026_ Mathematik, Physik, Chemie, Biologie (je GK und LK) — und der
**Negativnachweis** `ps_informatik_2026_{gk,lk}.pdf` → **HTTP 404** · _Fachbrief Nr. 6 Biologie
Chemie Physik_ (Veränderungen im schriftlichen Abitur ab 2025) · _Fachbrief Nr. 6 Chemie_ ·
LISUM, _Aufgabenarten Deutsch_, **08.12.2022** · **VO-GO** §§ 14, 15, 44 · **GOSTV** § 12 Abs. 5,
§ 22 · Realaufgabe Kunst GK 2025 (Brandenburg).

**Weitere Länder** — Hamburg **APO-AH** § 24 Abs. 2; Bildungsplan Gymnasium Sek I Physik und
NWT 5–6 (in Kraft 01.08.2024); HIBB-Richtlinie **17.04.2024** (KI, nur berufsbildende Schulen) ·
Sachsen **SOGYA** §§ 26, 27, 49, 53 · Schleswig-Holstein **OAPVO** §§ 11, 12, 28 sowie _Leitfaden zu
den Fachanforderungen Latein_, **Kiel, Juli 2016**, und Fachanforderungen Geographie, Kunst, Musik ·
Rheinland-Pfalz Lehrpläne Biologie/Chemie/Physik 7–9/10 (2014), _Rundschreiben AbiPrO 2026_,
MSS-Lehrplan Sozialkunde · Thüringen Lehrplan Geschichte (2021) · Mecklenburg-Vorpommern
Zentralabitur Informatik 2012 (indirekt).

**Fachverbände** — **GI**, _Bildungsstandards Informatik für die Sekundarstufe I_, verabschiedet
**31.01.2025** (ersetzt die Fassung vom 24.01.2008); _… Sekundarstufe II_, 29.01.2016;
**Informatik-Monitor 2025/26, Stand Oktober 2025** (als Sekundärquelle gekennzeichnet) · **GPJE**,
_Nationale Bildungsstandards für den Fachunterricht in der Politischen Bildung an Schulen_, 2004 ·
**DGfG**, _Bildungsstandards im Fach Geographie für den Mittleren Schulabschluss_ und _Standards für
die Sekundarstufe II_ (2024), _Curriculum 2000+_ (Bonn 2002).

**Code-Stand dieses Berichts** (§11, §12) — Repository `0xKurt/LearnBuddy`, Branch `main`,
01.10.2026: `packages/shared-types/src/contracts/learning.ts`, `figure.ts`, `bars.ts`, `buddy.ts` ·
`apps/api/src/modules/practice/{evaluate,items,keyCheck,tapChoices,tutor,generate,selection,service,speak,bars}.ts` ·
`apps/api/src/modules/materials/{extract,images,passages}.ts` · `apps/api/src/i18n/de.json` ·
`apps/mobile/components/practice/*.tsx`, `apps/mobile/components/math/MathKeys.tsx`,
`apps/mobile/app/practice/[id].tsx` · `docs/architecture.md` §Practice, §Material.

---

## §15 Was aus diesem Bericht folgen sollte (ohne Priorisierung)

Dieser Bericht beschreibt und bewertet; er beschließt nichts. Nach der Owner-Regel vom 28.09. wird
aus jeder Kritik **zuerst ein Issue**, und gearbeitet wird nach Priorität. Die Punkte, die dieser
Bericht als Issue-Kandidaten hergibt, in der Reihenfolge, in der sie im Text stehen:

1. **Die mehrschrittige Aufgabe mit Pflichtelementen** (§12.4) — die eine Empfehlung.
2. **Buddy muss sagen können, dass er eine Aufgabenform nicht üben kann** (§12.3, letzter Absatz) —
   ein Wert in `MaterialFailure` oder ein eigenes Feld, und eine Regel in `extract.ts`, die eine
   nicht übbare Aufgabe als solche meldet statt sie durch Wissensfragen zu ersetzen. **Das ist der
   kleinste Eingriff mit der größten Ehrlichkeitswirkung.**
3. **`extract.ts` braucht die Typbarkeits-Regel, die `generate.ts` schon hat** (§11.4) — ein Satz.
4. **`spelling` darf in Lese- und Hörverstehen nicht `strict` sein** (§12.2 d) — ein Satz in
   `SPELLING_RULES`.
5. **`selection.ts` sollte `long` aus Testsitzungen ausschließen**, wie `generate.ts` es tut
   (§12.2 e) — eine Zeile.
6. **Der Ansatz gehört zur Rechnung** (§12.2 b) — fällt mit Punkt 1 zusammen, ist aber auch allein
   sinnvoll: ein zweites Feld „Wie bist du hingekommen?" bei `numeric`, nicht bewertet, aber
   gefragt.
7. **Latein braucht einen eigenen Schreibungs-Default** (§12.2 c).
8. **Gehörbildung** (§12.3, letzte Zeile der Tabelle) — das billigste **C**-Stück, das heute fehlt;
   es braucht eine Notensatz-Eingabe, nicht einen neuen Prüfer.
9. **Ein Land-Feld.** Dieser Bericht zeigt an mindestens zwölf Stellen, dass dieselbe Antwort je
   Land richtig oder falsch ist (Satzglieder, `vergleichen`, Hypothesentest, Metrum, Klimatyp,
   Puffer-Rechnung). Buddy kennt heute Klasse und Fach, aber kein Land. Solange das so ist, kann
   eine Rückmeldung fachlich korrekt und für ihre Schule trotzdem falsch sein.

---

## §16 Nachtrag: die Fächer, die in der Analyse #224 noch fehlten (Issue #265)

**Stand:** 02.10.2026, Code-Stand `origin/main` 4ed87e3 · **Auftrag:** Issue #265 (Owner,
02.10.2026: _„Wichtig ist, dass die allgemeinen Fächer … gut abgedeckt sind (fehlt sicher was)"_).

> **Was dieser Nachtrag ist und was nicht.** Die Analyse in #224 hat 347 Aufgabentypen in 16
> Fächern. Hier kommen acht Fächer dazu: Wirtschaft/Recht mit **BwR**, **Technik/NwT**,
> **Sport-Theorie**, **Philosophie/Ethik in der Oberstufe**, **Psychologie/Pädagogik**,
> **Griechisch**, **Russisch** und **Darstellendes Spiel**. Je Fach die häufigsten Aufgabentypen im
> Format der Bedarfstabelle (Zeigen · Produzieren · Prüfbar · Erkenn-Variante), dann der Abgleich
> mit dem Code und die Zuordnung zu den Bausteinen der Wellen 1–6.
>
> **Belegstand, ehrlich:** Die **Aufgabenformen** stützen sich, wo es sie gibt, auf die Abschnitte
> oben (§9.3 Wirtschaft/Recht/Psychologie, §10.1 Philosophie, §10.3 Sport, §7 und §8 für die
> Sprachen) und auf Suchauszüge vom 02.10.2026 (§16.10). Mehrere Primärquellen waren aus dieser
> Umgebung **nicht abrufbar** (der ISB-Server, `isb.bayern.de`, wird vom Netz-Proxy blockiert);
> Zeilen ohne eigenen Beleg sind **Erfahrungswissen** und mit ¹ markiert. Die **Häufigkeiten sind
> geschätzt**, wie in #224. Die **Prüfbarkeit** (C/R/H, §0.2) ist meine Analyse.

### 16.1 Was „heute" heißt — der Code-Stand, gegen den abgeglichen wurde

Auf `main` (4ed87e3) vorhanden: Kurzantwort getippt, mehrzeilige Eingabe (#221), Multiple Choice,
Vokabeln getippt und angetippt (#147), Aussprache (gesprochen), **Reihenfolge (#228), Zuordnen
(#229), Tabelle ausfüllen (#230)** als eine Maschinerie (`AnswerPart`, Migration 0072), die
Kernpunkte-Rubrik (#211), Hörverstehen (#210, braucht `SPEECH_BACKEND`), Notenzeile (#226),
Reaktionsgleichungen (#212), Bruchstreifen, Lernkarten. **Noch offen** und deshalb „teilweise":
Bilder in Antwortoptionen (#231), Lückentext (#232), Lesetext sichtbar (#233), Markieren (#234),
Term-Gleichwertigkeit (#235, zur Hälfte), Mehrfachauswahl (#240), alle Figuren der Welle 5
(#245–#249), Schema-Bibliothek (#252), Baumdiagramm (#256), lange Texte (#258), Schaltplan
(#261), Quelltext (#262).

Zwei Code-Befunde, die nur die neuen Sprachen betreffen (`apps/api/src/modules/practice/evaluate.ts`):

- `withoutAccents` zerlegt nach NFD und **entfernt alle Kombinationszeichen**. Ein fehlender
  griechischer Akzent oder Spiritus und ein fehlendes russisches Betonungszeichen werden dadurch
  zum Beinahe-Treffer `close` — als Rückmeldung vertretbar, aber **`ё` gegen `е`** fällt in
  dieselbe Klasse, obwohl `е` statt `ё` im gedruckten Russisch üblich und nicht falsch ist. Und das
  **Schluss-Sigma** (`ς` gegen `σ`) ist kein Kombinationszeichen: `λογοσ` statt `λογος` ist für den
  Vergleich ein ganz anderer Buchstabe.
- Die Sprachausgabe (`apps/api/src/speech/google.ts`, `LOCALES`) kennt **`ru-RU`**, aber **kein
  Griechisch** — weder Neugriechisch noch eine Aussprache für Altgriechisch. Hörverstehen und
  Vorlesen gehen damit in Russisch, in Griechisch nicht.

**Eingabe:** die App hat eigene Tasten nur für Mathe (`apps/mobile/components/math/MathKeys.tsx`).
Griechisch und Kyrillisch tippt sie nur, wenn die Schülerin die Systemtastatur dieser Schrift
eingerichtet hat — und für Altgriechisch mit Akzenten und Spiritus hat keine der üblichen
Handy-Tastaturen eine bequeme Belegung.¹

### 16.2 Wirtschaft/Recht und BwR (17)

**Wo:** Bayern Realschule **BwR** (Betriebswirtschaftslehre/Rechnungswesen, Wahlpflichtfächergruppe
II, ab Jg. 7, Abschlussprüfung) · Bayern Gymnasium **Wirtschaft und Recht** · BW **Wirtschaft /
Berufs- und Studienorientierung** · NRW **Wirtschaft-Politik** und **Recht** (O) · Thüringen,
Sachsen-Anhalt (§9.3). **Beleg BwR** (Suchauszug ISB-Infobrief zur Abschlussprüfung 2023): Pflichtteil
(Aufgaben 1–5) und Wahlteil (drei von 6–8), **120 Minuten**, „integrierte Aufgabenform" aus
betriebswirtschaftlichen Fragen, Rechenteilen und Buchführung; Inhalte u. a. **Industriekontenrahmen**,
Eröffnungs- und Schlussbilanz, **Einkaufskalkulation**, Angebotsvergleich. Der Wortlaut des
Infobriefs selbst war nicht abrufbar (§16.10).

| Aufgabe                                                                                                                    | Stufe          | Häuf.  | Zeigen                    | Produzieren                      | Prüfbar                                                                              | Erkenn-Variante                     | heute                                                                                                                                                                          | fehlt → Issue      |
| -------------------------------------------------------------------------------------------------------------------------- | -------------- | ------ | ------------------------- | -------------------------------- | ------------------------------------------------------------------------------------ | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------ |
| **Buchungssatz** zu einem Geschäftsfall oder Beleg bilden (Soll an Haben, Konto-Nr./Kürzel, Beträge; auch zusammengesetzt) | BwR 7–10       | hoch   | Geschäftsfall-Text, Beleg | Konten + Beträge je Seite        | **C** — Kontenmenge und Beträge entscheidbar; Reihenfolge innerhalb einer Seite egal | richtigen Buchungssatz aus 4 wählen | teilweise — als Text ein Stringvergleich, der „2400 FO 1.190,00 an 5000 UEFE 1.000,00, 4800 UST 190,00" nicht als gleich erkennt, wenn Reihenfolge oder Schreibweise abweichen | **neu: V1**        |
| Beleg lesen: Eingangs-/Ausgangsrechnung, Kontoauszug → Geschäftsfall benennen                                              | BwR 7–10       | hoch   | Beleg (Foto/Ausschnitt)   | Geschäftsfall, dann Buchungssatz | **C**                                                                                | Geschäftsfall aus 4                 | teilweise — Beleg als Konzeptbild (#50), bleibt nicht neben der Frage                                                                                                          | #233, **V1**       |
| **T-Konten** führen, Saldo bilden, abschließen (über SBK/GUV)                                                              | BwR 7–10       | hoch   | T-Konto                   | Einträge links/rechts, Saldo     | **C** — Summen gleich, Saldo auf der kleineren Seite                                 | —                                   | fehlt — keine T-Konto-Darstellung                                                                                                                                              | **V1**             |
| Umsatzsteuer, Vorsteuer, Zahllast berechnen                                                                                | BwR 7–10       | hoch   | Zahlen                    | Betrag                           | **C**                                                                                | —                                   | geht                                                                                                                                                                           | –                  |
| **Einkaufs-/Verkaufskalkulation** im Schema (Listenpreis − Rabatt − Skonto + Bezugskosten …)                               | BwR 8–10       | hoch   | Schema                    | ausgefülltes Schema              | **C** — jede Zeile aus der vorigen rechenbar                                         | —                                   | teilweise — Tabelle geht (#230), aber die Schlüsselwerte rechnet heute das Modell, nicht der Code (Regel 0)                                                                    | #230, **V1**       |
| Angebotsvergleich (Bezugspreis mehrerer Lieferer)                                                                          | BwR 8          | mittel | Angebote                  | Bezugspreise, Entscheidung       | **C** (Rechnung) / R (Entscheidung mit qualitativen Gründen)                         | —                                   | teilweise                                                                                                                                                                      | #230, #211, **V1** |
| Abschreibung (linear), Anlagenkartei, Buchwert                                                                             | BwR 9–10       | mittel | Anschaffungsdaten         | Beträge je Jahr                  | **C**                                                                                | —                                   | geht (als Tabelle, #230)                                                                                                                                                       | –                  |
| Eröffnungs-/Schlussbilanz, Inventar; Aktiva/Passiva zuordnen                                                               | BwR 7, W&R     | hoch   | Posten                    | Bilanz                           | **C**                                                                                | Seite antippen                      | geht (Zuordnen #229, Tabelle #230)                                                                                                                                             | –                  |
| Kennzahlen (Eigenkapitalrentabilität, Liquidität, Eigenkapitalquote) berechnen und deuten                                  | BwR 10, W&R 10 | mittel | Bilanz/GuV-Zahlen         | Kennzahl + Deutung               | **C** / R                                                                            | —                                   | teilweise — Zahl geht, Deutung über #211                                                                                                                                       | #211               |
| Lohn- und Gehaltsabrechnung (brutto → netto)                                                                               | BwR 9–10       | mittel | Lohnzettel                | Schema                           | **C**                                                                                | —                                   | geht (Tabelle)                                                                                                                                                                 | –                  |
| Betriebswirtschaftliche Begriffe erklären (Rechtsformen, Marketing-Mix, Absatzwege)                                        | alle           | hoch   | Frage                     | Erklärung                        | **R**                                                                                | Begriff zuordnen                    | geht (#211, #229)                                                                                                                                                              | –                  |
| Angebot/Nachfrage-Diagramm: Gleichgewichtspreis ablesen, Verschiebung                                                      | W&R 10, O      | mittel | Diagramm                  | Wert / Richtung                  | **C**                                                                                | welche Verschiebung passt           | teilweise                                                                                                                                                                      | #245, #249         |
| Wirtschaftskreislauf (Ströme benennen)                                                                                     | W&R, Politik   | mittel | Schema                    | Beschriftung                     | **C**                                                                                | Strom antippen                      | teilweise                                                                                                                                                                      | #247               |
| Rechtsfall: Geschäftsfähigkeit, Kaufvertrag, Mängelrechte                                                                  | W&R 9–10       | hoch   | Fall                      | Rechtsfolge                      | **C** (Alter → Stufe, Mangel → Recht) / R (Begründung)                               | Rechtsfolge aus 4                   | geht                                                                                                                                                                           | –                  |
| **Gutachtenstil** (Obersatz, Definition, Subsumtion, Ergebnis)                                                             | Recht O        | mittel | Fall                      | gegliederte Prüfung              | **R** — das Prüfschema ist die Rubrik (§9.3)                                         | Schritte ordnen                     | teilweise — Rubrik (#211) und Reihenfolge (#228) da; mehrschrittige Aufgabe fehlt                                                                                              | #211, #228         |
| Haushaltsplan / Budget, Kredit und Zinsen                                                                                  | U–M            | mittel | Zahlen                    | Tabelle / Betrag                 | **C**                                                                                | —                                   | geht                                                                                                                                                                           | –                  |
| Wirtschaftspolitische Statistik/Karikatur auswerten                                                                        | M–O            | mittel | Schaubild                 | Auswertung                       | **R**                                                                                | —                                   | teilweise                                                                                                                                                                      | #211, #246         |

**Befund:** BwR ist das **mechanisch dichteste Fach** dieses Nachtrags — fast alles ist C, und
genau das tragende Stück, der Buchungssatz, hat heute keine Form. Ein Buchungssatz ist zwei
Mengen von (Konto, Betrag) mit gleicher Summe; „Reihenfolge innerhalb einer Seite egal" und
„Konto als Nummer oder Kürzel" sind die beiden Gleichwertigkeiten, die ein Stringvergleich nicht
kennt. Und Regel 0 in die andere Richtung: ein vom Modell erzeugter Buchungssatz, dessen Soll- und
Haben-Summe nicht übereinstimmt, ist mechanisch als falsch erkennbar und darf keine Frage werden.

### 16.3 Technik / NwT (14)

**Wo:** BW Gymnasium **NwT** (Naturwissenschaft und Technik, Profilfach ab Kl. 8, seit 2007/08,
Bildungsplan 2016 mit Beispielcurricula 8–10) · Technik an Real-/Oberschulen (u. a.
Niedersachsen, NRW Wahlpflicht) · Bayern Realschule Werken/Technisches Zeichnen.¹ Der Wortlaut der
NwT-Kompetenzen war in dieser Recherche nicht abrufbar (§16.10); die Formen unten sind
Erfahrungswissen¹ und decken sich mit dem, was §4.1 (Physik) und §5 (Informatik) schon belegen.

| Aufgabe                                                               | Stufe | Häuf.  | Zeigen     | Produzieren               | Prüfbar                       | Erkenn-Variante      | heute                                    | fehlt → Issue                         |
| --------------------------------------------------------------------- | ----- | ------ | ---------- | ------------------------- | ----------------------------- | -------------------- | ---------------------------------------- | ------------------------------------- |
| Bauteile, Werkzeuge, Maschinenelemente benennen                       | U–M   | hoch   | Bild       | Name                      | **C**                         | Bild aus 4           | teilweise — Bild nur als Fotoausschnitt  | #231, #252                            |
| Technische Zeichnung lesen (Ansichten, Dreitafelprojektion, Bemaßung) | M     | hoch   | Zeichnung  | Ansicht / Maß             | **C**                         | welche Ansicht passt | teilweise                                | #231, #255                            |
| Technische Zeichnung anfertigen                                       | M     | mittel | —          | Zeichnung                 | **C** auf Raster / H freihand | —                    | fehlt                                    | #249 (Raster); Freihand bewusst nicht |
| Schaltplan lesen und zeichnen, Reihen-/Parallelschaltung              | U–M   | hoch   | Schaltplan | Plan / Größe              | **C**                         | Plan aus 4           | teilweise                                | #261                                  |
| Ohmsches Gesetz, Leistung, Energie, Wirkungsgrad berechnen            | M     | hoch   | Werte      | Zahl mit Einheit          | **C**                         | —                    | geht                                     | –                                     |
| Getriebe, Übersetzung, Hebel, Drehmoment                              | M     | mittel | Skizze     | Zahl                      | **C**                         | —                    | geht                                     | –                                     |
| Werkstoffe und ihre Eigenschaften zuordnen                            | U–M   | mittel | Liste      | Zuordnung                 | **C**                         | —                    | geht (#229)                              | –                                     |
| Fertigungsverfahren (DIN 8580) zuordnen; Arbeitsablaufplan ordnen     | U–M   | mittel | Schritte   | Reihenfolge / Gruppe      | **C**                         | —                    | geht (#228, #229)                        | –                                     |
| Messwerte aufnehmen, Tabelle, Diagramm, auswerten                     | M     | hoch   | Messreihe  | Tabelle + Diagramm        | **C** (Werte) / R (Deutung)   | —                    | teilweise                                | #230, #245                            |
| Energieflussdiagramm (Sankey), Energieumwandlungskette                | M     | mittel | Schema     | Beschriftung / Werte      | **C**                         | —                    | teilweise                                | #247                                  |
| Steuern und Regeln: Regelkreis, EVA-Prinzip                           | M     | mittel | Schema     | Beschriftung              | **C**                         | Glied antippen       | teilweise                                | #247, #248                            |
| Mikrocontroller/Ablaufsteuerung programmieren, Programm lesen         | M     | mittel | Code       | Code / Ausgabe            | **C** (Ausgabe) / R           | Ausgabe vorhersagen  | teilweise                                | #262                                  |
| Logikgatter, Wahrheitstabelle                                         | M     | gering | Gatter     | Tabelle                   | **C**                         | —                    | teilweise (Tabelle ja, Gatter-Bild nein) | #230, #261                            |
| Nutzwertanalyse, Lastenheft, Projektdokumentation                     | M     | mittel | Kriterien  | gewichtete Tabelle / Text | **C** (Rechnung) / R (Text)   | —                    | teilweise                                | #230, #211                            |

**Befund:** NwT braucht **nichts Eigenes** — es ist eine Kreuzung aus Physik, Informatik und
Zeichnen, und alles, was fehlt, hat schon ein Issue (#245, #247, #249, #252, #255, #261, #262).

### 16.4 Sport-Theorie (13)

**Wo:** §10.3 — der schriftliche Teil ist Sporttheorie (NRW nur LK; Niedersachsen eA im
Praxis-Theorie-Verbund; Bayern ersetzt die Schulaufgabe durch Praxis). **Beleg:** KMK-EPA Sport
i. d. F. 28.09.2017, Operatorenlisten NRW/Niedersachsen (§14).

| Aufgabe                                                                         | Stufe | Häuf.  | Zeigen                | Produzieren         | Prüfbar            | Erkenn-Variante  | heute                                            | fehlt → Issue    |
| ------------------------------------------------------------------------------- | ----- | ------ | --------------------- | ------------------- | ------------------ | ---------------- | ------------------------------------------------ | ---------------- |
| Trainingsprinzipien und -methoden benennen, einer Zielsetzung zuordnen          | O     | hoch   | Ziel                  | Methode             | **C**              | —                | geht (#229)                                      | –                |
| Belastungskomponenten (Intensität, Dauer, Umfang, Dichte, Häufigkeit) bestimmen | O     | hoch   | Trainingsbeschreibung | Werte je Komponente | **C**              | —                | geht (#230)                                      | –                |
| Energiebereitstellungswege einer Belastung zuordnen                             | O     | hoch   | Belastung             | Weg                 | **C**              | —                | geht                                             | –                |
| Muskelfasertypen, Agonist/Antagonist, Gelenktypen                               | O     | mittel | Skelett/Muskel        | Beschriftung        | **C**              | im Bild antippen | teilweise                                        | #252, #248       |
| Biomechanische Prinzipien nach Hochmuth zuordnen                                | O     | mittel | Bewegung              | Prinzip             | **C**              | —                | geht                                             | –                |
| Phasenstruktur (Meinel) bestimmen; Funktion je Phase                            | O     | mittel | Bildreihe             | Phasen / Funktion   | **C** (Phasen) / R | Phasen ordnen    | teilweise — Ordnen geht (#228), Bildreihe nicht  | #228, #231, #211 |
| Laktatstufen-/Conconi-Test auswerten                                            | O     | mittel | Diagramm              | Schwelle / Deutung  | **C** / R          | —                | teilweise                                        | #245             |
| Trainingsherzfrequenz berechnen (z. B. Karvonen)                                | O     | mittel | Werte                 | Zahl                | **C**              | —                | geht                                             | –                |
| Modell skizzieren und erklären (Superkompensation, Regelkreis)                  | O     | mittel | —                     | Skizze + Text       | **R**              | Kurve aus 4      | teilweise                                        | #245, #247, #211 |
| Trainingsplan erstellen                                                         | O     | mittel | Ziel, Rahmen          | Plan                | **R**              | —                | teilweise                                        | #230, #211       |
| Bewegungsanalyse → Fehlerbild → Korrektur                                       | O     | mittel | Bild/Beschreibung     | Text                | **R**              | —                | teilweise                                        | #211             |
| Regelwissen Sportspiele                                                         | U–O   | mittel | Situation             | Entscheidung        | **C**              | —                | geht                                             | –                |
| Erörterung (Doping, Sport und Gesellschaft)                                     | O     | hoch   | Material              | Erörterung          | **H**              | —                | teilweise — Rückmeldung je Kernpunkt, keine Note | #258             |

Praxis (absolvieren, demonstrieren, gestalten) ist **nicht app-trainierbar** (§10.3) und zählt
hier nicht mit.

### 16.5 Philosophie / Ethik in der Oberstufe (12)

**Wo:** §10.1 und die Zeilen „Religion/Ethik" in #224; hier nur, was die **Oberstufe**
zusätzlich verlangt (NRW Philosophie Sek II, BW Ethik, Bayern Ethik O).¹ Die GPJE-Grenze aus §0.2
gilt sinngemäß: eine **Position** wird nie „falsch" genannt, nur ihre Begründung an formalen
Kriterien gemessen.

| Aufgabe                                                                        | Stufe | Häuf.  | Zeigen        | Produzieren       | Prüfbar                                        | Erkenn-Variante      | heute                                          | fehlt → Issue    |
| ------------------------------------------------------------------------------ | ----- | ------ | ------------- | ----------------- | ---------------------------------------------- | -------------------- | ---------------------------------------------- | ---------------- |
| Fachbegriffe definieren (Pflicht, Tugend, Glück, Gerechtigkeit)                | O     | hoch   | Begriff       | Definition        | **R**                                          | Definition aus 4     | geht (#211, MC)                                | –                |
| Philosophen und Positionen zuordnen                                            | O     | hoch   | Zitate/Thesen | Zuordnung         | **C**                                          | —                    | geht (#229)                                    | –                |
| **Argument in Standardform rekonstruieren** (Prämissen, Konklusion)            | O     | hoch   | Text          | nummerierte Liste | **R**; C für „welcher Satz ist die Konklusion" | Konklusion markieren | teilweise                                      | #234, #228, #211 |
| Gültigkeit prüfen: Modus ponens/tollens, Fehlschluss benennen                  | O     | mittel | Argument      | Label             | **C**                                          | —                    | geht                                           | –                |
| Wahrheitstafel / Aussagenlogik                                                 | O     | gering | Formel        | Tabelle           | **C**                                          | —                    | geht (#230)                                    | –                |
| Ethische Theorie auf einen Fall anwenden (Kant, Utilitarismus, Tugendethik)    | O     | hoch   | Fall          | Anwendung         | **R**                                          | Theorie aus 4        | teilweise                                      | #211             |
| Philosophischen Text erschließen (These, Begründung, Gedankengang)             | O     | hoch   | Text          | Analyse           | **R**                                          | —                    | teilweise — Text bleibt nicht sichtbar         | #233, #211       |
| Gedankenexperiment deuten (Höhlengleichnis, Trolley, Gedankenexperiment Rawls) | O     | mittel | Text          | Deutung           | **R**                                          | —                    | teilweise                                      | #211             |
| Begriffsanalyse (notwendige/hinreichende Bedingungen, Gegenbeispiel)           | O     | mittel | Begriff       | Bedingungen       | **R**                                          | Gegenbeispiel aus 4  | teilweise                                      | #211             |
| Epochen und Philosophen zeitlich ordnen                                        | O     | gering | Namen         | Reihenfolge       | **C**                                          | —                    | geht (#228)                                    | –                |
| Problemerörterung / Essay mit eigener Stellungnahme                            | O     | hoch   | Problem       | Essay             | **H**                                          | —                    | teilweise — keine Note, keine Positionswertung | #258             |
| Dilemma analysieren und Stellung nehmen                                        | O     | hoch   | Dilemma       | Analyse + Urteil  | **R** / **H**                                  | —                    | teilweise                                      | #211             |

### 16.6 Psychologie / Pädagogik (11)

**Wo:** NRW **Erziehungswissenschaft** und **Psychologie** (O, Zentralabitur; §9.3) ·
Niedersachsen Psychologie nur per EPA · Pädagogik am beruflichen Gymnasium. **Beleg:** NRW-Operator
`analysieren` mit der Slotliste _„Forschungsbereich, Problemfeld, Hypothesen, Variablen,
Operationalisierung, Durchführung, Design, Ergebnisse, Messverfahren, Auswertung"_ (§9.3).

| Aufgabe                                                                           | Stufe | Häuf.  | Zeigen              | Produzieren         | Prüfbar                                                           | Erkenn-Variante | heute       | fehlt → Issue |
| --------------------------------------------------------------------------------- | ----- | ------ | ------------------- | ------------------- | ----------------------------------------------------------------- | --------------- | ----------- | ------------- |
| Theorien und Begriffe zuordnen (Freud-Instanzen, Erikson-Krisen, Erziehungsstile) | O     | hoch   | Begriffe            | Zuordnung           | **C**                                                             | —               | geht (#229) | –             |
| Stufenmodelle ordnen (Piaget, Kohlberg)                                           | O     | hoch   | Stufen              | Reihenfolge         | **C**                                                             | —               | geht (#228) | –             |
| Fallbeispiel einer Theorie/Stufe zuordnen und analysieren                         | O     | hoch   | Fall                | Label + Analyse     | **C** (Label) / R                                                 | Stufe aus 4     | teilweise   | #211          |
| Lernen am Beispiel: US/UR/NS/CS/CR bzw. Verstärkerart bestimmen                   | O     | hoch   | Beispiel            | Begriffe je Rolle   | **C**                                                             | —               | geht (#230) | –             |
| **Studie analysieren** (UV/AV, Hypothese, Design, Ergebnis)                       | O     | hoch   | Studienbeschreibung | Slots               | **C** (UV/AV) / **R** (Rest) — die NRW-Slotliste _ist_ die Rubrik | UV antippen     | teilweise   | #211, #234    |
| Gütekriterien beurteilen (Objektivität, Reliabilität, Validität)                  | O     | mittel | Studie              | Urteil je Kriterium | **R**                                                             | —               | teilweise   | #211          |
| Statistik einer Studie lesen (Diagramm, Mittelwert, Signifikanzangabe)            | O     | mittel | Diagramm            | Wert / Aussage      | **C**                                                             | —               | teilweise   | #245, #246    |
| Fachtext erschließen                                                              | O     | hoch   | Text                | Analyse             | **R**                                                             | —               | teilweise   | #233, #211    |
| Pädagogische Handlungsmöglichkeiten entwickeln                                    | O     | mittel | Fall                | Vorschläge          | **R** / **H**                                                     | —               | teilweise   | #211          |
| Theorien vergleichen                                                              | O     | mittel | zwei Theorien       | Vergleich           | **R**                                                             | —               | teilweise   | #211          |
| Erörterung                                                                        | O     | mittel | Material            | Text                | **H**                                                             | —               | teilweise   | #258          |

### 16.7 Griechisch (11)

**Wo:** §8 — Altgriechisch wie Latein unter den KMK-EPA (65 Wörter je Zeitstunde, Übersetzung +
Interpretation). Neugriechisch steht in NRW unter den modernen Fremdsprachen (§7) und folgt deren
Klausuranatomie; es ist hier nicht gesondert aufgeführt.

| Aufgabe                                                                          | Stufe      | Häuf.  | Zeigen    | Produzieren                 | Prüfbar                                                                | Erkenn-Variante              | heute                                                                   | fehlt → Issue                          |
| -------------------------------------------------------------------------------- | ---------- | ------ | --------- | --------------------------- | ---------------------------------------------------------------------- | ---------------------------- | ----------------------------------------------------------------------- | -------------------------------------- |
| **Alphabet** lesen und schreiben; Umschrift in lateinische Buchstaben und zurück | U (Anfang) | hoch   | Wort      | Wort in der anderen Schrift | **C**                                                                  | Buchstaben zuordnen          | teilweise — Zuordnen geht (#229), Schreiben braucht die Schrift-Eingabe | **neu: V2**                            |
| Vokabeln griechisch → deutsch                                                    | U–O        | hoch   | Wort      | deutsches Wort              | **C**                                                                  | Bedeutung aus 4              | geht                                                                    | –                                      |
| Vokabeln deutsch → griechisch (mit Akzent und Spiritus)                          | U–M        | hoch   | Wort      | griechisches Wort           | **C**                                                                  | Form aus 4                   | teilweise — Eingabe, Akzentvergleich, Schluss-Sigma (§16.1)             | **V2**                                 |
| **Formen bestimmen** (Kasus, Numerus, Genus; Person, Tempus, Modus, Diathese)    | U–O        | hoch   | Form      | Bestimmung                  | **C**                                                                  | Bestimmung aus 4             | geht (Tabelle #230, MC)                                                 | –                                      |
| **Formen bilden**, Paradigma ausfüllen                                           | U–M        | hoch   | Stammform | Formen                      | **C**                                                                  | —                            | teilweise — Tabelle da, Eingabe nicht                                   | #230, **V2**                           |
| Akzentregeln anwenden, Akzent/Spiritus setzen                                    | U–M        | mittel | Wort      | Wort mit Zeichen            | **C**                                                                  | richtige Akzentuierung aus 4 | teilweise — fehlende Zeichen sind heute nur `close`                     | **V2**                                 |
| Satzanalyse: AcI, Genitivus absolutus, Partizipialkonstruktionen erkennen        | M–O        | hoch   | Satz      | Markierung + Label          | **C**                                                                  | Konstruktion aus 4           | teilweise                                                               | #234, #229                             |
| **Übersetzung**                                                                  | M–O        | hoch   | Text      | Übersetzung                 | **H** (§8.2)                                                           | —                            | teilweise — Rückmeldung je Kernpunkt                                    | #211, #258                             |
| Interpretation, Rezeption (Mythos, Philosophie, Drama)                           | O          | mittel | Text      | Analyse                     | **R** / **H**                                                          | —                            | teilweise                                                               | #233, #211                             |
| **Metrik**: Hexameter/Trimeter skandieren (Längen, Zäsur)                        | O          | mittel | Vers      | Längen/Kürzen je Silbe      | **C** (bis auf Mehrdeutigkeiten, die ein Land unterschiedlich zulässt) | Schema aus 4                 | fehlt — keine Silbenform                                                | **neu: V3**                            |
| Lautes Lesen / Aussprache (erasmisch oder rekonstruiert)                         | U          | mittel | Text      | gesprochen                  | **H**                                                                  | —                            | fehlt — keine griechische Stimme (§16.1)                                | bewusst nicht (keine Stimme verfügbar) |

### 16.8 Russisch (13)

**Wo:** §7 — moderne Fremdsprache mit eigener Klausuranatomie (Wortzahlen abweichend: 450 / 700 /
900). **Beleg Anfangsunterricht:** BW-Beispielcurricula Russisch als 2. und 3. Fremdsprache
(Kl. 6 bzw. 8) mit einem **Vorkurs, der vor allem der kyrillischen Schrift in Druck- und
Schreibschrift gilt** (Suchauszug, §16.10).

| Aufgabe                                            | Stufe       | Häuf.  | Zeigen         | Produzieren                 | Prüfbar       | Erkenn-Variante | heute                                                                         | fehlt → Issue |
| -------------------------------------------------- | ----------- | ------ | -------------- | --------------------------- | ------------- | --------------- | ----------------------------------------------------------------------------- | ------------- |
| Kyrillisch lesen; Druck- ↔ Schreibschrift zuordnen | U (Vorkurs) | hoch   | Buchstabe/Wort | Zuordnung                   | **C**         | —               | teilweise — Zuordnen geht (#229); Schreibschrift als Bild nicht               | #229, #231    |
| Kyrillisch schreiben, Transliteration              | U (Vorkurs) | hoch   | Wort           | Wort in der anderen Schrift | **C**         | —               | teilweise — Eingabe                                                           | **V2**        |
| Vokabeln russisch → deutsch                        | alle        | hoch   | Wort           | Wort                        | **C**         | Bedeutung aus 4 | geht                                                                          | –             |
| Vokabeln deutsch → russisch                        | alle        | hoch   | Wort           | Wort                        | **C**         | Wort aus 4      | teilweise — Eingabe; `ё`/`е` wird heute als Beinahe-Treffer behandelt (§16.1) | **V2**        |
| **Betonung** markieren                             | U–M         | mittel | Wort           | Silbe                       | **C**         | Silbe antippen  | fehlt — Betonungszeichen werden im Vergleich entfernt                         | **V2**, #234  |
| Kasus bilden (sechs Fälle), Deklinationstabelle    | U–M         | hoch   | Grundform      | Formen                      | **C**         | —               | teilweise — Tabelle da (#230), Eingabe nicht                                  | #230, **V2**  |
| Verbalaspekt wählen (vollendet/unvollendet)        | M           | hoch   | Satz           | Form                        | **C**         | Form aus 2      | geht                                                                          | –             |
| Verben der Bewegung, Präpositionen mit Kasus       | M           | hoch   | Lückensatz     | Form                        | **C**         | —               | teilweise                                                                     | #232          |
| Leseverstehen                                      | M–O         | hoch   | Text           | Antworten                   | **C** / R     | —               | teilweise                                                                     | #233          |
| Hörverstehen                                       | M–O         | hoch   | Audio          | Antworten                   | **C**         | —               | geht, wenn `SPEECH_BACKEND` an ist (`ru-RU` vorhanden)                        | –             |
| Aussprache                                         | alle        | mittel | Wort/Satz      | gesprochen                  | **R**         | —               | geht (Aussprache-Pfad, Modell hört)                                           | –             |
| Schreiben (E-Mail, Text)                           | M–O         | hoch   | Aufgabe        | Text                        | **R** / **H** | —               | teilweise                                                                     | #211, #258    |
| Sprachmittlung                                     | M–O         | mittel | Text           | Text                        | **R** (§7.4)  | —               | teilweise                                                                     | #211          |

### 16.9 Darstellendes Spiel (9)

**Wo:** Berlin/Brandenburg und Hamburg **Darstellendes Spiel / Theater** (Hamburg mit
Abiturrichtlinien), BW **Literatur und Theater**, NRW **Literatur** (Q-Phase, Projektkurs).
**Beleg:** die mündliche Prüfung im Berliner Grundkurs besteht aus einem **praktischen Teil mit
Gestaltungsaufgabe und Gespräch** und einer **Reflexionsaufgabe** (Suchauszug Fachbrief Berlin,
§16.10). Eine **schriftliche** Aufgabenart konnte ich für keines der Länder am Primärtext belegen.

| Aufgabe                                                                  | Stufe | Häuf.  | Zeigen           | Produzieren                      | Prüfbar                      | Erkenn-Variante | heute                                                                                           | fehlt → Issue                         |
| ------------------------------------------------------------------------ | ----- | ------ | ---------------- | -------------------------------- | ---------------------------- | --------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------- |
| Theaterbegriffe (Bühnenformen, Figur/Rolle, Verfremdung, Theaterzeichen) | M–O   | hoch   | Begriff          | Erklärung                        | **R**; C als Zuordnung       | Begriff aus 4   | geht (#211, #229)                                                                               | –                                     |
| Theatergeschichte, Epochen und Formen ordnen                             | O     | mittel | Namen/Epochen    | Reihenfolge                      | **C**                        | —               | geht (#228)                                                                                     | –                                     |
| **Rollentext lernen**: Stichwort → nächster Satz                         | alle  | hoch   | Stichwort        | Replik (getippt oder gesprochen) | **C** (Wortlaut)             | —               | teilweise — getippt geht (Kurzantwort, mehrzeilig #221), gesprochen über „Erklär mal"/Lautlesen | #236, #264                            |
| Szenischen Text analysieren (Figurenkonstellation, Konflikt)             | O     | mittel | Text             | Analyse                          | **R**                        | —               | teilweise                                                                                       | #233, #211                            |
| Inszenierungskonzept / Regiekonzept entwickeln                           | O     | mittel | Text             | Konzept                          | **H**                        | —               | teilweise — Rückmeldung je Kernpunkt                                                            | #211                                  |
| Inszenierungsanalyse einer Aufführung                                    | O     | mittel | Aufführung/Video | Analyse                          | **R**                        | —               | fehlt — Video                                                                                   | bewusst nicht (Video)                 |
| Rollenbiografie schreiben                                                | M–O   | gering | Figur            | Text                             | **H**                        | —               | teilweise                                                                                       | #258                                  |
| Probe reflektieren (Probentagebuch)                                      | alle  | mittel | —                | Text                             | **H**                        | —               | teilweise                                                                                       | #211                                  |
| Spielen, Präsentation, Bühnenbild                                        | alle  | hoch   | —                | Praxis                           | **H**, nicht app-trainierbar | —               | —                                                                                               | bewusst nicht (praktisches Gestalten) |

**Befund:** In Darstellendem Spiel ist fast alles Praxis oder **H**. Das eine Stück mit echtem
Übungsbedarf und einer exakten Antwort ist das **Rollentext-Lernen** — und das geht heute schon
getippt, gesprochen mit den Bausteinen aus Welle 2/„Später" (#236, #264). Es bekommt **kein**
eigenes Issue.

### 16.10 Zählung und Quellen dieses Nachtrags

**Gezählt** per Skript über die Tabellen oben, nicht geschätzt: die Spalte „heute" beginnt mit
_geht_, _teilweise_ oder _fehlt_; eine Zeile ohne diesen Status (die Praxis in 16.9) zählt als
„nicht übbar". Neben den drei vorgeschlagenen Bausteinen (§16.11) zeigt jede „teilweise"- und
„fehlt"-Zeile auf ein **bestehendes** Issue oder auf eine Entscheidung „bewusst nicht" aus #224.

<!-- zaehlung:start -->

| Fach                                      | Typen   | geht   | teilweise | fehlt | nicht übbar | „geht“ gewichtet² |
| ----------------------------------------- | ------- | ------ | --------- | ----- | ----------- | ----------------- |
| Wirtschaft/Recht und BwR (17)             | 17      | 7      | 9         | 1     | 0           | 43 %              |
| Technik / NwT (14)                        | 14      | 4      | 9         | 1     | 0           | 28 %              |
| Sport-Theorie (13)                        | 13      | 6      | 7         | 0     | 0           | 50 %              |
| Philosophie / Ethik in der Oberstufe (12) | 12      | 5      | 7         | 0     | 0           | 34 %              |
| Psychologie / Pädagogik (11)              | 11      | 3      | 8         | 0     | 0           | 32 %              |
| Griechisch (11)                           | 11      | 2      | 7         | 2     | 0           | 21 %              |
| Russisch (13)                             | 13      | 4      | 8         | 1     | 0           | 31 %              |
| Darstellendes Spiel (9)                   | 9       | 2      | 5         | 1     | 1           | 29 %              |
| **Summe**                                 | **100** | **33** | **60**    | **6** | **1**       | —                 |

² Gewichte hoch = 3, mittel = 2, gering = 1, ohne die nicht übbaren Zeilen — dieselbe Idee wie #224, aber **nicht** dessen Skript; die Zahl ist nur innerhalb dieses Nachtrags vergleichbar.

<!-- zaehlung:end -->

**Nicht gerechnet:** die **Prozentzahlen in #224** (gewichtet nach Häufigkeit, 26 % / 71 % / 4 %
und die Tabelle je Fach und Welle) stammen aus `analyse.json`, die nur dem Owner vorliegt (#224:
„Die vollständige Tabelle pro Fach … liegt dem Owner als Datei vor"). Diese Zeilen hier müssen dort
**angefügt und das Skript neu laufen** — eine geschätzte Prozentzahl wäre genau die Sorte
Behauptung, die die Analyse vermeiden wollte (#224, Kommentar vom 02.10., 12:00).

**Quellen (abgerufen 02.10.2026; „Suchauszug" = nur der Ausschnitt der Suchmaschine, der
Primärtext war aus dieser Umgebung nicht abrufbar):**

- ISB Bayern, _Infobrief BwR — Abschlussprüfung 2023_
  (`isb.bayern.de/fileadmin/user_upload/Realschule/Infobriefe/BWL/2021b_isb_infobrief_bwr_abschlusspruefung_2023.pdf`)
  — **Suchauszug**; Abruf vom Netz-Proxy blockiert (`CONNECT tunnel failed, response 403`).
- LehrplanPLUS Bayern, Realschule, _Betriebswirtschaftslehre/Rechnungswesen_, Jg. 7, WPFG II
  (`lehrplanplus.bayern.de/fachlehrplan/realschule/7/bwl-rechnungswesen/wpfg2`) — Suchauszug.
- Landesbildungsserver BW, _Bildungsplan 2016, Beispielcurriculum NwT Kl. 8–10_ und
  _Beispielcurricula Russisch als 2./3. Fremdsprache_ (`schule-bw.de`) — Suchauszüge.
- Senatsverwaltung Berlin, _Fachbrief Darstellendes Spiel Nr. 4_ (`schulportal.berlin.de`) —
  Suchauszug.
- Für Sport, Philosophie, Psychologie/Pädagogik, Recht, Latein/Griechisch und die modernen
  Fremdsprachen: die Primärquellen aus §14.

### 16.11 Vorschläge für neue Issues

Neu nur, wo **kein vorhandener Baustein passt** (Plan in #265, Schritt 3). Alles andere in den
Tabellen oben zeigt auf ein bestehendes Issue. Format wie die Wellen-Issues: Regel 0, Kosten,
Abnahme. Angelegt werden sie von der orchestrierenden Sitzung.

#### V1 — Buchungssatz, T-Konto und Kalkulationsschema (BwR), exakt im Code

**Quelle:** Issue #265 (Owner, 02.10.2026), §16.2 dieses Dokuments. _„Kandidaten sind
Buchungssatz/T-Konto (BwR, exakt prüfbar)"_.

**Ursache, geprüft:** BwR ist fast vollständig **C**, aber der Buchungssatz — das tragende Stück
jeder BwR-Arbeit — hat keine Form. Als Kurzantwort wird er per String verglichen
(`apps/api/src/modules/practice/evaluate.ts`); ein richtiger Satz mit anderer Reihenfolge der
Soll-Konten oder mit Kürzel statt Kontonummer gilt dann als falsch. T-Konten gibt es nicht; das
Kalkulationsschema geht als Tabelle (#230), aber die Werte darin rechnet das Modell, nicht der
Code.

**Plan (minimal, in der vorhandenen Fragekarte, Regel 16):**

1. Vertrag `BookingTask` in `packages/shared-types/src/contracts/` — Geschäftsfall-Text, ein
   **Kontenplan-Ausschnitt** (Nummer, Kürzel, Name; aus einer festen Liste des
   Industriekontenrahmens im Code, das Modell schreibt **keine** Kontonummer frei — es wählt per
   Alias wie überall, Regel 2) und die Lösung als zwei Mengen `(konto, betrag_cent)`.
2. Antwortform: je Zeile ein Konto **antippen** (aus dem Ausschnitt) und einen Betrag tippen, links
   Soll, rechts Haben — die vorhandene `AnswerPart`-Maschinerie (Migration 0072) mit Slots
   `soll.n` / `haben.n`.
3. Prüfer im Code: Mengengleichheit je Seite (Reihenfolge egal), Beträge in Cent exakt, Nummer und
   Kürzel desselben Kontos gleich. `parts_left`, wenn einzelne Zeilen stimmen.
4. T-Konto als Darstellung desselben Vertrags (Einträge links/rechts, Saldo) — Prüfer: Summen
   gleich, Saldo auf der kleineren Seite.
5. Kalkulationsschema: Zeilenfolge fest im Code (Listenpreis → Zieleinkaufspreis → Bareinkaufspreis
   → Bezugspreis …), jede Zeile **aus der vorigen gerechnet**; das Modell liefert nur die
   Eingangswerte und Sätze.

**Regel 0, beide Richtungen:** (a) ihre Antwort: Mengengleichheit und Beträge entscheidet Code,
ohne Modellaufruf; (b) was das Modell erzeugt: ein Buchungssatz, dessen Soll- und Haben-Summe
nicht gleich ist, ein Konto außerhalb des Ausschnitts oder ein Schema, dessen gerechnete Werte
nicht zu den gelieferten passen, wird **verworfen, nicht repariert** — es entsteht keine Frage.

**Kosten:** M. 0 Modellaufrufe pro Antwort. Keine Migration außer ggf. einer Spalte `booking_task`
wie `bar_task` (0064) und `staff_task` (0078). Kein neues Datenschutzrisiko.

**Abnahme:** Integrationstests: ein vertauschter, aber richtiger Buchungssatz zählt richtig; Kürzel
= Nummer; ein falscher Betrag gibt `parts_left`; ein erzeugter Satz mit ungleicher Summe wird
verworfen; ein Kontoalias einer anderen Frage wird abgewiesen. Walkthrough-Screenshot der Karte bei
360×740 und 390×844, ohne Scrollen (`tests/web/fit.ts`).

#### V2 — Griechische und kyrillische Schrift: Eingabe und schriftbewusster Vergleich

**Quelle:** Issue #265 (Owner, 02.10.2026): _„Griechisch, Russisch (eigene Schrift → Eingabe!)"_
und _„eine Tastatur für das griechische/kyrillische Alphabet"_; §16.1, §16.7, §16.8.

**Ursache, geprüft:** (1) Die App hat eigene Tasten nur für Mathe (`MathKeys.tsx`); eine Antwort in
griechischer oder kyrillischer Schrift setzt eine eingerichtete Systemtastatur voraus — und
Altgriechisch mit Akzenten und Spiritus hat auf dem Handy keine bequeme Belegung. (2)
`withoutAccents` (`evaluate.ts`) behandelt `ё`/`е` als Beinahe-Treffer, obwohl `е` für `ё` im
Russischen üblich ist; das Schluss-Sigma `ς`/`σ` ist für den Vergleich ein anderer Buchstabe;
Betonungszeichen und Spiritus fallen pauschal in `close`, auch dort, wo sie die gefragte Sache sind.

**Plan:**

1. Eine **Buchstabenleiste** über dem Antwortfeld, nur wenn die Frage eine Antwort in dieser Schrift
   erwartet (`lang` = `ru`, `el`, `grc`) — dieselbe Bauart wie `MathKeys` (`insertAtCursor`), die
   Buchstaben des Alphabets, für Altgriechisch dazu die Zeichen für Akzent, Spiritus und Iota
   subscriptum als Kombinationszeichen. Keine Einstellung, kein Modus (Minimalismus-Leitlinie
   #224).
2. Vergleich je Schrift im Code: `ё` ≡ `е` (`correct`, außer die Frage fragt nach `ё`); `σ` am
   Wortende ≡ `ς`; Akzent/Spiritus/Betonung als eigener Befund statt pauschal `close`, wenn die
   Frage sie verlangt (Feld im Vertrag, vom Modell gesetzt, vom Code geprüft).
3. Transliteration (Kyrillisch ↔ Latein nach einer festen Norm, z. B. der wissenschaftlichen
   Transliteration) als **Code**, damit eine Umschrift-Aufgabe exakt prüfbar ist.

**Regel 0:** (a) ihre Antwort: Schriftvergleich und Transliteration sind Code; (b) was das Modell
erzeugt: ein Schlüssel, der Zeichen außerhalb der erwarteten Schrift enthält, oder eine
Transliterations-Aufgabe, deren Schlüssel nicht der Code-Transliteration entspricht, wird
verworfen.

**Kosten:** M. 0 Modellaufrufe pro Antwort. Keine Migration. Alle fünf Oberflächensprachen
bekommen die (wenigen) neuen Beschriftungen (`parity.test.ts`). Kein Datenschutzrisiko.

**Abnahme:** Unit-Tests für `ё`/`е`, Schluss-Sigma, Betonung, Spiritus, Transliteration; ein
Integrationstest, der einen Schlüssel in falscher Schrift verwirft; Walkthrough mit der Leiste bei
360×740 (Leiste und Antwortfeld zusammen ohne Scrollen, Tasten ≥ 44 pt). **Offen und im Issue zu
entscheiden:** ob `el`/`grc` als Fachsprache ohne Stimme zulässig ist (es gibt keine griechische
Stimme, §16.1).

#### V3 — Metrik: Verse skandieren (Latein und Griechisch)

**Quelle:** §16.7 (Griechisch) und §8 (Latein: Metrum ist dort landesabhängig, §15 Punkt 9).

**Ursache, geprüft:** Skandieren ist eine Folge von Längen und Kürzen je Silbe — exakt
entscheidbar bis auf die Stellen, an denen Länder Mehrdeutigkeiten unterschiedlich zulassen. Es
gibt dafür keine Form: weder eine Silbenzerlegung noch eine Lang/Kurz-Eingabe. Markieren (#234)
markiert Wörter, keine Silben; Reihenfolge (#228) ordnet, belegt aber keine Positionen.

**Plan:** eine Antwortform „je Silbe antippen: lang / kurz", die Silben aus dem Vers **vom Code**
zerlegt (nicht vom Modell); Prüfer im Code gegen das Versmaß (Hexameter, Pentameter, jambischer
Trimeter), mit einer Liste der zulässigen Varianten je Position. Das Modell liefert nur den Vers
und das Versmaß.

**Regel 0:** (a) ihre Antwort: Code vergleicht das Schema; (b) was das Modell erzeugt: ein Vers,
der sich unter dem genannten Versmaß **nicht** skandieren lässt, wird verworfen.

**Kosten:** M bis L (die Silbentrennung für Latein ist regelhaft; für Griechisch mit Diphthongen
und Positionslänge ein eigenes Stück Code). 0 Modellaufrufe pro Antwort. Kein Datenschutzrisiko.
**Nach der Kostenregel aus #224 (Regel 1: höchstens M) hinter V1 und V2.**

**Abnahme:** Unit-Tests an je zehn Versen pro Versmaß mit Quellenangabe; ein erzeugter Vers, der
nicht passt, wird verworfen; Walkthrough bei 360×740 mit einem Hexameter in einer Zeile ohne
Scrollen.
