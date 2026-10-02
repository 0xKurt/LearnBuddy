// Grade-10 material for the "Vermitteln" eval (issue #298, docs/evals/klasse10.md).
//
// Real Klasse-10 topics, each with what a 15/16-year-old actually types, the curriculum place it
// sits at, the facts a correct explanation must not get wrong, the classic mistakes it must not
// make, and a short reference explanation a teacher could have written (the pairwise judge
// compares Buddy's answer with it, in both orders).
//
// Calculation cases also carry a TASK with its key and a reference path: the eval asks the real
// model for a guided-example plan (`modules/practice/guide.ts`) and counts how often the plan
// survives code's check. The reference path proves offline that the task is one code can follow
// at all (`__tests__/grade10.test.ts`) — a task the checker cannot read would measure nothing.
//
// The facts and pitfalls are written for the JUDGE, never shown to Buddy: Buddy gets only what
// she types.
//
// What the tasks leave out, on purpose: steps that take a root, a logarithm or a reciprocal
// (x² = 4 → x = 2, 2^x = 16 → x = 4, 1/R = 1/2 → R = 2). `steps.ts` compares one-variable
// equations by proportional differences and reads those as "does not follow" — a limit of the
// shared checker this eval names as a finding (docs/evals/klasse10.md), not one it hides by
// picking only what works: the explanation cases ask about exactly these topics.
//
// requires live verification in Claude Code session (eval data; the live run needs the real model)

export type Subject = 'mathe' | 'physik' | 'chemie' | 'deutsch' | 'englisch' | 'geschichte';

export type GuideTask = {
  kind: 'numeric' | 'formula' | 'long';
  prompt: string;
  answer: string;
  unit: string | null;
  /** Lines a teacher would write; must pass the plan check (calculations only). */
  referencePath: string[];
};

export type Grade10Case = {
  id: string;
  subject: Subject;
  topic: string;
  /** Where it sits: the KMK standard for the Mittlerer Schulabschluss and the usual unit. */
  curriculum: string;
  /** What she types, as a 15/16-year-old would. */
  ask: string;
  /** What a correct explanation must not get wrong (for the judge). */
  facts: string[];
  /** Classic mistakes that must not appear (for the judge). */
  pitfalls: string[];
  /** A short explanation a teacher could have written, for the pairwise comparison. */
  reference: string;
  task: GuideTask | null;
};

export const CASES: Grade10Case[] = [
  {
    id: 'm-quadratisch',
    subject: 'mathe',
    topic: 'Quadratische Funktionen: Scheitelpunktform und Parameter a',
    curriculum:
      'KMK Bildungsstandards Mathematik MSA, Leitidee Funktionaler Zusammenhang; Klasse 9/10: quadratische Funktionen',
    ask: 'was macht das a bei f(x)=a(x-d)^2+e? ich check das mit dem scheitelpunkt nicht',
    facts: [
      'Der Scheitelpunkt ist S(d|e) — mit +d, obwohl in der Klammer x − d steht.',
      'a > 0: nach oben geöffnet, a < 0: nach unten geöffnet.',
      '|a| > 1: gestreckt (schmaler), 0 < |a| < 1: gestaucht (breiter).',
      'a = 0 ergibt keine Parabel.',
    ],
    pitfalls: [
      'Scheitelpunkt als S(−d|e) angeben.',
      '"gestreckt" mit "breiter" gleichsetzen.',
      'Behaupten, a verschiebe die Parabel.',
    ],
    reference:
      'In f(x) = a(x − d)² + e liest du den Scheitel direkt ab: S(d|e). Achtung, das Vorzeichen dreht sich: bei (x − 3)² liegt der Scheitel bei x = 3. Das a verschiebt nichts, es formt: Ist a positiv, ist die Parabel nach oben offen wie ein Lächeln, ist a negativ, nach unten. Ist a größer als 1 (oder kleiner als −1), wird sie schmaler – gestreckt; liegt a zwischen −1 und 1, wird sie breiter – gestaucht. Probier: Wie sieht f(x) = −2(x − 1)² + 3 aus?',
    task: {
      kind: 'formula',
      prompt: 'Bringe $f(x) = x^2 - 6x + 5$ mit quadratischer Ergänzung in die Scheitelpunktform.',
      answer: '(x - 3)^2 - 4',
      unit: null,
      referencePath: ['x^2 - 6x + 5', 'x^2 - 6x + 9 - 9 + 5', '(x - 3)^2 - 9 + 5', '(x - 3)^2 - 4'],
    },
  },
  {
    id: 'm-trigonometrie',
    subject: 'mathe',
    topic: 'Trigonometrie im rechtwinkligen Dreieck: Sinus, Kosinus, Tangens',
    curriculum:
      'KMK Bildungsstandards Mathematik MSA, Leitidee Messen; Klasse 9/10: Sinus, Kosinus und Tangens am rechtwinkligen Dreieck',
    ask: 'wann nehm ich sin cos oder tan? ich weiß nie welche seite was ist',
    facts: [
      'Sinus = Gegenkathete / Hypotenuse, Kosinus = Ankathete / Hypotenuse, Tangens = Gegenkathete / Ankathete.',
      'Gegen- und Ankathete hängen vom gewählten Winkel ab; die Hypotenuse liegt dem rechten Winkel gegenüber.',
      'Gilt nur im rechtwinkligen Dreieck.',
      'Man wählt die Funktion, die die zwei bekannten bzw. gesuchten Größen verbindet.',
    ],
    pitfalls: [
      'Ankathete und Gegenkathete fest an eine Seite binden, unabhängig vom Winkel.',
      'Die Hypotenuse als längste Kathete bezeichnen.',
      'Die Formeln für beliebige Dreiecke anwenden.',
    ],
    reference:
      'Zuerst schaust du vom Winkel aus, um den es geht: Die Seite gegenüber dem rechten Winkel ist immer die Hypotenuse (die längste). Die Kathete, die den Winkel berührt, ist die Ankathete, die gegenüberliegende die Gegenkathete. Dann fragst du: Welche zwei Seiten kenne ich bzw. suche ich? Gegen- und Hypotenuse → Sinus, An- und Hypotenuse → Kosinus, Gegen- und Ankathete → Tangens. Merkhilfe: „GAGA-HühnerHof-AG“ (sin = G/H, cos = A/H, tan = G/A). Welche nimmst du, wenn du den Winkel und die Hypotenuse kennst und die Ankathete suchst?',
    task: {
      kind: 'numeric',
      prompt:
        'In einem rechtwinkligen Dreieck ist die Hypotenuse 10 cm lang, der Winkel $\\alpha$ beträgt 30°. Berechne die Gegenkathete $a$ von $\\alpha$ ($\\sin 30° = 0{,}5$).',
      answer: '5',
      unit: 'cm',
      referencePath: ['a / 10 = 0.5', 'a = 0.5 * 10', 'a = 5'],
    },
  },
  {
    id: 'm-exponentiell',
    subject: 'mathe',
    topic: 'Exponentielles Wachstum',
    curriculum:
      'KMK Bildungsstandards Mathematik MSA, Leitidee Funktionaler Zusammenhang; Klasse 10: Exponentialfunktionen, Wachstumsprozesse',
    ask: 'was ist der unterschied zwischen linearem und exponentiellem wachstum? kommt morgen in der arbeit',
    facts: [
      'Linear: in gleichen Zeitschritten kommt immer derselbe Betrag dazu (f(x) = m·x + b).',
      'Exponentiell: in gleichen Zeitschritten wird mit demselben Faktor multipliziert (f(x) = a·b^x).',
      'Wachstumsfaktor b = 1 + p/100 bei p % Zunahme; 0 < b < 1 ist Abnahme.',
      'Exponentielles Wachstum überholt lineares auf lange Sicht immer.',
    ],
    pitfalls: [
      'p % Zunahme mit Faktor p statt 1 + p/100 rechnen.',
      'Exponentiell mit "sehr schnell" gleichsetzen, ohne das konstante Verhältnis zu nennen.',
      'Behaupten, b dürfe negativ sein.',
    ],
    reference:
      'Linear heißt: pro Schritt kommt immer gleich viel dazu – wie Taschengeld, jede Woche 10 €. Exponentiell heißt: pro Schritt wird mit demselben Faktor multipliziert – wie ein Sparbuch mit 5 % Zinsen, da ist der Faktor 1,05. Darum sieht exponentielles Wachstum am Anfang harmlos aus und überholt das lineare später immer. Erkennen kannst du es in einer Tabelle: Sind die Differenzen gleich, ist es linear; sind die Quotienten gleich, ist es exponentiell. Ein Bestand von 200 nimmt jährlich um 10 % zu – wie lautet die Funktion?',
    task: {
      kind: 'numeric',
      prompt:
        'Ein Bestand von 200 Tieren wächst jedes Jahr um 10 %. Wie groß ist er nach 2 Jahren?',
      answer: '242',
      unit: null,
      referencePath: ['B = 200 * 1.1^2', 'B = 200 * 1.21', 'B = 242'],
    },
  },
  {
    id: 'p-energie',
    subject: 'physik',
    topic: 'Energieerhaltung: Lage- und Bewegungsenergie',
    curriculum:
      'KMK Bildungsstandards Physik MSA, Basiskonzept Energie; Klasse 9/10: mechanische Energieformen und Energieerhaltung',
    ask: 'warum ist ein ball der runterfällt unten am schnellsten? hat das was mit energie zu tun',
    facts: [
      'Lageenergie E_pot = m·g·h wird beim Fallen in Bewegungsenergie E_kin = ½·m·v² umgewandelt.',
      'Ohne Reibung bleibt die Summe gleich (Energieerhaltung).',
      'Unten ist h am kleinsten, also E_kin und damit v am größten.',
      'Mit Luftreibung wird ein Teil in thermische Energie umgewandelt — sie geht nicht verloren.',
    ],
    pitfalls: [
      'Sagen, Energie gehe durch Reibung "verloren" im Sinne von vernichtet.',
      'Schwere Körper fallen im Vakuum schneller.',
      'E_kin = m·v² ohne ½.',
    ],
    reference:
      'Oben hat der Ball Lageenergie, weil er hoch liegt: E = m·g·h. Beim Fallen wird diese Energie Stück für Stück in Bewegungsenergie umgewandelt, E = ½·m·v². Die Summe bleibt gleich – Energie entsteht nicht und verschwindet nicht. Unten ist die Höhe weg, also steckt fast alles in Bewegung: Der Ball ist am schnellsten. Ein kleiner Teil wird durch die Luftreibung zu Wärme. Mit welcher Geschwindigkeit kommt ein Ball aus 5 m Höhe ohne Reibung unten an (g ≈ 10 m/s²)?',
    task: {
      kind: 'numeric',
      prompt:
        'Ein Körper (2 kg) hat 300 J Lageenergie ($g = 10\\,\\frac{N}{kg}$). In welcher Höhe in m befindet er sich?',
      answer: '15',
      unit: 'm',
      referencePath: ['2 * 10 * h = 300', '20h = 300', 'h = 15'],
    },
  },
  {
    id: 'p-elektrik',
    subject: 'physik',
    topic: 'Elektrischer Widerstand und Ohmsches Gesetz, Reihen- und Parallelschaltung',
    curriculum:
      'KMK Bildungsstandards Physik MSA, Basiskonzept Wechselwirkung/System; Klasse 9/10: Stromkreise, Ohmsches Gesetz',
    ask: 'wieso wird der gesamtwiderstand bei parallelschaltung kleiner? das ergibt für mich keinen sinn',
    facts: [
      'R = U / I (Ohmsches Gesetz für ohmsche Widerstände).',
      'Reihe: R_ges = R1 + R2; Parallel: 1/R_ges = 1/R1 + 1/R2.',
      'Parallel bekommt der Strom zusätzliche Wege, der Gesamtstrom steigt bei gleicher Spannung — also sinkt R_ges.',
      'R_ges parallel ist kleiner als der kleinste Einzelwiderstand.',
    ],
    pitfalls: [
      'Parallel: R_ges = R1 + R2.',
      'Strom "verbraucht" sich im Widerstand.',
      'Spannung teilt sich in der Parallelschaltung auf.',
    ],
    reference:
      'Stell dir eine Kasse im Supermarkt vor: Macht eine zweite Kasse auf, kommen in derselben Zeit mehr Leute durch – der „Widerstand“ für die Schlange sinkt. Genauso bei der Parallelschaltung: Jeder Widerstand ist ein zusätzlicher Weg, beide liegen an derselben Spannung, also fließt insgesamt mehr Strom. Nach R = U / I heißt mehr Strom bei gleicher Spannung: kleinerer Gesamtwiderstand. Rechnerisch: 1/R_ges = 1/R1 + 1/R2. Was kommt für zwei 10-Ω-Widerstände parallel heraus?',
    task: {
      kind: 'numeric',
      prompt: 'An einem Widerstand liegen 12 V, es fließen 0,5 A. Berechne den Widerstand in Ω.',
      answer: '24',
      unit: 'Ω',
      referencePath: ['12 = R * 0.5', 'R = 12 / 0.5', 'R = 24'],
    },
  },
  {
    id: 'c-redox',
    subject: 'chemie',
    topic: 'Redoxreaktionen: Oxidation und Reduktion als Elektronenübergang',
    curriculum:
      'KMK Bildungsstandards Chemie MSA, Basiskonzept Chemische Reaktion (Donator-Akzeptor); Klasse 9/10: Redoxreaktionen',
    ask: 'oxidation ist doch wenn was mit sauerstoff reagiert oder? unser lehrer sagt jetzt was mit elektronen',
    facts: [
      'Oxidation = Elektronenabgabe, Reduktion = Elektronenaufnahme (erweiterter Redoxbegriff).',
      'Beides läuft immer gleichzeitig ab (Redoxreaktion, Elektronenübertragung).',
      'Die Reaktion mit Sauerstoff ist ein Spezialfall; z. B. Na + Cl₂ → NaCl ist auch eine Redoxreaktion ohne Sauerstoff.',
      'Das Oxidationsmittel wird reduziert, das Reduktionsmittel wird oxidiert.',
    ],
    pitfalls: [
      'Oxidation als Elektronenaufnahme erklären.',
      'Oxidation und Reduktion als voneinander unabhängige Vorgänge darstellen.',
      'Das Oxidationsmittel als den Stoff bezeichnen, der oxidiert wird.',
    ],
    reference:
      'Dein Lehrer erweitert den alten Begriff. Früher hieß Oxidation „reagiert mit Sauerstoff“. Genauer betrachtet passiert dabei etwas mit Elektronen: Magnesium gibt beim Verbrennen Elektronen an den Sauerstoff ab. Deshalb gilt jetzt: Oxidation = Elektronen abgeben, Reduktion = Elektronen aufnehmen. Beides passiert immer zusammen – was einer abgibt, nimmt der andere auf. So ist auch Natrium + Chlor eine Redoxreaktion, ganz ohne Sauerstoff. Merksatz: „OIL RIG – Oxidation Is Loss, Reduction Is Gain.“ Welcher Stoff wird bei 2 Na + Cl₂ → 2 NaCl oxidiert?',
    task: null,
  },
  {
    id: 'c-stoechiometrie',
    subject: 'chemie',
    topic: 'Stöchiometrie: Stoffmenge, molare Masse, Massenberechnung',
    curriculum:
      'KMK Bildungsstandards Chemie MSA, Basiskonzept Stoff-Teilchen; Klasse 9/10: Stoffmenge und Reaktionsgleichungen quantitativ',
    ask: 'wie rechne ich aus wie viel gramm wasser aus 4 g wasserstoff entsteht? mit mol und so',
    facts: [
      'n = m / M; M(H₂) = 2 g/mol, M(H₂O) = 18 g/mol.',
      '2 H₂ + O₂ → 2 H₂O: Stoffmengenverhältnis H₂ : H₂O = 1 : 1.',
      '4 g H₂ = 2 mol H₂ → 2 mol H₂O = 36 g.',
      'Die Koeffizienten der Gleichung geben Stoffmengen-, nicht Massenverhältnisse an.',
    ],
    pitfalls: [
      'Massen direkt über die Koeffizienten ins Verhältnis setzen.',
      'M(H₂) = 1 g/mol.',
      'Die Reaktionsgleichung nicht ausgleichen.',
    ],
    reference:
      'Gramm kannst du nicht direkt vergleichen – die Gleichung zählt Teilchen, also Mol. Drei Schritte: 1) Gramm in Mol: n = m / M, also 4 g : 2 g/mol = 2 mol Wasserstoff. 2) Die ausgeglichene Gleichung 2 H₂ + O₂ → 2 H₂O sagt: aus 2 mol H₂ werden 2 mol H₂O, also 1 : 1. 3) Mol zurück in Gramm: m = n · M = 2 mol · 18 g/mol = 36 g Wasser. Wie viel Gramm Wasser entstehen aus 1 g Wasserstoff?',
    task: {
      kind: 'numeric',
      prompt:
        'Wie viel Gramm Wasser entstehen aus 4 g Wasserstoff ($2\\,H_2 + O_2 \\rightarrow 2\\,H_2O$; $M(H_2) = 2$ g/mol, $M(H_2O) = 18$ g/mol)?',
      answer: '36',
      unit: 'g',
      referencePath: ['m = (4 / 2) * 18', 'm = 2 * 18', 'm = 36'],
    },
  },
  {
    id: 'd-eroerterung',
    subject: 'deutsch',
    topic: 'Erörterung: linear und dialektisch, Aufbau und Argument',
    curriculum:
      'KMK Bildungsstandards Deutsch MSA, Kompetenzbereich Schreiben (argumentieren); Klasse 9/10: dialektische Erörterung',
    ask: 'wie schreib ich eine dialektische erörterung? also aufbau und was muss rein',
    facts: [
      'Einleitung (Hinführung zum Thema, Fragestellung), Hauptteil, Schluss (eigene Position, Abwägung).',
      'Dialektisch: Pro- und Kontra-Argumente; linear: nur eine Seite.',
      'Ein Argument besteht aus Behauptung (These), Begründung und Beispiel/Beleg.',
      'Steigernde Anordnung: die schwächeren Argumente der Gegenseite zuerst, das stärkste eigene Argument zuletzt (Sanduhr- oder Pingpong-Prinzip).',
    ],
    pitfalls: [
      'Die eigene Meinung in der Einleitung festlegen statt im Schluss abzuwägen.',
      'Beispiele als Argumente ausgeben ohne Begründung.',
      'Dialektisch und linear verwechseln.',
    ],
    reference:
      'Eine dialektische Erörterung wägt ab: Was spricht dafür, was dagegen – und wie siehst du es am Ende? Aufbau: In der Einleitung führst du zum Thema hin und stellst die Frage. Im Hauptteil kommen die Argumente beider Seiten, jedes nach dem Muster Behauptung – Begründung – Beispiel. Ordne steigernd: Erst die Seite, die du am Ende nicht vertrittst, dann deine, mit dem stärksten Argument zuletzt. Im Schluss wägst du ab und nennst deine Position. Zum Thema „Handys im Unterricht?“: Was wäre ein Argument dafür – mit Begründung und Beispiel?',
    task: {
      kind: 'long',
      prompt: 'Erörtere dialektisch: Sollen Handys im Unterricht erlaubt sein?',
      answer:
        'Eine dialektische Erörterung mit Einleitung, Pro- und Kontra-Argumenten und Schluss.',
      unit: null,
      referencePath: [],
    },
  },
  {
    id: 'e-reading',
    subject: 'englisch',
    topic: 'Reading: skimming and scanning, finding evidence',
    curriculum:
      'KMK Bildungsstandards Englisch MSA (B1), Leseverstehen; Klasse 10: Sachtexte global und im Detail verstehen',
    ask: 'how do i do the reading part in the english test faster? i always run out of time',
    facts: [
      'Skimming: den Text schnell überfliegen für den Gesamtsinn (Überschrift, erster/letzter Absatz, Themensätze).',
      'Scanning: gezielt nach einer bestimmten Information suchen (Namen, Zahlen, Schlüsselwörter).',
      'Erst die Aufgaben lesen, dann den Text — damit weiß man, wonach man sucht.',
      'Antworten mit Belegen aus dem Text (line numbers / quotes) stützen, wenn verlangt.',
    ],
    pitfalls: [
      'Raten, jedes Wort übersetzen zu müssen.',
      'Skimming und Scanning verwechseln.',
      'Eigene Meinung statt Textbeleg bei Verständnisfragen.',
    ],
    reference:
      'Read the tasks first – then you know what you are looking for. Next, skim the text: headline, first and last paragraph, the first sentence of each paragraph. That gives you the gist in two minutes. For each question, scan: look only for the key word, number or name, then read just the lines around it carefully. You do not need every word – guess unknown words from context and move on. Where the task asks for evidence, quote the line. Which task in your last test could you have answered by scanning?',
    task: null,
  },
  {
    id: 'e-writing',
    subject: 'englisch',
    topic: 'Writing: a comment / opinion essay with linking words',
    curriculum:
      'KMK Bildungsstandards Englisch MSA (B1), Schreiben; Klasse 10: comment, argumentative text',
    ask: 'we have to write a comment in english, how do i start and what do i need?',
    facts: [
      'Introduction: introduce the topic, state the question or your opinion.',
      'Main part: arguments with reasons and examples, one paragraph each.',
      'Conclusion: sum up and restate your opinion.',
      'Linking words (firstly, moreover, however, on the other hand, in conclusion) and opinion phrases (In my opinion, I believe).',
    ],
    pitfalls: [
      'Telling the learner to write in German first and translate word by word.',
      'Wrong linking words (e.g. "on the one side").',
      'Contractions and slang recommended for a formal comment.',
    ],
    reference:
      'A comment gives your opinion and backs it up. Start with one or two sentences that introduce the topic and ask the question, for example: "Should school start later? Many students think so." Then write two or three paragraphs, each with one argument, a reason and an example; link them with "Firstly", "Moreover", "However". Finish with a conclusion that sums up and says clearly what you think: "All in all, I believe …". Try it: what would be your first sentence for the topic "School uniforms"?',
    task: null,
  },
  {
    id: 'g-quellenarbeit',
    subject: 'geschichte',
    topic: 'Quellenarbeit: Text- und Bildquellen analysieren',
    curriculum:
      'Lehrpläne Geschichte Sek I (z. B. NRW Kernlehrplan, Methodenkompetenz); Klasse 9/10: Quellen beschreiben, einordnen, beurteilen',
    ask: 'wie analysiere ich eine quelle in geschichte? zb ne rede von 1933',
    facts: [
      'Unterscheidung Quelle (aus der Zeit) und Darstellung (später geschrieben).',
      'Schritte: Beschreiben (Autor, Adressat, Zeit, Art der Quelle, Thema), Untersuchen/Analysieren (Inhalt, Absicht, Sprache), Einordnen (historischer Kontext), Beurteilen.',
      'Die Absicht und Perspektive des Autors kritisch prüfen (z. B. Propaganda).',
      'Sachurteil und Werturteil unterscheiden.',
    ],
    pitfalls: [
      'Eine Quelle als neutrale Wahrheit behandeln.',
      'Quelle und Darstellung gleichsetzen.',
      'Den Inhalt nacherzählen ohne Absicht und Kontext.',
    ],
    reference:
      'Eine Quelle ist ein Stück aus der Zeit selbst – sie zeigt die Sicht dessen, der sie gemacht hat, nicht einfach „wie es war“. Geh in vier Schritten vor: 1) Beschreiben: Wer spricht, zu wem, wann, was für eine Quelle ist es, worum geht es? 2) Untersuchen: Was sagt die Rede, mit welchen Worten, und was will der Redner erreichen? 3) Einordnen: Was passierte 1933 gerade – und warum hält er die Rede jetzt? 4) Beurteilen: Stimmt, was er behauptet (Sachurteil)? Und wie bewertest du es heute (Werturteil)? Was wäre bei einer Rede von 1933 die wichtigste Frage zur Absicht des Redners?',
    task: null,
  },
];

/** The subjects issue #298 names — the set must cover each one. */
export const REQUIRED_SUBJECTS: readonly Subject[] = [
  'mathe',
  'physik',
  'chemie',
  'deutsch',
  'englisch',
  'geschichte',
];
